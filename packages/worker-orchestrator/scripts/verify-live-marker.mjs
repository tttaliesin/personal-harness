import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

try {
  const [filename,runId,phase,root]=process.argv.slice(2);
  if(!filename||!runId||!phase||!root) throw new Error('Usage: node scripts/verify-live-marker.mjs <marker> <runId> <phase> <root>');
  const marker=JSON.parse(fs.readFileSync(filename,'utf8'));
  const actualRoot=fs.realpathSync(root);
  if(marker.runId!==runId||marker.phase!==phase||fs.realpathSync(marker.cwd)!==actualRoot||marker.value!==437||marker.verification!=='worker-probe-v1') throw new Error('Marker does not match the current worker run');
  const payload={runId:marker.runId,phase:marker.phase,cwd:marker.cwd,verification:marker.verification,value:marker.value};
  const actualHash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  if(actualHash!==marker.sha256) throw new Error('Marker integrity hash differs');
  const report={ok:true,runId,phase,marker:path.resolve(filename),cwd:actualRoot,value:marker.value,sha256:actualHash,verification:'independent-controller-read'};
  console.log(JSON.stringify(report,null,2));
} catch(error) { console.error(JSON.stringify({ok:false,error:error.message}));process.exitCode=1; }
