import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../plugin/', import.meta.url));
const template = await readFile(join(root, 'templates/github-actions.yml'), 'utf8');
const match = /^\s+node --input-type=module <<'NODE'\r?\n([\s\S]*?)^\s+NODE\s*$/m.exec(template);
assert.ok(match, 'The actual CI template must expose its Node check script.');
const lines = match[1].split(/\r?\n/);
const width = Math.min(...lines.filter(line => line.trim()).map(line => /^\s*/.exec(line)[0].length));
const script = lines.map(line => line.slice(width)).join('\n');
const body = '## 배경\n\n가격 계산이 필요합니다.\n\n## 변경 내용\n\n계산 함수를 추가했습니다.\n\n## 검증\n\n이 fixture는 명령 경계만 시험하며 실제 서비스 검증은 미수행입니다.\n\n## 영향\n\n새 계산 함수를 제공합니다.\n';

test('CI refuses a mutable governance ref before loading the common repository', () => {
  const validation = /node -e "([^"\r\n]+)"/.exec(template);
  assert.ok(validation);
  for (const [ref, expected] of [['a'.repeat(40), 0], ['main', 1], ['v0.2.0', 1], ['', 1]]) {
    const result = spawnSync(process.execPath, ['-e', validation[1]], { encoding: 'utf8', env: { ...process.env, REPO_GOVERNANCE_REF: ref }, windowsHide: true });
    assert.equal(result.status, expected, result.stderr);
  }
});

async function fixture({ legacyLayout = false, withProduct = true } = {}) {
  const workspace = await mkdtemp(join(tmpdir(), 'governance-ci-'));
  const governance = legacyLayout ? join(workspace, 'governance') : join(workspace, 'governance', 'plugin');
  const repository = join(workspace, 'product');
  const emptyHooks = join(workspace, 'empty-hooks');
  await mkdir(emptyHooks);
  await mkdir(join(repository, 'src'), { recursive: true });
  await mkdir(join(repository, '.repo-governance'));
  const manifestRelative = 'skills/repo-governance/assets/bundle.json';
  const bytes = await readFile(join(root, manifestRelative));
  const manifest = JSON.parse(bytes);
  for (const path of [...manifest.files.map(file => file.path), manifestRelative]) {
    const to = join(governance, path);
    await mkdir(dirname(to), { recursive: true });
    await copyFile(join(root, path), to);
  }
  const git = args => execFileSync('git', ['-C', repository, '-c', 'core.hooksPath=' + emptyHooks, '-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid', ...args], { encoding: 'utf8', windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }).trim();
  const productPath = join(repository, '.repo-governance/product.json');
  if (withProduct) await writeFile(productPath, JSON.stringify({ schemaVersion: 1, bundle: { version: manifest.version, sha256: createHash('sha256').update(bytes).digest('hex') }, outputBoundaries: [{ path: '.cache', purpose: '이번 fixture의 재생성 출력', lifetime: '시험 종료까지' }] }));
  await writeFile(join(repository, '.gitignore'), '.cache/\n');
  await writeFile(join(repository, 'src/product.mjs'), 'export const base = 1;\n');
  await mkdir(join(repository, '.cache'));
  await writeFile(join(repository, '.cache/run.log'), '과거부터 추적한 출력입니다.\n');
  git(['init', '--quiet', '--initial-branch=main']);
  git(['add', '.']);
  git(['add', '-f', '.cache/run.log']);
  const commit = message => git(['commit', '--quiet', '-m', message]);
  commit('test: CI 기준을 준비한다');
  const baseOid = git(['rev-parse', 'HEAD']);
  git(['checkout', '--quiet', '-b', 'feature']);
  await writeFile(join(repository, 'src/price.mjs'), 'export const price = value => value * 2;\n');
  git(['add', 'src/price.mjs']);
  commit('feat: 가격 계산을 추가한다');
  const headOid = git(['rev-parse', 'HEAD']);
  const eventPath = join(workspace, 'event.json');
  async function execute(head, prBody, base = baseOid) {
    await writeFile(eventPath, JSON.stringify({ pull_request: { number: 17, head: { sha: head }, base: { sha: base }, title: '가격 계산 추가', body: prBody } }));
    const before = { head: git(['rev-parse', 'HEAD']), index: await readFile(join(repository, '.git/index')), source: await readFile(join(repository, 'src/price.mjs')) };
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: workspace, encoding: 'utf8', windowsHide: true, timeout: 30000, env: { ...process.env, GITHUB_EVENT_PATH: eventPath, REPO_GOVERNANCE_PRODUCT: productPath } });
    assert.ifError(result.error);
    assert.equal(git(['rev-parse', 'HEAD']), before.head);
    assert.deepEqual(await readFile(join(repository, '.git/index')), before.index);
    assert.deepEqual(await readFile(join(repository, 'src/price.mjs')), before.source);
    return { ...result, reports: result.stdout.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) };
  }
  return { repository, git, commit, execute, baseOid, headOid };
}

test('the new CI template runs with the previous source layout', async () => {
  const { execute, headOid } = await fixture({ legacyLayout: true });
  const result = await execute(headOid, body);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(result.reports.map(report => [report.check, report.decision]), [
    ['pull-request', 'pass'],
    ['file-scope', 'pass']
  ]);
});

test('the CI template checks the PR and its revision without a product input', async () => {
  const { execute, headOid } = await fixture({ withProduct: false });
  const result = await execute(headOid, body);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(result.reports.map(report => [report.check, report.decision]), [['pull-request', 'pass'], ['file-scope', 'pass']]);
  assert.ok(result.reports.every(report => report.observed.every(item => item.kind !== 'product')));
});

test('the actual CI script inspects fixed Git revisions and supplied PR data without changing the product', async () => {
  const { repository, git, commit, execute, headOid } = await fixture();
  const normal = await execute(headOid, body);
  assert.equal(normal.status, 0, normal.stdout + normal.stderr);
  assert.deepEqual(normal.reports.map(report => report.decision), ['pass', 'pass']);
  const invalidBody = await execute(headOid, '변경을 확인했습니다.\n\n```sh\nnpm test\n');
  assert.equal(invalidBody.status, 2, invalidBody.stdout + invalidBody.stderr);
  assert.equal(invalidBody.reports[0].decision, 'violation');
  assert.ok(invalidBody.reports[0].findings.some(finding => finding.code === 'code-fence'));
  await writeFile(join(repository, '.cache/run.log'), '이번 실행의 결과입니다.\n');
  git(['add', '-f', '.cache/run.log']);
  commit('test: 제외 대상 fixture를 준비한다');
  const invalidFiles = await execute(git(['rev-parse', 'HEAD']), body);
  assert.equal(invalidFiles.status, 2, invalidFiles.stdout + invalidFiles.stderr);
  assert.ok(invalidFiles.reports[1].findings.some(finding => finding.code === 'included-output'));
});

test('CI compares a diverged PR head with its merge base and preserves the actual base tip metadata', async () => {
  const { repository, git, commit, execute, baseOid: commonOid, headOid } = await fixture();
  git(['checkout', '--quiet', 'main']);
  await writeFile(join(repository, '.cache/run.log'), 'base 브랜치에서만 바꾼 출력입니다.\n');
  git(['add', '-f', '.cache/run.log']);
  commit('test: base 브랜치의 출력만 바꾼다');
  const baseOid = git(['rev-parse', 'HEAD']);
  git(['checkout', '--quiet', 'feature']);
  assert.deepEqual(git(['diff', '--name-only', baseOid + '...' + headOid]).split(/\r?\n/), ['src/price.mjs']);
  const sourceOnly = await execute(headOid, body, baseOid);
  assert.equal(sourceOnly.status, 0, sourceOnly.stdout + sourceOnly.stderr);
  assert.deepEqual(sourceOnly.reports.map(report => report.decision), ['pass', 'pass']);
  assert.equal(sourceOnly.reports[0].observed.find(item => item.kind === 'pr-base').digestOrOid, baseOid);
  assert.equal(sourceOnly.reports[0].observed.find(item => item.kind === 'pr-head').digestOrOid, headOid);
  assert.equal(sourceOnly.reports[1].observed.find(item => item.kind === 'base').digestOrOid, commonOid);
  await writeFile(join(repository, '.cache/run.log'), 'PR head에서 바꾼 출력입니다.\n');
  git(['add', '-f', '.cache/run.log']);
  commit('test: PR head의 출력 변경을 준비한다');
  const outputChange = await execute(git(['rev-parse', 'HEAD']), body, baseOid);
  assert.equal(outputChange.status, 2, outputChange.stdout + outputChange.stderr);
  assert.ok(outputChange.reports[1].findings.some(finding => finding.code === 'included-output'));
});

test('CI verifies both event OIDs as full available commits before checking supplied PR data', async () => {
  const { git, execute, baseOid, headOid } = await fixture();
  git(['tag', '--annotate', 'fixture-tag', '--message', 'tag object', headOid]);
  const tagOid = git(['rev-parse', 'refs/tags/fixture-tag']);
  for (const [head, base] of [[headOid.slice(0, 12), baseOid], [headOid, baseOid.slice(0, 12)], ['f'.repeat(40), baseOid], [headOid, 'f'.repeat(40)], [tagOid, baseOid], [headOid, tagOid]]) {
    const result = await execute(head, body, base);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.deepEqual(result.reports, []);
    assert.match(result.stderr, /PR (?:head|base).*commit/);
    assert.ok(result.stderr.length < 4096, result.stderr);
  }
});

test('CI rejects a missing or ambiguous merge base before running either checker', async () => {
  const { git, execute, baseOid, headOid } = await fixture();
  const tree = git(['rev-parse', baseOid + '^{tree}']);
  const commitTree = (message, parents = []) => git(['commit-tree', tree, ...parents.flatMap(parent => ['-p', parent]), '-m', message]);
  const orphan = commitTree('unrelated history');
  const left = commitTree('left history', [baseOid]);
  const right = commitTree('right history', [baseOid]);
  const firstMerge = commitTree('first merge', [left, right]);
  const secondMerge = commitTree('second merge', [right, left]);
  assert.equal(git(['merge-base', '--all', firstMerge, secondMerge]).split(/\r?\n/).length, 2);
  for (const [head, base] of [[headOid, orphan], [firstMerge, secondMerge]]) {
    const result = await execute(head, body, base);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.deepEqual(result.reports, []);
    assert.match(result.stderr, /PR merge base/);
    assert.ok(result.stderr.length < 4096, result.stderr);
  }
});
