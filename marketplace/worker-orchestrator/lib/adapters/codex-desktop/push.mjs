const NOTICE_PREFIX = 'worker-orchestrator-event/1 ';
const SEND_TOOL = 'send_message_to_thread';
const COMMON_FIELDS = ['projectId', 'hostId', 'workerThreadId', 'workerTurnId'];

function isIdentifier(value) {
  return typeof value === 'string' && /^[\p{L}\p{N}][\p{L}\p{N}\p{M}_.:-]*$/u.test(value);
}

function requireIdentifier(value, field) {
  if (!isIdentifier(value)) throw new TypeError(`Invalid ${field}`);
  return value;
}

function requireCommandPath(value, field) {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError(`Invalid ${field}`);
  }
  return value;
}

function quotePosix(value) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function quotePowerShell(value) {
  return `'${value.replace(/['‘’‚‛]/gu, quote => quote + quote)}'`;
}

function noticeText(notice) {
  return NOTICE_PREFIX + JSON.stringify(notice);
}

export function approvalHookFor(project, {nodePath, cliPath}) {
  const projectId = requireIdentifier(project.projectId, 'projectId');
  const threadId = requireIdentifier(project.controllerRef?.threadId, 'controllerRef.threadId');
  const hostId = 'local';
  const args = [
    requireCommandPath(nodePath, 'nodePath'), requireCommandPath(cliPath, 'cliPath'),
    'journal-approval', '--input', '-', '--project-root', requireCommandPath(project.projectRoot, 'projectRoot'),
    '--project-id', projectId, '--host-id', hostId
  ];
  const prompt = noticeText({
    kind: 'approval', projectId, hostId, workerThreadId: '${session_id}', workerTurnId: '${turn_id}'
  });
  const command = {
    type: 'command',
    // Keep failures observable without letting journal output decide the permission request.
    command: `${args.map(quotePosix).join(' ')} >/dev/null 2>&1 || exit 1`,
    commandWindows: `& ${args.map(quotePowerShell).join(' ')} *> $null; if (-not $?) { exit 1 }`,
    async: false,
    timeout: 10
  };
  const mcp = {type: 'mcp_tool', server: 'codex_app', tool: SEND_TOOL, input: {threadId, hostId, prompt}, timeout: 10};
  return {hooks: {PermissionRequest: [{matcher: '*', hooks: [command, mcp]}]}};
}

export function resultNoticeFor(event, controllerRef) {
  const notice = {kind: 'result'};
  for (const field of [...COMMON_FIELDS, 'eventId']) {
    notice[field] = requireIdentifier(event[field], field);
  }
  return {tool: `mcp__codex_app__${SEND_TOOL}`, arguments: {
    threadId: requireIdentifier(controllerRef.threadId, 'controllerRef.threadId'),
    hostId: requireIdentifier(controllerRef.hostId, 'controllerRef.hostId'),
    prompt: noticeText(notice)
  }};
}

export function parsePushNotice(text, sourceThreadId) {
  if (typeof text !== 'string' || !text.startsWith(NOTICE_PREFIX) || /[\r\n\u2028\u2029]/u.test(text)) return null;

  let notice;
  try {
    notice = JSON.parse(text.slice(NOTICE_PREFIX.length));
  } catch {
    return null;
  }
  if (notice?.workerThreadId !== sourceThreadId) return null;
  if (notice?.kind !== 'approval' && notice?.kind !== 'result') return null;

  const fields = notice.kind === 'result' ? [...COMMON_FIELDS, 'eventId'] : COMMON_FIELDS;
  if (Object.keys(notice).length !== fields.length + 1 ||
    !fields.every(field => Object.hasOwn(notice, field) && isIdentifier(notice[field]))) return null;
  return notice;
}
