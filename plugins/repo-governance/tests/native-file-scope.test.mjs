import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { evaluateNativeCall } from '../plugin/skills/repo-governance/scripts/tool-call.mjs';
import { runCheck } from '../plugin/skills/repo-governance/scripts/check.mjs';

const root = fileURLToPath(new URL('../plugin/', import.meta.url));
const bundlePath = join(root, 'skills/repo-governance/assets/bundle.json');
const content = '# 가격 도구\n\n제품 가격을 확인합니다.\n\n## 사용\n\n[입력 계약](docs/guide.md#계약)을 읽습니다.\n';
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'governance-file-call-'));
  const repository = join(directory, 'product');
  await mkdir(join(repository, 'docs'), { recursive: true });
  await mkdir(join(repository, 'src'));
  await writeFile(join(repository, 'docs/guide.md'), '# 계약\n\n가격 입력을 설명합니다.\n');
  execFileSync('git', ['-C', repository, 'init', '--quiet'], { windowsHide: true });
  const bytes = await readFile(bundlePath);
  const productPath = join(directory, 'product.json');
  await writeFile(productPath, JSON.stringify({ schemaVersion: 1, bundle: { version: '0.2.0', sha256: createHash('sha256').update(bytes).digest('hex') }, outputBoundaries: [] }));
  return { directory, repository, options: { repository, productPath, bundlePath } };
}

test('a README draft may contain links that have yet to be created', async () => {
  const { repository, options } = await fixture();
  const path = join(repository, 'README.md');
  const result = await evaluateNativeCall('Write', { file_path: path, content }, options);
  assert.equal(result.decision, 'allow', JSON.stringify(result));
  assert.deepEqual(result.checks.map(check => check.check), ['file-scope']);
  assert.ok(result.checks.every(check => check.scope === 'mechanical' && check.semanticChecks.length));
  await assert.rejects(access(path), { code: 'ENOENT' });
  const missing = await evaluateNativeCall('Write', { file_path: path, content: content.replace('docs/guide.md', 'docs/absent.md') }, options);
  assert.equal(missing.decision, 'allow', JSON.stringify(missing));
  const noBase = JSON.parse((await runCheck(JSON.stringify({ schemaVersion: 3, operation: 'check', check: 'readme', sources: [{ kind: 'text', text: content }], context: { bundlePath } }))).line);
  assert.equal(noBase.decision, 'needs-context');
});

test('an explicit check of a nested README resolves links from the file directory', async () => {
  const { repository } = await fixture();
  const path = join(repository, 'docs/README.md');
  const check = async () => JSON.parse((await runCheck(JSON.stringify({ schemaVersion: 3, operation: 'check', check: 'readme', sources: [{ kind: 'file', path }], context: { repository, bundlePath } }))).line);
  await writeFile(path, content);
  const broken = await check();
  assert.equal(broken.decision, 'violation', JSON.stringify(broken));
  assert.ok(broken.findings.some(item => item.code === 'link-missing'));
  await writeFile(path, '# 개발 안내\n\n[계약](guide.md#계약)을 읽습니다.\n');
  const actual = await check();
  assert.equal(actual.decision, 'pass', JSON.stringify(actual));
});

test('external working material is outside product coverage while a parent path from a nested cwd is still inspected', async () => {
  const { directory, repository, options } = await fixture();
  const external = join(directory, 'personal-notes.md');
  const outside = await evaluateNativeCall('Write', { file_path: external, content: '이번 작업의 개인 메모입니다.' }, options);
  assert.equal(outside.decision, 'allow', JSON.stringify(outside));
  assert.equal(outside.scope, 'none');
  assert.equal(outside.inspection, 'outside-selected-product');
  assert.deepEqual(outside.checks, []);
  await assert.rejects(access(external), { code: 'ENOENT' });
  await writeFile(external, '개인 메모입니다.\n');
  const renamed = join(directory, 'renamed.md');
  const move = await evaluateNativeCall('apply_patch', { patch: '*** Begin Patch\n*** Update File: ' + external + '\n*** Move to: ' + renamed + '\n@@\n-개인 메모입니다.\n+수정한 개인 메모입니다.\n*** End Patch' }, options);
  assert.equal(move.decision, 'allow', JSON.stringify(move));
  assert.equal(move.inspection, 'outside-selected-product');
  assert.equal(await readFile(external, 'utf8'), '개인 메모입니다.\n');
  await assert.rejects(access(renamed), { code: 'ENOENT' });
  const nested = join(repository, 'docs/README.md');
  await writeFile(nested, '# 안내\n\n제품 안내입니다.\n');
  const movedOut = await evaluateNativeCall('apply_patch', { patch: '*** Begin Patch\n*** Update File: ' + nested + '\n*** Move to: ' + join(directory, 'retained-guide.md') + '\n@@\n-제품 안내입니다.\n+보관한 제품 안내입니다.\n*** End Patch' }, options);
  assert.equal(movedOut.decision, 'allow', JSON.stringify(movedOut));
  assert.deepEqual(movedOut.checks.map(check => check.check), ['file-scope']);
  const inside = await evaluateNativeCall('Write', { file_path: '../product.mjs', content: 'export const price = 1;', cwd: join(repository, 'src') }, options);
  assert.equal(inside.decision, 'allow', JSON.stringify(inside));
  assert.equal(inside.scope, 'mechanical');
  assert.equal(inside.checks[0].check, 'file-scope');
});
