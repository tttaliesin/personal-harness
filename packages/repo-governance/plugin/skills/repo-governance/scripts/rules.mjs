import { name, description } from './checks/repository.mjs';
import { readme, pr, documentAnchors } from './checks/documents.mjs';
import { commit, branch } from './checks/git.mjs';
import { fileScope } from './checks/file-scope.mjs';
import { linkFile, linkDocument } from './inputs.mjs';

const rules={
  name: [
    'K1',
    name,
    'Does the candidate meet the category, grouping and third-slot requirements or a verified platform contract that requires this exact name, and is it available in the intended namespace?',
    [
      'README and actual deliverables, entry points or operational ownership',
      'for ordinary names: consistent grouping of related repositories and evidence for including or omitting a third slot',
      'for ordinary shared names: documented adoption unit and user task, actual distribution and entry points, and the individual resource name',
      'for a shared resource with multiple delivery forms: the supported, documented default adoption path',
      'for shared bundles: evidence of co-delivery and a supported path for each unit to perform its task without separately installing or activating another unit',
      'current target, namespace lookup and access limits',
      'for an exact-name exception: read the actual platform contract and verify its target, scope and expiry; the product declaration alone is not approval'
    ]
  ],
  description:['K2',description,'What one-line Korean description helps someone identify the repository and the work it does today?',
    ['actual target, current entry points, and supported behavior']],
  readme:['K3',readme,'What does the reader need to identify this repository and start their task? Show that path in Korean and link to the relevant details.',
    ['README path, audience, actual entry points, and essential prerequisites','a runnable example or material the reader can open, when useful','evidence for any support or test claim, and destinations for detailed tasks']],
  'commit-message':['K4',commit,'What type and summary best explain the actual diff under the default Korean convention or verified upstream contract? Include an impact or migration when users need to act.',
    ['actual parent, staged blobs and diff for this commit invocation','current scope usage, change purpose, affected users and related issue or revert target','for temporary history: allowed scope, target, cleanup plan and final messages','for upstream areas or language: read the actual contribution contract and verify its target, scope and expiry; a declaration does not prove that contract applies']],
  branch:['K5',branch,'Does the name identify the requested task at the intended base, with any namespace independently justified?',
    ['actual base ref/OID, repository and worktree','current task, existing refs and worktree usage','when present: actual host contract or consuming automation, exact prefix, source, scope and expiry; the declaration alone is not approval']],
  'pull-request':['K6',pr,'What changed, why, and what was actually verified? Give the reviewer a concise Korean explanation for this head and base, with impact when it affects others.',
    ['actual remote repository, existing PR or explicit creation refs and comparison revisions','current diff, related work, requested stage and verification records','for merge: current repository requirements, integration candidate and final commit messages']],
  'file-scope':['K7',fileScope,'Who uses this file, and does that use require keeping it with the repository version? Recommend a local location for personal or generated material.',
    ['actual contents and their product or local consumer','staged files and any declared local output boundary']]
};
export function semanticChecks(check) {
  if (!Object.hasOwn(rules,check)) return [];
  const [ruleId,,question,requiredEvidence]=rules[check];
  return [{ruleId,question,requiredEvidence}];
}
export async function evaluate(check,input,{policy,product},report) {
  const [ruleId,run]=rules[check];
  function finding(kind,code,message,target=input.target) {
    report.findings.push({ruleId,code,message,target});
    if (report.decision!=='violation') report.decision=kind;
  }
  const violation=(...args)=>finding('violation',...args);
  const missing=(...args)=>finding('needs-context',...args);
  if (check!=='readme') return run(input,policy,{violation,missing,product});
  for (const document of input.documents ?? [input]) {
    const documentViolation=(code,message)=>violation(code,message,document.target);
    const documentMissing=(code,message)=>missing(code,message,document.target);
    for (const {name,anchor} of run(document,policy,{violation:documentViolation,missing:documentMissing,product})) {
      if (!document.root) {documentMissing('link-location','Provide a repository for the README text or file source to resolve: '+name); continue;}
      const file=await (input.resolveLink ?? linkFile)(document.root,document.target,name);
      if (!file) {documentViolation('link-missing','Relative target does not exist: '+name); continue;}
      if (anchor && file.isFile && /\.(?:md|markdown)$/i.test(name)) {
        const anchors=documentAnchors(await (input.readLink ?? linkDocument)(file.path,report.observed));
        if (!anchors.has(anchor)) documentViolation('linked-anchor','Linked document has no matching anchor: '+name+'#'+anchor);
      }
    }
  }
}
