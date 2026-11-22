import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export function writeProbe({runId, phase, output, root=process.cwd()}) {
  if (typeof runId!=='string'||!/^[a-zA-Z0-9][-_a-zA-Z0-9]{3,127}$/.test(runId)) throw new Error('A run identifier is required');
  if (!['created','reused','restored'].includes(phase)) throw new Error('Unknown lifecycle phase');
  const resolvedRoot=fs.realpathSync(root), target=path.resolve(output);
  const rel=path.relative(path.join(resolvedRoot,'.local','live','markers'),target);
  if(rel.startsWith('..')||path.isAbsolute(rel)) throw new Error('Marker must stay in the owned local live markers directory');
  const payload={runId,phase,cwd:resolvedRoot,verification:'worker-probe-v1',value:19*23};
  const sha256=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,JSON.stringify({...payload,sha256},null,2)+'\n',{flag:'wx'});
  return {...payload,sha256,marker:target};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const [runId,phase,output]=process.argv.slice(2);
  console.log(JSON.stringify(writeProbe({runId,phase,output})));
}
