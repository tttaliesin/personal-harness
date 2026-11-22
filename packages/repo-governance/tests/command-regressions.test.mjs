import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateNativeCall } from '../plugin/skills/repo-governance/scripts/tool-call.mjs';
import { fileURLToPath } from 'node:url';

const bundlePath = fileURLToPath(new URL('../plugin/skills/repo-governance/assets/bundle.json', import.meta.url));

test('known compound, wrapped and dynamic governance mutations require complete inputs', async () => {
  for (const command of [
    'gh repo create Bad_Name; gh repo archive owner/old', 'gh repo create Bad_Name && git push',
    'gh repo create Bad_Name || true', 'echo ok | gh repo create Bad_Name',
    'gh repo create Bad_Name > result.txt', 'gh repo create Bad_Name\ngh repo archive owner/old',
    'env gh repo create Bad_Name', 'command gh repo rename Bad_Name', 'sudo gh repo create Bad_Name',
    'bash -c "gh repo create Bad_Name"', 'powershell -Command "gh repo create Bad_Name"',
    '& gh repo create Bad_Name', 'gh repo create $NAME', 'gh repo create "${NAME}"',
    'gh repo create $(name)', 'gh repo create `name`', 'gh repo create %NAME%',
    'gh repo create inventory-*', 'gh repo create inventory-?pi', 'gh repo create inventory-{api,web}',
    'gh repo create @names', 'gh repo create "unterminated', 'gh repo cre^ate Bad_Name',
    'git -c core.hooksPath=elsewhere commit -m "fix: 변경 처리"',
    'git --git-dir=elsewhere commit -m "fix: 변경 처리"',
    'git commit -a -m "fix: 변경 처리"', 'git commit --no-verify -m "fix: 변경 처리"',
    'git switch --orphan temporary-branch', 'gh --unknown x repo create Bad_Name',
    'gh api -X PATCH repos/owner/repo -f name=Bad_Name', 'gh api repos/owner/repo -f name=Bad_Name'
  ]) {
    const result = await evaluateNativeCall('Bash', { command }, { bundlePath: 'missing-bundle.json' });
    assert.equal(result.decision, 'needs-context', command + ': ' + JSON.stringify(result));
    assert.equal(result.checks.length, 0, command);
    assert.match(result.coverage, /not completely inspected/);
  }
});

test('queries and literal quoted mentions do not trigger governance checks', async () => {
  for (const command of [
    'echo "gh repo create Bad_Name"', "printf '%s' 'git commit -m bad'",
    'Write-Output "git push; gh pr merge 12"', 'git log --grep commit',
    'git show commit', 'git branch --list', 'git branch --show-current', 'git branch -d old-branch',
    'gh repo view owner/old --web', 'gh pr view 12 --json title,body',
    'gh repo create --help', 'gh repo rename inventory-api --help', 'gh api -X GET repos/owner/old',
    'git push origin main', 'gh repo archive owner/old --yes', 'npm test'
  ]) {
    const result = await evaluateNativeCall('Bash', { command }, { get bundlePath() { throw Error('must not load bundle'); } });
    assert.equal(result.decision, 'allow', command);
    assert.equal(result.scope, 'none', command);
    assert.equal(result.checks.length, 0);
    assert.match(result.coverage, /outside coverage/);
  }
});

test('the canonical command field cannot be overridden by another field', async () => {
  const cmd = 'gh repo rename Bad_Name --repo owner/example-api';
  assert.equal((await evaluateNativeCall('exec_command', { cmd, command: 'echo safe' }, { bundlePath })).decision, 'deny');
  assert.equal((await evaluateNativeCall('Bash', { command: cmd, cmd: 'echo safe' }, { bundlePath })).decision, 'deny');
  assert.equal((await evaluateNativeCall('exec_command', { cmd: 'echo safe', command: cmd })).scope, 'none');
  await assert.rejects(evaluateNativeCall('exec_command', { command: cmd }), /must be a string/);
  await assert.rejects(evaluateNativeCall('Bash', { cmd }), /must be a string/);
  for (const [tool, input] of [[null, {}], ['', {}], ['Read', null], ['Read', []], ['Bash', {}]]) {
    await assert.rejects(evaluateNativeCall(tool, input), TypeError);
  }
});
