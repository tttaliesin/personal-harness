import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { decisionReason, evaluateNativeCall } from '../../skills/repo-governance/scripts/tool-call.mjs';

export default function repoGovernance(pi: ExtensionAPI): void {
  let lastNotAdopted: string | undefined;
  const resetNotice = () => { lastNotAdopted = undefined; };
  pi.on('session_tree', resetNotice);
  pi.on('session_compact', resetNotice);
  pi.on('tool_call', async (event, context) => {
    try {
      const decision = await evaluateNativeCall(event.toolName, event.input, { repository: context.cwd });
      if (decision.decision !== 'allow') {
        lastNotAdopted = undefined;
        return { block: true, reason: decisionReason(decision) };
      }
      if (decision.inspection === 'checked') lastNotAdopted = undefined;
      if (decision.inspection === 'not-adopted') {
        const scopes = decision.adoption.map(state => JSON.stringify(state)).sort();
        const status = JSON.stringify([context.cwd, scopes]);
        if (status !== lastNotAdopted) {
          try {
            pi.sendMessage({ customType: 'repo-governance', content: JSON.stringify(decision), display: true }, { triggerTurn: false });
            lastNotAdopted = status;
          } catch {
            // Status delivery cannot block an unadopted tool; retry on the next relevant call.
          }
        }
      }
    } catch (error) {
      lastNotAdopted = undefined;
      return { block: true, reason: 'CHECK-ERROR: ' + (error instanceof Error ? error.message : String(error)) };
    }
    return undefined;
  });
}
