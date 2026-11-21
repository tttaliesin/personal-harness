import { knownPlaceholder } from './repository.mjs';

export function commit({text},policy,{violation,product}) {
  const [title,...rest]=text.replaceAll('\r\n','\n').replace(/\n+$/,'').split('\n');
  const temporary=/^(?:fixup|squash|amend)! /.test(title);
  if (temporary) {
    if (!title.replace(/^(?:fixup|squash|amend)! /,'').trim() || knownPlaceholder(title))
      violation('temporary-message','Provide the actual nonempty target summary for this temporary message.');
  }
  const m=/^([a-z]+)(?:\(([a-z0-9]+(?:-[a-z0-9]+)*)\))?(!)?: (\S.*)$/u.exec(title);
  const upstream=/^([^:\r\n]+): (\S.*)$/u.exec(title);
  const upstreamTitle=product?.commitConvention?.style==='upstream-area'
    && upstream && product.commitConvention.areas.includes(upstream[1]);
  if ((!temporary && (!m || !policy.commitTypes.includes(m[1])) && !upstreamTitle) || /[\r\u2028\u2029]/.test(title))
    violation('commit-title','Use an allowed type or exact declared upstream area, colon, one space and a nonempty summary.');
  if ((m && knownPlaceholder(m[4])) || (upstreamTitle && knownPlaceholder(upstream[2])))
    violation('placeholder','Replace the summary placeholder.');
  if (rest.length && rest[0]!=='') violation('commit-separator','Separate the subject from the body with a blank line.');
  const body=rest.join('\n').trim();
  if ((m?.[3] || m?.[1]==='revert') && !body) violation('commit-body','Breaking changes and reverts require an explanatory body.');
  if (!temporary && /^BREAKING CHANGE:/m.test(body) && !m?.[3]) violation('commit-breaking','Mark a declared breaking change with ! in the title.');
  for (let i=0;i<rest.length;i++) {
    if (!/^(?:refs?|close[sd]?|fix(?:es|ed)?|resolve[sd]?)(?:\s*:|\s+#|\s+[^ ]+\/[^ ]+#)/i.test(rest[i])) continue;
    if (!/^(?:Refs|Closes): (?:[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)?#[1-9]\d*$/.test(rest[i]))
      violation('commit-reference','Use Refs: or Closes: with an actual issue reference.');
    else if (i && rest[i-1]!=='' && !/^(?:Refs|Closes): /.test(rest[i-1]))
      violation('commit-reference-separator','Separate issue references from prose with a blank line.');
  }
}
export function branch({text,validRef,base,existing},policy,{violation,missing,product}) {
  if (!validRef) violation('branch-ref','Git rejects the full branch ref.');
  let body=text;
  if (text.includes('/')) {
    const prefix=product?.branchNamespace?.prefix;
    if (!prefix) {
      if (product || /^(?:fix|feat)\//.test(text)) violation('branch-namespace','No matching host or automation namespace is declared.');
      else missing('branch-namespace','A slash requires a pinned, sourced host or automation namespace declaration.');
      body=text.slice(text.lastIndexOf('/')+1);
    } else if (!text.startsWith(prefix)) violation('branch-namespace','The prefix differs from the exact declared namespace.');
    else body=text.slice(prefix.length);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body) || /\s/.test(body))
    violation('branch-name','Use a lowercase alphanumeric kebab name after the exact declared prefix.');
  if (!base) missing('branch-base','Supply the repository and an actual base ref that resolves to a commit.');
  if (existing) missing('existing-branch','The branch already exists. Check its purpose, worktree and the scope of any reuse.');
}
