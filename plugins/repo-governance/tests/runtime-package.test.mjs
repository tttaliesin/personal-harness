import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifestName = 'skills/repo-governance/assets/bundle.json';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const command = (file, args, cwd, input) => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== 'NODE_TEST_CONTEXT'));
  const result = spawnSync(file, args, { cwd, input, env, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  assert.ifError(result.error);
  return result;
};
const node = (at, args, input) => command(process.execPath, args, at, input);
function npmCli() {
  const candidates = [process.env.npm_execpath, join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), join(dirname(dirname(process.execPath)), 'lib/node_modules/npm/bin/npm-cli.js')];
  const found = candidates.find(file => file && /npm-cli\.[cm]?js$/.test(file) && existsSync(file));
  assert.ok(found, 'The installed npm CLI is required for actual package verification.');
  return found;
}
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'governance-runtime-package-'));
  t.after(() => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('governance-runtime-package-'));
    rmSync(directory, { recursive: true, force: true });
  });
  const checkout = join(directory, 'source');
  mkdirSync(checkout);
  for (const name of ['plugin', 'scripts', 'package.json', 'Taskfile.yml'])
    cpSync(join(root, name), join(checkout, name), { recursive: true });
  const built = node(checkout, ['scripts/bundle.mjs', 'build']);
  assert.equal(built.status, 0, built.stdout + built.stderr);
  return { directory, checkout, runtime: join(checkout, 'plugin') };
}
function inspect(at, text, productPath) {
  const request = { schemaVersion: 3, operation: 'check', check: 'name', sources: [{ kind: 'text', text }], context: {
    bundlePath: join(at, manifestName), ...(productPath ? { productPath } : {})
  } };
  const result = node(at, ['skills/repo-governance/scripts/check.mjs'], JSON.stringify(request));
  return { ...result, report: JSON.parse(result.stdout) };
}
function inspectReadme(at) {
  const request = { schemaVersion: 3, operation: 'check', check: 'readme', sources: [{ kind: 'file', path: 'README.md' }], context: {
    repository: at, bundlePath: join(at, manifestName)
  } };
  const result = node(at, ['skills/repo-governance/scripts/check.mjs'], JSON.stringify(request));
  return { ...result, report: JSON.parse(result.stdout) };
}

test('test-only changes leave the runtime manifest and existing product pin unchanged', t => {
  const { directory, checkout, runtime } = fixture(t);
  const before = readFileSync(join(runtime, manifestName));
  const productPath = join(directory, 'product.json');
  writeFileSync(productPath, JSON.stringify({ schemaVersion: 1, bundle: { version: '0.2.0', sha256: sha(before) }, outputBoundaries: [] }));
  assert.equal(inspect(runtime, 'product-inventory-api', productPath).status, 0);
  mkdirSync(join(checkout, 'tests'));
  writeFileSync(join(checkout, 'tests/extra.test.mjs'), 'throw Error("A test is not a runtime resource.");\n');
  const built = node(checkout, ['scripts/bundle.mjs', 'build']);
  assert.equal(built.status, 0, built.stdout + built.stderr);
  assert.deepEqual(readFileSync(join(runtime, manifestName)), before);
  assert.equal(inspect(runtime, 'product-inventory-api', productPath).status, 0);
  writeFileSync(join(checkout, 'tests/extra.test.mjs'), '\nA changed test.\n');
  const verified = node(checkout, ['scripts/bundle.mjs', 'verify']);
  assert.equal(verified.status, 0, verified.stdout + verified.stderr);
  assert.deepEqual(readFileSync(join(runtime, manifestName)), before);
  const changedRule = join(runtime, 'specs/naming.md');
  writeFileSync(changedRule, readFileSync(changedRule, 'utf8') + '\nChanged runtime rule.\n');
  const mismatch = inspect(runtime, 'product-inventory-api', productPath);
  assert.equal(mismatch.report.decision, 'needs-context');
  assert.ok(mismatch.report.findings.some(item => item.message.includes('Bundle digest mismatch: specs/naming.md')));
});

test('synthetic execution artifacts do not change the runtime manifest or product pin', t => {
  const { directory, checkout, runtime } = fixture(t);
  const before = readFileSync(join(runtime, manifestName));
  const productPath = join(directory, 'product.json');
  writeFileSync(productPath, JSON.stringify({ schemaVersion: 1, bundle: { version: '0.2.0', sha256: sha(before) }, outputBoundaries: [] }));
  const record = join(checkout, 'docs/verification.md');
  mkdirSync(dirname(record), { recursive: true });
  writeFileSync(join(checkout, 'scripts/dev-only.mjs'), '// Fixture for source tooling.\n');
  for (const content of ['# Synthetic execution record\n\nUnpackaged fixture data.\n', '# Changed execution record\n\nUnpackaged fixture data changed.\n']) {
    writeFileSync(record, content);
    const built = node(checkout, ['scripts/bundle.mjs', 'build']);
    assert.equal(built.status, 0, built.stdout + built.stderr);
    assert.deepEqual(readFileSync(join(runtime, manifestName)), before);
    const checked = inspect(runtime, 'product-inventory-api', productPath);
    assert.equal(checked.status, 0, checked.stdout + checked.stderr);
    assert.equal(checked.report.decision, 'pass');
  }
  rmSync(record);
  const built = node(checkout, ['scripts/bundle.mjs', 'build']);
  assert.equal(built.status, 0, built.stdout + built.stderr);
  assert.deepEqual(readFileSync(join(runtime, manifestName)), before);
  assert.equal(inspect(runtime, 'product-inventory-api', productPath).report.decision, 'pass');

  const method = join(runtime, 'skills/repo-governance/references/verification.md');
  writeFileSync(method, readFileSync(method, 'utf8') + '\nChanged runtime verification contract.\n');
  const mismatch = inspect(runtime, 'product-inventory-api', productPath);
  assert.equal(mismatch.report.decision, 'needs-context');
  assert.ok(mismatch.report.findings.some(item => item.message.includes('Bundle digest mismatch: skills/repo-governance/references/verification.md')));
});

test('an actual npm archive runs checks and linked instructions without source records or test sources', t => {
  const { directory, checkout, runtime } = fixture(t);
  for (const [name, contents] of [
    ['docs/verification.md', '# Synthetic execution record\n\nPRIVATE-SOURCE-EVIDENCE\n'],
    ['docs/verification/session.jsonl', '{"private":"source-only verification artifact"}\n'],
    ['.audit/private-session.jsonl', '{"private":"local session"}\n'],
    ['.scratch/native-run.json', '{"private":"local fixture"}\n']
  ]) {
    const target = join(checkout, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  const packed = node(runtime, [npmCli(), 'pack', '--ignore-scripts', '--json', '--pack-destination', directory]);
  assert.equal(packed.status, 0, packed.stdout + packed.stderr);
  const [archive] = JSON.parse(packed.stdout);
  const manifest = JSON.parse(readFileSync(join(runtime, manifestName), 'utf8'));
  assert.deepEqual(archive.files.map(file => file.path).sort(), [...manifest.files.map(file => file.path), manifestName].sort());
  assert.ok(archive.files.every(file => !file.path.startsWith('tests/') && !/\.test\.[cm]?[jt]s$/.test(file.path)));
  assert.ok(archive.files.every(file => !['docs/', '.audit/', '.scratch/'].some(prefix => file.path.startsWith(prefix))));
  const extracted = join(directory, 'unpacked');
  mkdirSync(extracted);
  const unpacked = command('tar', ['-xf', join(directory, archive.filename), '-C', extracted], directory);
  assert.equal(unpacked.status, 0, unpacked.stdout + unpacked.stderr);
  const installed = join(extracted, 'package');
  assert.equal(existsSync(join(installed, 'tests')), false);
  assert.equal(existsSync(join(installed, 'hooks/git')), false);
  for (const excluded of ['docs/verification.md', 'docs/verification/session.jsonl', '.audit/private-session.jsonl', '.scratch/native-run.json'])
    assert.equal(existsSync(join(installed, excluded)), false, excluded);
  for (const name of ['.codex-plugin/plugin.json', '.claude-plugin/plugin.json', '.pi/extensions/repo-governance.ts',
    'hooks/codex.json', 'hooks/claude-code.json', 'skills/repo-governance/scripts/vendor/markdown-it.LICENSE',
    'skills/repo-governance/references/verification.md', 'skills/repo-governance/references/native-verification.md']) assert.ok(existsSync(join(installed, name)), name);
  assert.equal(inspect(installed, 'product-inventory-api').report.decision, 'pass');
  assert.equal(inspect(installed, 'Bad_Name').report.decision, 'violation');
  const readme = inspectReadme(installed);
  assert.equal(readme.report.decision, 'pass', readme.stdout + readme.stderr);
  const skill = join(installed, 'skills/repo-governance/SKILL.md');
  const links = [...readFileSync(skill, 'utf8').matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)].map(match => match[1]);
  assert.ok(links.length > 0);
  for (const link of links) assert.ok(existsSync(resolve(dirname(skill), link)), link);
  const verify = node(installed, ['scripts/bundle.mjs', 'verify']);
  assert.equal(verify.status, 0, verify.stdout + verify.stderr);
  const doctor = node(installed, ['scripts/task-cli.mjs', 'doctor']);
  assert.equal(doctor.status, 0, doctor.stdout + doctor.stderr);
  const product = node(installed, ['scripts/task-cli.mjs', 'show-product']);
  assert.equal(product.status, 0, product.stdout + product.stderr);
  assert.deepEqual(JSON.parse(product.stdout), {schemaVersion: 1, sources: [], outputBoundaries: []});
  const normal = node(installed, ['scripts/task-cli.mjs', 'demo']);
  assert.equal(normal.status, 0, normal.stdout + normal.stderr);
  for (const run of [node(installed, [npmCli(), 'test', '--', '--test-concurrency=1']),
    command(process.platform === 'win32' ? 'task.exe' : 'task', ['--exit-code', 'test'], installed)]) {
    assert.notEqual(run.status, 0, run.stdout + run.stderr);
    assert.doesNotMatch(run.stdout, /# pass 0/);
  }
  const native = node(installed, ['scripts/verify.mjs', 'native', '--harness', 'codex']);
  assert.equal(native.status, 3, native.stdout + native.stderr);
  assert.equal(JSON.parse(native.stdout).status, 'unverified');
  assert.ok(existsSync(JSON.parse(native.stdout).procedure));
  for (const mode of ['coverage', 'mechanical']) {
    const sourceOnly = node(installed, ['scripts/verify.mjs', mode]);
    assert.notEqual(sourceOnly.status, 0, sourceOnly.stdout + sourceOnly.stderr);
  }
  const artifact = 'Synthetic artifact consistency fixture. No real model session was run.\n';
  writeFileSync(join(directory, 'session.txt'), artifact);
  const evidencePath = join(directory, 'evidence.json');
  writeFileSync(evidencePath, JSON.stringify({ schemaVersion: 1, harness: 'codex', hostVersion: 'fixture', surface: 'desktop',
    sessionId: 'synthetic-test', bundleSha256: sha(readFileSync(join(installed, manifestName))),
    observations: ['skill-use', 'mechanical-rejection', 'semantic-hold', 'host-limit'].map((kind, i) => ({
      caseIds: ['E' + (i + 1)], kind, note: 'Synthetic artifact schema check.', artifact: { path: 'session.txt', sha256: sha(artifact) }
    })) }));
  const evidence = node(installed, ['scripts/verify.mjs', 'native', '--harness', 'codex', '--evidence', evidencePath]);
  assert.equal(evidence.status, 0, evidence.stdout + evidence.stderr);
  assert.equal(JSON.parse(evidence.stdout).status, 'evidence-consistent');
  assert.equal(JSON.parse(evidence.stdout).nativeVerified, false);
});

test('source test commands forward Node test arguments and execute selected tests', t => {
  const { checkout } = fixture(t);
  mkdirSync(join(checkout, 'tests'));
  writeFileSync(join(checkout, 'tests/bridge.test.mjs'), "import test from 'node:test';\ntest('selected',()=>{});\ntest('unselected',()=>{throw Error('Node test-name filtering was lost');});\n");
  const testArgs = ['--test-reporter=tap', '--test-concurrency=1', '--test-name-pattern=^selected$'];
  for (const run of [node(checkout, [npmCli(), 'test', '--', ...testArgs]),
    command(process.platform === 'win32' ? 'task.exe' : 'task', ['--exit-code', 'test', '--', ...testArgs], checkout)]) {
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /# pass 1/);
  }
});
