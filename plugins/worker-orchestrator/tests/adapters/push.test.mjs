import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import test from 'node:test';
import { approvalHookFor, parsePushNotice, resultNoticeFor } from '../../src/adapters/codex-desktop/push.mjs';

const PREFIX = 'worker-orchestrator-event/1 ';
const controllerRef = {threadId: 'controller-thread', hostId: 'local'};
const event = {projectId: 'project-1', hostId: 'local', workerThreadId: 'worker-1', workerTurnId: 'turn-1'};
const project = {projectId: event.projectId, projectRoot: "/repo/worker's $(literal)", controllerRef};
const paths = {nodePath: '/opt/with space/node', cliPath: "/opt/worker's cli.mjs"};

function handlersFor(projectInput = project, pathsInput = paths) {
  return approvalHookFor(projectInput, pathsInput).hooks.PermissionRequest[0].hooks;
}

test('generates one journal handler and one native MCP notification for each permission request', () => {
  const hook = approvalHookFor(project, paths);
  const [command, mcp] = handlersFor();
  assert.deepEqual(hook, {hooks: {PermissionRequest: [{matcher: '*', hooks: [command, mcp]}]}});
  assert.equal(command.type, 'command');
  assert.equal(command.async, false);
  assert.equal(command.command, String.raw`'/opt/with space/node' '/opt/worker'"'"'s cli.mjs' 'journal-approval' '--input' '-' '--project-root' '/repo/worker'"'"'s $(literal)' '--project-id' 'project-1' '--host-id' 'local' >/dev/null 2>&1 || exit 1`);
  assert.deepEqual(mcp, {
    type: 'mcp_tool', server: 'codex_app', tool: 'send_message_to_thread', timeout: 10,
    input: {...controllerRef, prompt: PREFIX + JSON.stringify({
      kind: 'approval', ...event, workerThreadId: '${session_id}', workerTurnId: '${turn_id}'
    })}
  });
  const deliveredPrompt = mcp.input.prompt.replace('${session_id}', event.workerThreadId)
    .replace('${turn_id}', event.workerTurnId);
  assert.deepEqual(parsePushNotice(deliveredPrompt, event.workerThreadId), {kind: 'approval', ...event});
  assert.equal(parsePushNotice(mcp.input.prompt, '${session_id}'), null);
  assert.throws(() => handlersFor({...project, projectId: '${tool_input.command}'}), /Invalid projectId/);
});

test('quotes Windows command paths for PowerShell without interpolation', () => {
  const [command] = handlersFor({...project, projectRoot: "C:\\worker's & $repo\\"}, {
    nodePath: 'C:\\Node tools\\node.exe', cliPath: "C:\\agent’s stuff\\worker's cli.mjs"
  });
  assert.equal(command.commandWindows, String.raw`& 'C:\Node tools\node.exe' 'C:\agent’’s stuff\worker''s cli.mjs' 'journal-approval' '--input' '-' '--project-root' 'C:\worker''s & $repo\' '--project-id' 'project-1' '--host-id' 'local' *> $null; if (-not $?) { exit 1 }`);
});

test('the generated command passes stdin and literal arguments without emitting permission decisions', t => {
  const directory = mkdtempSync(join(tmpdir(), 'worker-hook-'));
  t.after(() => rmSync(directory, {recursive: true, force: true}));
  const cliPath = join(directory, "worker's & $cli ’.cjs");
  const outputPath = join(directory, 'journal.json');
  const projectRoot = join(directory, "owner's & $repo ’") + sep;
  writeFileSync(cliPath, `
    const fs = require('node:fs');
    fs.writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify({
      argv: process.argv.slice(2), stdin: fs.readFileSync(0, 'utf8')
    }));
    console.log(JSON.stringify({hookSpecificOutput: {decision: {behavior: 'allow'}}}));
    console.error('private tool input');
    process.exit(2);
  `);
  const [command] = handlersFor({...project, projectRoot}, {nodePath: process.execPath, cliPath});
  const stdin = JSON.stringify({hook_event_name: 'PermissionRequest', tool_input: {command: '한글'}});
  const [shell, args] = process.platform === 'win32'
    ? ['pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', command.commandWindows]]
    : ['/bin/sh', ['-c', command.command]];
  const options = {input: stdin, encoding: 'utf8', timeout: 10000};
  let run = spawnSync(shell, args, options);
  if (process.platform === 'win32' && run.error?.code === 'ENOENT') {
    run = spawnSync('powershell.exe', args, options);
  }
  assert.ifError(run.error);
  assert.equal(run.stderr, '');
  assert.equal(run.stdout, '');
  assert.equal(run.status, 1);
  assert.deepEqual(JSON.parse(readFileSync(outputPath, 'utf8')), {
    argv: ['journal-approval', '--input', '-', '--project-root', projectRoot, '--project-id', 'project-1', '--host-id', 'local'],
    stdin
  });
});

test('result notification sends the identifiers and accepts the matching Desktop sender', () => {
  const result = {...event, eventId: 'codex:result-1'};
  const call = resultNoticeFor({...result, toolInput: {command: 'private command'}, summary: 'private summary'}, controllerRef);
  assert.deepEqual(call, {
    tool: 'mcp__codex_app__send_message_to_thread',
    arguments: {...controllerRef, prompt: PREFIX + JSON.stringify({kind: 'result', ...result})}
  });
  assert.deepEqual(parsePushNotice(call.arguments.prompt, event.workerThreadId), {kind: 'result', ...result});
  assert.equal(parsePushNotice(call.arguments.prompt, controllerRef.threadId), null);
  assert.equal(parsePushNotice(call.arguments.prompt, undefined), null);
  assert.throws(() => resultNoticeFor({...result, eventId: 'bad event'}, controllerRef), /Invalid eventId/);
});

test('parser rejects malformed envelopes, additional fields and invalid identifiers', () => {
  const valid = {kind: 'approval', ...event};
  const encode = value => PREFIX + JSON.stringify(value);
  const invalid = [
    'unrelated message', PREFIX + '{', PREFIX + 'null', PREFIX + '[]',
    encode(valid) + '\n', encode(valid).replace('{', '{\n'),
    encode({...valid, kind: 'other'}), encode({...valid, projectId: '../project'}),
    encode({...valid, hostId: ''}), encode({...valid, workerTurnId: 42}),
    encode({...valid, workerTurnId: 'with space'}), encode({...valid, workerTurnId: 'turn\n'}),
    encode({...valid, eventId: 'irrelevant'}), encode({...valid, kind: 'result'}),
    encode({...valid, toolInput: {command: 'private'}})
  ];
  for (const prompt of invalid) assert.equal(parsePushNotice(prompt, event.workerThreadId), null, prompt);
  assert.equal(parsePushNotice(encode({...valid, workerThreadId: ''}), ''), null);
});
