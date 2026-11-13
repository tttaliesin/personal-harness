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

<!-- egm-pstack-routing:start -->
## EGM within the pstack workflow

- Apply this routing in the primary coordinating agent.
- Keep one coordinator responsible for the user's scope, progress, decisions, and completion criteria.
- For work that requires pstack, use pstack to manage the overall task and invoke EGM for the document stage that needs it.
- Continue the same task after EGM returns its artifacts or findings.
- Reviewers and delegated workers perform their bounded assignment without starting another top-level pstack or EGM workflow.
- Honor direct user instructions and repository-specific constraints.

### Select the document stage

- Select EGM from the user's goal and the current stage even when the user does not name EGM.
- Announce the selected EGM skill and its concrete reason in one sentence.
- Read the selected installed SKILL.md and its Codex integration instructions before executing it.
- Use egm-brainstorm for substantive feature exploration when requirements, scope, or design alternatives need to be resolved.
- Use egm-draft to turn agreed ideas or notes into a software design document.
- Use egm-review to review an existing software design, feature specification, or compatible implementation plan for gaps, consistency, or implementation readiness.
- Use egm-review-loop for other documents such as installation and usage READMEs, or when a document review specifies a custom scope, reviewer set, or standard.
- Follow egm-resolve within the selected EGM review flow to handle its findings.
- Use egm-drift-report for a requested comparison of relevant design documents with current code.
- Use egm-bootstrap for a requested directory-tree README bootstrap or refresh.
- Run only the needed entry point and its required subflows.
- Reuse existing documents and agreed decisions instead of restarting the full EGM sequence.
- Do not add EGM document work to simple explanations, typo fixes, mechanical edits, bug investigation, or implementation with settled requirements unless a document task is also needed.
- File count alone does not require EGM.

### Preserve the handoff and avoid duplicate work

- Let EGM own the selected document-stage method while pstack retains overall coordination.
- Select that owner before starting pstack's per-stage design and review subflows.
- EGM's selected document-stage procedure replaces pstack's how, why, architect, arena, or document-review procedure for that same document-level purpose.
- Use those pstack procedures when a distinct code-level question or implementation stage requires them.
- Credit an EGM review toward a pstack document-review step only when its coverage and accepted verdict satisfy that step's requirements.
- Bind reuse to the same document revision, relevant supporting-code and reading-list revisions, scope, criteria, and acceptance conditions.
- Record those inputs, the execution status, the verdict, and the actual reviewer evidence in the current task's notes or existing review artifact.
- Keep execution status separate from whether the parent review gate is satisfied.
- A paused or manually halted flow, missing reviewer, or unresolved required finding does not satisfy that gate merely because the flow returned a completion message.
- Do not launch another pstack review of those same inputs for the same purpose after the required verdict is satisfied or the user explicitly accepts the remaining risk.
- Reading the agreed document to implement it is not a new review.
- Reopen the affected review when substantive document edits, supporting-code changes, reading-list changes, or new requirements invalidate its evidence or coverage.
- Keep pstack's code-structure work, required independent code review, and real execution verification for requested implementation.
- Update the relevant design artifact when an accepted implementation change alters its contract.
- Do not implement code when the user requested only planning or document review.

### Operating policy

- Use the routing rules in this file without adding runtime blocking of duplicate reviews.
- If duplicate reviews occur in actual work, identify the cause from the original execution logs before making changes.
- Change only the parts needed to address the confirmed cause.

### Keep the EGM execution contract

- Do not add a separate permission question merely to select EGM.
- Follow EGM's preparation, consensus, and approval gates, subject to higher-priority user instructions.
- Dispatch Goldfish reviewers with the installed plugin's fresh-context procedure and verify their actual completion.
- Report missing tools or failed reviewers as incomplete work rather than a clean review.
<!-- egm-pstack-routing:end -->
