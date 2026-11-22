import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checks, Missing, requestFrom, rulesVersion } from './contracts.mjs';
import { loadCriteria, readInput, withInputRuntime } from './inputs.mjs';
import { evaluate, semanticChecks } from './rules.mjs';

export async function runCheck(requestText,argv=[],runtime={}) {
  const result={schemaVersion:3,rulesVersion:'unavailable',check:'unknown',scope:'mechanical',decision:'pass',
    observed:[],findings:[],semanticChecks:[]};
  try {
    await withInputRuntime(runtime,async()=>{
    const json=JSON.parse(requestText);
    if (json && typeof json.check==='string' && Object.hasOwn(checks,json.check)) {
      result.check=json.check;
      result.semanticChecks=semanticChecks(json.check);
    }
    const request=requestFrom(json,argv);
    const criteria=await loadCriteria(request.context,result.observed);
    result.rulesVersion=rulesVersion;
    const input=await readInput(request,criteria.product,result.observed);
    await evaluate(request.check,input,criteria,result);
    });
  } catch(e) {
    const missing=e instanceof Missing || e.code==='ENOENT';
    if (result.decision!=='violation') result.decision=missing?'needs-context':'error';
    result.findings.push({ruleId:result.semanticChecks[0]?.ruleId??'contract',code:missing?'required-input':'check-error',message:e.message,target:result.check});
  }
  const exitCode={pass:0,error:1,violation:2,'needs-context':3}[result.decision];
  return {line:JSON.stringify(result)+'\n',exitCode};
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=await runCheck(readFileSync(0,'utf8'),process.argv.slice(2));
  process.stdout.write(result.line);
  process.exitCode=result.exitCode;
}
