<!-- engineering-evidence-preferences:start -->
## Engineering evaluation preferences

- Optimize for elapsed completion time. A task being feasible for one agent is not a reason to avoid parallel work; split independent work when it is expected to finish sooner. Treat that expectation as measurable, including dispatch, integration, and rework costs.
- The user considers model generation latency a major cost. Do not claim industry speed rankings without comparable measurements.
- For plugin or harness evaluations, assess general, reproducible behavior and plugin-internal causes and fixes. Do not substitute unsolicited advice specific to the current project.
- Follow the user's Newton's flaming laser sword principle: distinguish observations from hypotheses; state a reproducible test and falsification condition for causal or performance claims. Do not present untestable assumptions as findings.
- Deployment Simulator is an on-demand tool for relevant scenarios, not a mandatory step in every development task. Distinguish an explicit all-harness test from unintended automatic triggering.
<!-- engineering-evidence-preferences:end -->
<!-- agent-desktop-default:start -->
## Default native desktop automation

- Use Vercel's agent-desktop CLI as the default for native desktop GUI tasks, following the unmodified official agent-desktop and agent-desktop-windows skills installed under ${CODEX_HOME}/skills.
- Use the official CLI commands and documented procedures directly. Do not substitute locally written test applications or cursor execution wrappers for the requested app workflow.
- Start cursor sessions with the official `session start --cursor --multi-agent` command. For the main Codex agent, use agent id `codex` and configure its cursor with `--agent-id codex cursor-overlay enable --label Codex`. Keep the official default cursor size and colors unless the user requests a change.
- For any actual agents sharing that desktop session, pass the same session id and assign each a distinct agent id and a label matching its real agent name. Use that agent id on its desktop actions and reuse it for that agent's later actions.
<!-- agent-desktop-default:end -->

<!-- removed-artiboard:start -->
## Removed integration

- Artiboard was removed at the user's request.
- Do not install, start, connect, or require Artiboard for task coordination.
<!-- removed-artiboard:end -->

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->

하나의 글에는 하나의 주장이나 목적만 포함하라
하나의 문단에는 하나의 주제만 담아라
하나의 문장에는 하나의 생각만 담아라

문장마다 줄바꿈하라
mermaid 시각자료를 활용하라 
mermaid를 쓸 땐, mermaid가 지원하는 다양한 종류의 차트를 모두 떠올려서 용도에 맞게 사용하라
