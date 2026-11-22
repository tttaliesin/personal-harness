export function fileScope({kind,files},policy,{violation}) {
  for (const f of files) {
    if (kind!=='file') {
      if (f.output) violation('included-output','Declared local output is part of the Git candidate.',f.name);
      continue;
    }
    if (f.aliasedBoundary) violation('aliased-boundary','Resolving the path changes its declared output boundary.',f.requested);
    if (f.output && f.tracked) violation('tracked-output','Local output collides with a tracked candidate.',f.name);
    if (f.output && !f.ignored) violation('unignored-output','The declared local output is not effectively ignored.',f.name);
  }
}
