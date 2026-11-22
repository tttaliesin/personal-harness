import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePowerShell, INVENTORY_NAMES } from '../src/windows.mjs';

test('실제 CIM 접근 거부에서도 출처를 표시한 읽기 전용 Windows 인벤토리를 반환한다', { skip: process.platform !== 'win32' }, async (t) => {
  const project = await realpath(await mkdtemp(join(tmpdir(), 'windows-agent-cim-fallback-')));
  t.after(async () => {
    const root = await realpath(tmpdir()), child = relative(root, await realpath(project));
    assert.ok(!isAbsolute(child) && child.startsWith('windows-agent-cim-fallback-') && !child.includes('..') && !/[\\/]/.test(child));
    await rm(project, { recursive: true });
  });
  const collector = fileURLToPath(new URL('../scripts/collect-host.ps1', import.meta.url));
  const literal = (value) => `'${value.replaceAll("'", "''")}'`;
  const program = `function Get-CimInstance { throw 'Controlled CIM denial' }; & ${literal(collector)} -ProjectPath ${literal(project)}`;
  const shell = await resolvePowerShell(process.env, { projectPath: project });
  const { stdout } = await promisify(execFile)(shell, ['-NoProfile', '-NonInteractive', '-Command', program], { cwd: project, timeout: 15000, maxBuffer: 1024 * 1024 });
  const inventory = JSON.parse(stdout);
  assert.equal(inventory.context.metadataSource, 'local-process-and-registry');
  assert.equal(inventory.context.cwd, project);
  assert.equal(inventory.context.diagnosticShell.profileApplied, false);
  assert.equal(inventory.context.diagnosticShell.path.toLowerCase(), shell.toLowerCase());
  assert.ok(Number(inventory.context.os.build) >= 22000);
  assert.deepEqual(Object.keys(inventory.commands), [...INVENTORY_NAMES]);
});
