import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyCoverage, main, inspectNativeEvidence, verifyMechanical } from '../scripts/verify.mjs';
import { readCases } from '../plugin/scripts/cases.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const plugin = path.join(root, 'plugin');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function temporary(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'repo-governance-coverage-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(tmpdir()));
    assert.ok(path.basename(dir).startsWith('repo-governance-coverage-'));
    rmSync(dir, {recursive: true, force: true});
  });
  return dir;
}
function sourceCopy(t, fixtures = true) {
  const target = temporary(t);
  for (const name of ['plugin/SPEC.md', 'plugin/specs', ...(fixtures ? ['tests/cases'] : [])]) {
    mkdirSync(path.dirname(path.join(target, name)), {recursive: true});
    cpSync(path.join(root, name), path.join(target, name), {recursive: true});
  }
  return target;
}
function nativeFixture(t) {
  const target = sourceCopy(t, false);
  mkdirSync(path.join(target, 'plugin/skills/repo-governance/assets'), {recursive: true});
  const manifest = '{"schemaVersion":1,"version":"0.2.0","fixture":true}\n';
  writeFileSync(path.join(target, 'plugin/skills/repo-governance/assets/bundle.json'), manifest);
  const artifact = 'This is synthetic test data. It is not an actual native session.\n';
  writeFileSync(path.join(target, 'session.txt'), artifact);
  const evidence = {
    schemaVersion: 1, harness: 'codex', hostVersion: 'fixture', surface: 'desktop', sessionId: 'synthetic-test',
    bundleSha256: hash(manifest), observations: ['skill-use', 'mechanical-rejection', 'semantic-hold', 'host-limit'].map((kind, i) => ({
      caseIds: ['E' + (i + 1)], kind, note: 'Synthetic schema and artifact consistency fixture.',
      artifact: {path: 'session.txt', sha256: hash(artifact)},
    })),
  };
  const evidencePath = path.join(target, 'evidence.json');
  writeFileSync(evidencePath, JSON.stringify(evidence));
  return {target, evidence, evidencePath};
}

test('the single Markdown source provides all 163 detailed and 57 common cases without execution credit', () => {
  const result = verifyCoverage(root);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.catalogued, {detailed: 163, common: 57, total: 220});
  assert.equal(result.executedCases, 0);
  assert.equal(result.nativeVerified, false);
  assert.equal(result.mechanicalFixturesAvailable, 18);
  const source = readCases(plugin);
  assert.deepEqual(source.errors, []);
  assert.ok(source.cases.every(c => c.given.trim() && c.expected.trim() && c.source.path));
  assert.ok(source.cases.every(c => c.verification.execution === 'not-executed-by-catalogue'));
  assert.ok(source.cases.filter(c => c.ruleId).every(c => c.verification.requires[0] === 'working-agent-evidence'));
  assert.ok(source.cases.filter(c => !c.ruleId).every(c => c.verification.requires[0] === 'native-or-agent-evidence'));
  assert.equal(new Set(source.cases.map(c => c.id)).size, 220);
  for (const c of source.cases) {
    const line = readFileSync(path.join(plugin, c.source.path), 'utf8').split(/\r?\n/)[c.source.line - 1];
    assert.equal('| ' + c.id + ' | ' + c.given + ' | ' + c.expected + ' |', line, c.id + ': preserve the complete source text');
  }
  const fixtureOnly = JSON.parse(readFileSync(path.join(root, 'tests/cases/mechanical.json'), 'utf8'));
  assert.deepEqual(Object.keys(fixtureOnly).sort(), ['fixtures', 'rulesVersion', 'schemaVersion']);
});

test('the current canonical expectation is read directly without synchronizing a second copy', t => {
  const target = sourceCopy(t);
  const p = path.join(target, 'plugin/specs/naming.md');
  const before = readCases(path.join(target, 'plugin')).cases.find(c => c.id === 'N16');
  const next = '이 fixture의 원문 기대를 수정했다.';
  const rows = readFileSync(p, 'utf8').split(/\r?\n/);
  rows[before.source.line - 1] = '| N16 | ' + before.given + ' | ' + next + ' |';
  writeFileSync(p, rows.join('\n'));
  assert.equal(readCases(path.join(target, 'plugin')).cases.find(c => c.id === 'N16').expected, next);
  assert.deepEqual(verifyCoverage(target).errors, []);
});

test('blank lines move diagnostics without invalidating case identity or expectations', t => {
  const target = sourceCopy(t);
  const p = path.join(target, 'plugin/specs/naming.md');
  const view = source => source.cases.map(({id, given, expected}) => ({id, given, expected}));
  const before = readCases(path.join(target, 'plugin'));
  writeFileSync(p, '\n\n' + readFileSync(p, 'utf8'));
  const after = readCases(path.join(target, 'plugin'));
  assert.deepEqual(view(after), view(before));
  assert.equal(after.cases.find(c => c.id === 'N1').source.line, before.cases.find(c => c.id === 'N1').source.line + 2);
  assert.deepEqual(verifyCoverage(target).errors, []);
});

test('removing a case fails rather than shrinking the completion scope', t => {
  const target = sourceCopy(t);
  const p = path.join(target, 'plugin/SPEC.md');
  writeFileSync(p, readFileSync(p, 'utf8').replace(/^\| E7 \|.*(?:\r?\n|$)/m, ''));
  assert.ok(verifyCoverage(target).errors.some(e => e.startsWith('E7:')));
});

test('an unknown stable ID cannot replace an expected case', t => {
  const target = sourceCopy(t);
  const p = path.join(target, 'plugin/specs/naming.md');
  writeFileSync(p, readFileSync(p, 'utf8').replace('| N1 |', '| N999 |'));
  assert.ok(verifyCoverage(target).errors.some(e => e.startsWith('N1:')));
  assert.ok(verifyCoverage(target).errors.some(e => e.includes('N999')));
});

test('duplicate and misplaced case IDs and empty source columns fail coverage', t => {
  for (const kind of ['duplicate', 'misplaced', 'empty-condition', 'empty-expected']) {
    const target = sourceCopy(t);
    const p = path.join(target, 'plugin/specs/naming.md');
    const source = readFileSync(p, 'utf8');
    const row = source.split(/\r?\n/).find(line => line.startsWith('| N1 |'));
    assert.ok(row);
    if (kind === 'duplicate') writeFileSync(p, source + '\n' + row + '\n');
    if (kind === 'misplaced') {
      const other = path.join(target, 'plugin/specs/description.md');
      writeFileSync(other, readFileSync(other, 'utf8') + '\n' + row + '\n');
    }
    if (kind === 'empty-condition' || kind === 'empty-expected') {
      const c = readCases(path.join(target, 'plugin')).cases.find(c => c.id === 'N1');
      writeFileSync(p, source.replace(row, '| N1 | ' + (kind === 'empty-condition' ? '' : c.given) + ' | ' + (kind === 'empty-expected' ? '' : c.expected) + ' |'));
    }
    assert.ok(verifyCoverage(target).errors.some(e => e.startsWith('N1:')), kind);
  }
});

test('catalogue rows reject extra or missing cells instead of absorbing them into a source field', async t => {
  const rows = [
    ['extra cell after empty expected', '| N1 | condition |  | extra contents |'],
    ['extra cell after empty condition', '| N1 |  | expected | extra contents |'],
    ['extra cell after two nonempty values', '| N1 | condition | expected | extra contents |'],
    ['extra empty cell', '| N1 | condition | expected | |'],
    ['missing expected cell', '| N1 | condition |'],
    ['unescaped pipe in condition', '| N1 | left|right | expected |'],
    ['unescaped pipe in expected', '| N1 | condition | left|right |'],
    ['unescaped pipe in code span', '| N1 | `left|right` | expected |'],
  ];
  for (const [name, row] of rows) await t.test(name, t => {
    const target = sourceCopy(t);
    const p = path.join(target, 'plugin/specs/naming.md');
    writeFileSync(p, readFileSync(p, 'utf8').replace(/^\| N1 \|.*$/m, row));
    const result = verifyCoverage(target);
    assert.equal(result.decision, 'error');
    assert.ok(result.errors.some(e => e.startsWith('N1: source row')), JSON.stringify(result.errors));
  });
});

test('catalogue rows preserve table pipe escapes before inline backslash and code-span processing', async t => {
  const values = [
    ...[1, 2, 3, 4].map(count => ['pipe after ' + count + ' backslashes', 'left' + '\\'.repeat(count) + '|right']),
    ['escaped pipe in code span', '`left\\|right`'],
    ['escaped pipe in multi-backtick code span', '``left`\\|right``'],
    ['escaped pipe in emphasis', '**left\\|right**'],
  ];
  for (const [name, value] of values) await t.test(name, t => {
    const target = sourceCopy(t);
    const p = path.join(target, 'plugin/specs/naming.md');
    const given = 'condition ' + value;
    const expected = 'result ' + value;
    writeFileSync(p, readFileSync(p, 'utf8').replace(/^\| N1 \|.*$/m, '| N1 | ' + given + ' | ' + expected + ' |'));
    assert.deepEqual(verifyCoverage(target).errors, []);
    const c = readCases(path.join(target, 'plugin')).cases.find(c => c.id === 'N1');
    assert.equal(c.given, given);
    assert.equal(c.expected, expected);
  });
});

test('break-only cells remain empty beside an escaped pipe in the other source column', async t => {
  for (const column of ['condition', 'expected']) await t.test(column, t => {
    const target = sourceCopy(t);
    const p = path.join(target, 'plugin/specs/naming.md');
    const values = column === 'condition' ? ['<br> <br />', 'result\\|value'] : ['condition\\|value', '<br> <br />'];
    writeFileSync(p, readFileSync(p, 'utf8').replace(/^\| N1 \|.*$/m, '| N1 | ' + values.join(' | ') + ' |'));
    assert.ok(verifyCoverage(target).errors.includes('N1: condition and expected result must be nonempty'));
  });
});

test('orphan or misleading fixture references fail catalogue validation', t => {
  const target = sourceCopy(t);
  const p = path.join(target, 'tests/cases/mechanical.json');
  const catalogue = JSON.parse(readFileSync(p, 'utf8'));
  catalogue.fixtures[0].sourceCaseIds = ['FILE1'];
  writeFileSync(p, JSON.stringify(catalogue));
  assert.ok(verifyCoverage(target).errors.some(e => e.includes('fixture')));
});

test('duplicate fixtures and missing positive or negative checker coverage fail validation', t => {
  const target = sourceCopy(t);
  const p = path.join(target, 'tests/cases/mechanical.json');
  const catalogue = JSON.parse(readFileSync(p, 'utf8'));
  const original = structuredClone(catalogue);
  catalogue.fixtures.push(catalogue.fixtures[0]);
  writeFileSync(p, JSON.stringify(catalogue));
  assert.ok(verifyCoverage(target).errors.some(e => e.includes('duplicate fixture')));
  original.fixtures = original.fixtures.filter(f => !(f.check === 'name' && f.expected.decision === 'violation'));
  writeFileSync(p, JSON.stringify(original));
  assert.ok(verifyCoverage(target).errors.some(e => e.includes('no executable violation fixture')));
});

test('source checkouts without development fixtures explicitly refuse development verification', t => {
  const target = sourceCopy(t, false);
  for (const mode of ['coverage', 'mechanical']) {
    const result = main([mode], target);
    assert.equal(result.exitCode, 1);
    assert.equal(result.report.decision, 'error');
    assert.match(result.report.message, /source checkout/);
    assert.equal(result.report.executedFixtures, undefined);
  }
});

test('the shared skill resolves its actual rule and template links from a copied full bundle', t => {
  const target = temporary(t);
  for (const name of ['skills/repo-governance/SKILL.md', 'skills/repo-governance/references', 'specs', 'templates']) {
    mkdirSync(path.dirname(path.join(target, name)), {recursive: true});
    cpSync(path.join(plugin, name), path.join(target, name), {recursive: true});
  }
  const p = path.join(target, 'skills/repo-governance/SKILL.md');
  const links = [...readFileSync(p, 'utf8').matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)].map(m => m[1]);
  for (const spec of ['naming','description','readme','commits','branches','pull-requests','file-inclusion'])
    assert.ok(links.includes('../../specs/' + spec + '.md'));
  for (const template of ['README','PULL_REQUEST'])
    assert.ok(links.includes('../../templates/' + template + '.md'));
  for (const link of links) assert.ok(existsSync(path.resolve(path.dirname(p), link)), link);
});

test('native commands without evidence stay unverified for all three hosts', () => {
  for (const harness of ['codex', 'claude-code', 'pi']) {
    const {report, exitCode} = main(['native', '--harness', harness], root);
    assert.equal(exitCode, 3);
    assert.equal(report.status, 'unverified');
    assert.equal(report.nativeVerified, false);
    assert.ok(report.instructions.length >= 4);
  }
});

test('actual verifier CLI reports native procedure and noncompletion without starting a host', () => {
  const p = spawnSync(process.execPath, [path.join(plugin, 'scripts/verify.mjs'), 'native', '--harness', 'codex'], {encoding: 'utf8', timeout: 10000});
  assert.equal(p.status, 3);
  const report = JSON.parse(p.stdout);
  assert.equal(report.status, 'unverified');
  assert.equal(report.nativeVerified, false);
});

test('consistent synthetic artifacts receive consistency credit only, never native verification', t => {
  const {target, evidencePath} = nativeFixture(t);
  const result = inspectNativeEvidence('codex', evidencePath, target);
  assert.equal(result.status, 'evidence-consistent');
  assert.equal(result.scope, 'provided-artifact-consistency');
  assert.equal(result.nativeVerified, false);
  assert.equal(result.inspected.length, 4);
  assert.equal(existsSync(path.join(target, 'tests')), false);
  assert.equal(result.procedure, path.join(target, 'plugin/skills/repo-governance/references/native-verification.md'));
});

test('missing native observation categories remain incomplete despite a valid artifact hash', t => {
  const {target, evidence, evidencePath} = nativeFixture(t);
  evidence.observations = evidence.observations.slice(0, 1);
  writeFileSync(evidencePath, JSON.stringify(evidence));
  const result = inspectNativeEvidence('codex', evidencePath, target);
  assert.equal(result.status, 'evidence-incomplete');
  assert.deepEqual(result.missingObservationKinds, ['mechanical-rejection', 'semantic-hold', 'host-limit']);
});

test('changed native artifact bytes and a changed bundle pin reject evidence reuse', t => {
  const {target, evidence, evidencePath} = nativeFixture(t);
  writeFileSync(path.join(target, 'session.txt'), 'Changed bytes.\n');
  assert.throws(() => inspectNativeEvidence('codex', evidencePath, target), /hash mismatch/);
  evidence.bundleSha256 = '0'.repeat(64);
  writeFileSync(evidencePath, JSON.stringify(evidence));
  assert.throws(() => inspectNativeEvidence('codex', evidencePath, target), /bundle differs/);
});

test('Codex CLI artifacts cannot satisfy the Desktop evidence input', t => {
  const {target, evidence, evidencePath} = nativeFixture(t);
  evidence.surface = 'cli';
  writeFileSync(evidencePath, JSON.stringify(evidence));
  assert.throws(() => inspectNativeEvidence('codex', evidencePath, target), /CLI is not Desktop/);
});

test('malformed, duplicate, and unexpected verifier options fail', () => {
  for (const args of [[], ['coverage', '--evidence', 'x'], ['native'], ['native', '--harness', 'unknown'], ['native', '--harness', 'pi', '--harness', 'pi'], ['native', '--harness', 'pi', '--evidence']]) {
    assert.equal(main(args, root).exitCode, 1, JSON.stringify(args));
  }
});

test('catalogue fixtures execute all seven mechanical checks through the actual CLI', () => {
  const result = verifyMechanical(root);
  assert.equal(result.decision, 'pass', JSON.stringify(result.results.filter(r => !r.passed)));
  assert.equal(result.executedFixtures, result.passedFixtures);
  assert.equal(new Set(result.results.map(r => r.check)).size, 7);
  assert.equal(result.cataloguedCasesExecutedInFull, 0);
  assert.equal(result.nativeVerified, false);
  assert.ok(result.results.every(r => r.unchanged));
});
