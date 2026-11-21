import { readFileSync } from 'node:fs';
import { decisionReason, evaluateNativeCall } from './tool-call.mjs';

const args = process.argv.slice(2);
function deny(reason) {
  return { hookSpecificOutput: {
    hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason
  } };
}

let output;
try {
  if (args[0] !== '--harness' || !['claude-code', 'codex'].includes(args[1])) throw new TypeError('A static --harness selector is required');
  const options = {};
  const keys = { '--bundle': 'bundlePath', '--repository': 'repository', '--product': 'productPath' };
  for (let index = 2; index < args.length; index += 2) {
    const key = keys[args[index]];
    if (!key || !args[index + 1] || Object.hasOwn(options, key)) throw new TypeError('Expected unique --bundle, --repository or --product <path> options');
    options[key] = args[index + 1];
  }
  const payload = JSON.parse(readFileSync(0, 'utf8'));
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError('Invalid hook payload');
  if (payload.hook_event_name !== undefined && payload.hook_event_name !== 'PreToolUse') throw new TypeError('Expected a PreToolUse event');
  if (payload.cwd !== undefined && typeof payload.cwd !== 'string') throw new TypeError('Hook cwd must be a string');
  if (options.repository === undefined && payload.cwd !== undefined) options.repository = payload.cwd;
  const decision = await evaluateNativeCall(payload.tool_name, payload.tool_input, options);
  output = decision.decision !== 'allow' ? deny(decisionReason(decision))
    : decision.scope === 'mechanical' || decision.inspection === 'not-adopted' ? { hookSpecificOutput: {
      hookEventName: 'PreToolUse', additionalContext: JSON.stringify(decision)
    } } : {};
} catch (error) {
  output = deny('CHECK-ERROR: ' + (error instanceof Error ? error.message : String(error)));
}
process.stdout.write(JSON.stringify(output) + '\n');
