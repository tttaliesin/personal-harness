import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCheck } from '../plugin/skills/repo-governance/scripts/check.mjs';

const bundlePath=process.env.REPO_GOVERNANCE_TEST_BUNDLE ?? fileURLToPath(new URL('../plugin/skills/repo-governance/assets/bundle.json',import.meta.url));
const prBody='## 배경\n문제다.\n## 변경 내용\n수정했다.\n## 검증\n검사했다.\n## 영향\n영향을 확인한다.\n\n';
const readmeBody='# Product\n\nContent.\n\n';
async function call(check,text,repository) {
  const source=check==='pull-request'
    ? {kind:'pr',number:1,headOid:'a'.repeat(40),baseOid:'b'.repeat(40),title:'문서 검사를 수정한다',body:text}
    : {kind:'text',text};
  const {line,exitCode}=await runCheck(JSON.stringify({schemaVersion:3,operation:'check',check,sources:[source],context:{bundlePath,...(repository?{repository}:{})}}));
  return {exitCode,...JSON.parse(line)};
}
function expect(result,decision,code) {
  assert.equal(result.decision,decision,JSON.stringify(result));
  assert.equal(result.exitCode,{pass:0,error:1,violation:2,'needs-context':3}[decision],JSON.stringify(result));
  assert.equal(result.scope,'mechanical');
  if (code) assert.ok(result.findings.some(f=>f.code===code),JSON.stringify(result.findings));
  return result;
}
function repository(t) {
  const directory=mkdtempSync(join(tmpdir(),'governance-review-document-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  return directory;
}

test('the public check discriminator rejects arrays instead of coercing them into supported names',async t=>{
  const directory=repository(t), text='# Product\n\n[missing](missing.md)\n';
  expect(await call('readme',text,directory),'violation','link-missing');
  for (const check of [['readme'],['name'],[],null,{},1,true]) {
    const result=expect(await call(check,text,directory),'error','check-error');
    assert.equal(result.check,'unknown');
    assert.deepEqual(result.observed,[]);
    assert.ok(result.findings.every(f=>typeof f.target==='string'));
  }
});

test('README and PR open fences fail with or without a final newline and inside containers',async()=>{
  for (const fence of [
    '```text\nx','```text\nx\n','```text','````text\nx\n```',
    '~~~text\r\nx','~~~text\r\nx\r\n',
    '> ```text\n> x','- ```text\n  x','1. ```text\n   x','- > ```text\n  > x'
  ]) {
    expect(await call('readme','# Product\n\n'+fence),'violation','code-fence');
    expect(await call('pull-request',prBody+fence),'violation','code-fence');
  }
});

test('closed fences preserve EOF, CRLF, delimiter lengths and nested list or quote behavior',async()=>{
  for (const fence of [
    '```text\nx\n```','```text\nx\n```\n','```text\n```',
    '````text\nx\n````','~~~text\r\nx\r\n~~~~',
    '> ```text\r\n> x\r\n> ```','- ```text\n  x\n  ```',
    '1. ```text\n   x\n   ```','- > ```text\n  > x\n  > ```'
  ]) {
    expect(await call('readme','# Product\n\n'+fence),'pass');
    expect(await call('pull-request',prBody+fence),'pass');
  }
});

test('HTML link and image targets use quoted or unquoted attribute values consistently',async t=>{
  const directory=repository(t);
  writeFileSync(join(directory,'guide.md'),'# Guide\n\nContent.\n');
  writeFileSync(join(directory,'image.png'),'fixture image');
  for (const [tag,attribute,existing] of [['a','href','guide.md'],['img','src','image.png']]) {
    for (const value of ['missing.md','"missing.md"',"'missing.md'",'missing&#46;md']) {
      const html='<'+tag+' hidden '+attribute+' = '+value+'>'+(tag==='a'?'guide</a>':'');
      expect(await call('readme',readmeBody+html+'\n',directory),'violation','link-missing');
    }
    const html='<'+tag.toUpperCase()+' title="preview > image"\n'+attribute.toUpperCase()+'\t=\t'+existing+'>'+(tag==='a'?'guide</a>':'');
    expect(await call('readme',readmeBody+html+'\n',directory),'pass');
  }
});

test('HTML anchors collect exact id and name attributes for links and headings',async t=>{
  const directory=repository(t);
  for (const tag of ['a','h2']) for (const attribute of ['id','name']) for (const value of ['custom','"custom"',"'custom'",'cust&#111;m']) {
    const html='<'+tag+' title="preview > image" '+attribute+' = '+value+'>Title</'+tag+'>\n\nContent.\n\n[go](#custom)\n';
    expect(await call('readme',readmeBody+html,directory),'pass');
    writeFileSync(join(directory,'guide.md'),'# Guide\n\n'+html);
    expect(await call('readme',readmeBody+'[go](guide.md#custom)\n',directory),'pass');
  }
  expect(await call('readme',readmeBody+'<a id=first name=second></a>\n\n[one](#first) [two](#second)\n',directory),'pass');
  expect(await call('readme',readmeBody+'<h2 title=">" id=custom>Title</h2>\n\nContent.\n\n[go](#title)\n',directory),'pass');
});

test('HTML attribute-looking text, comments and Markdown code cannot create links or anchors',async t=>{
  const directory=repository(t);
  for (const example of [
    '<a data-href="missing.md" data-src=missing.md>label</a>',
    '<img data-src="missing.png" alt=image>',
    '<a src="missing.md">label</a>',
    '<img href="missing.md" alt=image>',
    '<a title=\'href="missing.md"\'>label</a>',
    '<a title="preview > <img src=missing.md>">label</a>',
    '<!-- <a href=missing.md><img src=missing.png> -->',
    '`<a href=missing.md>`',
    '```html\n<a href=missing.md>\n<img src=missing.png>\n```',
    '    <a href=missing.md>\n    <img src=missing.png>'
  ]) expect(await call('readme',readmeBody+example+'\n',directory),'pass');
  for (const example of [
    '<a data-id="custom" data-name=custom>label</a>',
    '<a title=\'id="custom" name="custom"\'>label</a>',
    '<!-- <a id=custom></a> -->',
    '`<a id=custom></a>`',
    '```html\n<a id=custom></a>\n```',
    '    <a id=custom></a>'
  ]) expect(await call('readme',readmeBody+example+'\n\n[go](#custom)\n',directory),'violation','readme-anchor');
});

test('HTML attribute names preserve real targets across non-ASCII and punctuation names',async t=>{
  const directory=repository(t);
  for (const name of ['data-kind','data-가','가','data-λ','@metadata','2']) {
    for (const [tag,attribute] of [['a','href'],['img','src']]) {
      const html='<div>\n<'+tag+' '+name+'="metadata" '+attribute+'=missing.md>Guide</'+tag+'>\n</div>\n';
      expect(await call('readme',readmeBody+html,directory),'violation','link-missing');
    }
  }
});

test('HTML headings and explicit anchors survive non-ASCII attribute names',async t=>{
  const directory=repository(t);
  for (const name of ['data-kind','data-가','가','data-λ','@metadata','2']) {
    const html='<h1 '+name+'="metadata" id=custom>Product</h1>\n\nContent.\n\n[go](#custom) [title](#product)\n';
    expect(await call('readme',html,directory),'pass');
    for (const attribute of ['id','name']) {
      expect(await call('readme',readmeBody+'<div>\n<a '+name+'="metadata" '+attribute+'=custom></a>\n</div>\n\n[go](#custom)\n',directory),'pass');
    }
  }
});

test('quoted values after non-ASCII attribute names cannot become independent HTML tags',async t=>{
  const directory=repository(t);
  writeFileSync(join(directory,'guide.md'),'# Guide\n\nContent.\n');
  for (const name of ['data-kind','data-가','가','data-λ','@metadata','2']) {
    for (const quote of ['"',"'"]) {
      const html='<div>\n<a '+name+'='+quote+'<img src=missing.png> <a id=hidden>'+quote+' href=guide.md>Guide</a>\n</div>\n';
      expect(await call('readme',readmeBody+html,directory),'pass');
      expect(await call('readme',readmeBody+html+'\n[go](#hidden)\n',directory),'violation','readme-anchor');
    }
  }
});

test('HTML attribute boundaries and first duplicate values keep links and anchors exact',async t=>{
  const directory=repository(t);
  writeFileSync(join(directory,'guide.md'),'# Guide\n\nContent.\n');
  for (const [tag,attribute] of [['a','href'],['img','src']]) {
    for (const [first,second,decision] of [['guide.md','missing.md','pass'],['missing.md','guide.md','violation']]) {
      const html='<div>\n<'+tag+' data-가=metadata '+attribute+'="'+first+'" '+attribute.toUpperCase()+'="'+second+'">Guide</'+tag+'>\n</div>\n';
      expect(await call('readme',readmeBody+html,directory),decision,decision==='violation'?'link-missing':undefined);
    }
  }
  const html='<div>\n<a data-가=metadata href가=missing.md src가=missing.png id가=hidden name가=hidden id=first ID=second></a>\n</div>\n';
  expect(await call('readme',readmeBody+html+'\n[go](#first)\n',directory),'pass');
  for (const anchor of ['hidden','second']) expect(await call('readme',readmeBody+html+'\n[go](#'+anchor+')\n',directory),'violation','readme-anchor');
});

test('HTML raw text keeps its context across inline tokens and resumes links after its closing tag',async t=>{
  const directory=repository(t);
  for (const tag of ['script','style','textarea','title','xmp','iframe','noembed','noframes']) {
    const raw='<'+tag+' type=text/plain><a href=missing.md>Guide</a><img src=missing.png></'+tag+'>';
    for (const prefix of ['', 'Text ']) {
      expect(await call('readme',readmeBody+prefix+raw+'\n',directory),'pass');
      expect(await call('readme',readmeBody+prefix+raw+'<a href=missing.md>Guide</a>\n',directory),'violation','link-missing');
    }
  }
});

test('HTML raw text also suppresses rendered Markdown links and hidden anchors',async t=>{
  const directory=repository(t);
  const raw='Text <ScRiPt type=text/plain>[Guide](missing.md) ![image](missing.png) <a id=hidden>Guide</a></sCrIpT>';
  expect(await call('readme',readmeBody+raw+'\n',directory),'pass');
  expect(await call('readme',readmeBody+raw+'\n\n[go](#hidden)\n',directory),'violation','readme-anchor');
  expect(await call('readme',readmeBody+raw+'<a id=shown></a>\n\n[go](#shown)\n',directory),'pass');
  expect(await call('readme',readmeBody+raw+'[Guide](missing.md)\n',directory),'violation','link-missing');
});

test('document raw text persists through paragraphs and HTML blocks until its real closing tag',async t=>{
  const directory=repository(t);
  for (const tag of ['script','style','textarea','title','xmp','iframe','noembed','noframes']) {
    const open='Text <'+tag+' type=text/plain>data\n\n', close='\n\n</'+tag+'>\n\n';
    for (const body of ['<a href=missing.md>Guide</a>','<div>\n<img src=missing.png>\n<a id=hidden>Guide</a>\n</div>','[Guide](missing.md) ![image](missing.png)'])
      expect(await call('readme',readmeBody+open+body+close,directory),'pass');
    expect(await call('readme',readmeBody+open+'data'+close+'[Guide](missing.md)\n',directory),'violation','link-missing');
  }
});

test('document raw text cannot supply titles, Markdown heading anchors or HTML anchors',async t=>{
  const directory=repository(t);
  for (const body of ['# Hidden\n\nContent.','<h1 id=custom>Hidden</h1>\n\nContent.']) {
    const raw='Text <script type=text/plain>data\n\n'+body+'\n\n</script>\n\n';
    expect(await call('readme',raw+'Content.\n',directory),'violation','readme-title');
    for (const anchor of ['hidden','custom']) expect(await call('readme',readmeBody+raw+'[go](#'+anchor+')\n',directory),'violation','readme-anchor');
    expect(await call('readme',raw+'# Visible\n\nContent.\n\n[go](#visible)\n',directory),'pass');
  }
  const hidden='Text <script>data\n\n'+prBody+'\n</script>\n\n';
  expect(await call('pull-request',hidden),'pass');
  expect(await call('pull-request',hidden+'{{확인 결과}}\n'),'violation','placeholder');
});

test('document raw text ignores closing tag examples in code and preserves fence checks',async t=>{
  const directory=repository(t);
  for (const code of ['`</script>`','```html\n</script>\n```','    </script>']) {
    const raw='Text <script>data\n\n'+code+'\n\n<a href=missing.md>Guide</a>\n\n</script>\n\n';
    expect(await call('readme',readmeBody+raw,directory),'pass');
    expect(await call('readme',readmeBody+raw+'<a href=missing.md>Guide</a>\n',directory),'violation','link-missing');
  }
  expect(await call('readme',readmeBody+'Text <script>data\n\n```html\n</script>\n',directory),'violation','code-fence');
  expect(await call('readme',readmeBody+'```html\n<script>\n```\n\n<a href=missing.md>Guide</a>\n',directory),'violation','link-missing');
});
