import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../plugin/', import.meta.url));

async function adoptedFixture(t) {
  const repository = await mkdtemp(join(tmpdir(), 'governance-registration-'));
  t.after(async () => {
    assert.equal(dirname(resolve(repository)), resolve(tmpdir()));
    assert.ok(basename(repository).startsWith('governance-registration-'));
    await rm(repository, { recursive: true, force: true });
  });
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_|^REPO_GOVERNANCE_/i.test(key)));
  const git = spawnSync('git', ['-C', repository, 'init', '--quiet'], { encoding: 'utf8', windowsHide: true, env });
  assert.equal(git.status, 0, git.stderr);
  const local = join(repository, '.git/repo-governance');
  await mkdir(local);
  const digest = createHash('sha256').update(await readFile(join(root, 'skills/repo-governance/assets/bundle.json'))).digest('hex');
  await writeFile(join(local, 'product.json'), JSON.stringify({ schemaVersion: 1, bundle: { version: '0.2.0', sha256: digest }, outputBoundaries: [] }));
  await writeFile(join(local, 'adoption.json'), JSON.stringify({ schemaVersion: 1, mode: 'enforce' }));
  return { repository, env };
}

test('Codex Windows registration expands the installed plugin path and consumes canonical hook input', { skip: process.platform !== 'win32' }, async t => {
  const f = await adoptedFixture(t);
  const config = JSON.parse(await readFile(new URL('../plugin/hooks/codex.json', import.meta.url), 'utf8'));
  const handler = config.hooks.PreToolUse[0].hooks[0];
  for (const [command, denied] of [['gh repo rename Bad_Name', true], ['gh repo view owner/old --web', false], ['gh repo rename product-inventory-api', false]]) {
    const child = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', handler.commandWindows], {
      cwd: f.repository, env: { ...f.env, PLUGIN_ROOT: root },
      input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: f.repository }),
      encoding: 'utf8', windowsHide: true, timeout: 15000
    });
    assert.equal(child.status, 0, child.stderr);
    const output = JSON.parse(child.stdout);
    assert.equal(output.hookSpecificOutput?.permissionDecision === 'deny', denied, child.stdout);
    if (denied) assert.match(output.hookSpecificOutput.permissionDecisionReason, /K1\/name-format/);
  }
});

test('Claude exec registration uses argument expansion and blocking failure policy', async t => {
  const f = await adoptedFixture(t);
  const config = JSON.parse(await readFile(new URL('../plugin/hooks/claude-code.json', import.meta.url), 'utf8'));
  const handler = config.hooks.PreToolUse[0].hooks[0];
  assert.equal(handler.command, 'node');
  assert.deepEqual(handler.args, ['${CLAUDE_PLUGIN_ROOT}/hooks/run.mjs', '--harness', 'claude-code']);
  assert.equal(handler.onFailure, 'block');
  const args = handler.args.map(value => value.replace('${CLAUDE_PLUGIN_ROOT}', root));
  const child = spawnSync(handler.command, args, { cwd: f.repository, env: f.env, input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'gh repo rename Bad_Name' }, cwd: f.repository }), encoding: 'utf8', windowsHide: true });
  assert.equal(child.status, 0, child.stderr);
  const output = JSON.parse(child.stdout);
  assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /K1\/name-format/);
});
