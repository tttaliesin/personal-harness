import MarkdownIt from '../vendor/markdown-it.mjs';
import { knownPlaceholder } from './repository.mjs';

const parser=new MarkdownIt({html:true,linkify:false,typographer:false});
const htmlSpace=char=>char===' ' || char==='\t' || char==='\n' || char==='\r' || char==='\f';
const rawTextTags=new Set(['script','style','textarea','title','xmp','iframe','noembed','noframes']);
// Keep the cursor moving forward so quoted values cannot become separate tags or attributes.
function htmlMarkup(value,state={}) {
  const markup=[], tagStart=/<(\/?)([a-z][a-z0-9-]*)/iy, attributeName=/[^\x00-\x20\x7f-\x9f"'/>=]+/y;
  let cursor=0, lower;
  while (cursor<value.length) {
    if (state.rawText) {
      lower??=value.toLowerCase();
      const name=state.rawText;
      let end=lower.indexOf('</'+name,cursor);
      while (end>=0 && !htmlSpace(value[end+name.length+2]) && value[end+name.length+2]!=='>' && value[end+name.length+2]!=='/') end=lower.indexOf('</'+name,end+2);
      if (end<0) break;
      cursor=end;state.rawText=undefined;
    }
    const start=value.indexOf('<',cursor);
    if (start<0) break;
    cursor=start+1;
    if (value[cursor]==='!' || value[cursor]==='?') {
      let delimiter='>', from=cursor+1;
      if (value.startsWith('<!-->',start)) cursor=start+5;
      else if (value.startsWith('<!--->',start)) cursor=start+6;
      else {
        if (value.startsWith('<!--',start)) {delimiter='-->';from=start+4;}
        else if (value.startsWith('<![CDATA[',start)) {delimiter=']]>';from=start+9;}
        else if (value[cursor]==='?') delimiter='?>';
        const end=value.indexOf(delimiter,from);
        cursor=end<0?value.length:end+delimiter.length;
      }
      markup.push({kind:'comment',start,end:cursor});
      continue;
    }
    tagStart.lastIndex=start;
    const match=tagStart.exec(value);
    if (!match) continue;
    cursor=tagStart.lastIndex;
    const name=match[2].toLowerCase(), closing=!!match[1], attributes=new Map();
    let complete=false;
    while (cursor<value.length) {
      const before=cursor;
      while (htmlSpace(value[cursor])) cursor++;
      if (value[cursor]==='>') {cursor++;complete=true;break;}
      if (!closing && value[cursor]==='/' && value[cursor+1]==='>') {cursor+=2;complete=true;break;}
      if (closing || cursor===before) break;
      attributeName.lastIndex=cursor;
      const attribute=attributeName.exec(value);
      if (!attribute) break;
      cursor=attributeName.lastIndex;
      const afterName=cursor;
      while (htmlSpace(value[cursor])) cursor++;
      let content='';
      if (value[cursor]==='=') {
        cursor++;
        while (htmlSpace(value[cursor])) cursor++;
        const quote=value[cursor], from=cursor;
        if (quote==='"' || quote==="'") {
          const end=value.indexOf(quote,cursor+1);
          if (end<0) {cursor=value.length;break;}
          content=value.slice(cursor+1,end);cursor=end+1;
        } else {
          while (cursor<value.length && !htmlSpace(value[cursor]) && value[cursor]!=='>' && !/[\x00-\x20"'`=<>]/.test(value[cursor])) cursor++;
          if (cursor===from || (cursor<value.length && !htmlSpace(value[cursor]) && value[cursor]!=='>')) break;
          content=value.slice(from,cursor);
        }
      } else cursor=afterName;
      const key=attribute[0].toLowerCase();
      if (!attributes.has(key)) attributes.set(key,content);
    }
    if (!complete) continue;
    markup.push({kind:'tag',name,closing,attributes,start,end:cursor});
    if (!closing && rawTextTags.has(name)) state.rawText=name;
  }
  return markup;
}
function htmlText(value,markup=htmlMarkup(value)) {
  let text='', cursor=0;
  for (const part of markup) {text+=value.slice(cursor,part.start);cursor=part.end;}
  return parser.utils.unescapeAll(text+value.slice(cursor));
}
function markdown(text) {
  const tokens=parser.parse(text,{});
  const doc={lines:[],visible:[],headings:[],title:false,anchors:new Set(),links:[],fence:false,emptyTables:0};
  const counts=new Map(), htmlState={}, tables=[];
  let depth=0;
  const content=value=>{doc.lines.push(value);doc.visible.push(value);};
  const heading=(level,label,visible,topLevel)=>{
    const slug=label.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc}\s-]/gu,'').trim().replace(/ /g,'-');
    let number=counts.get(slug)??0, id=slug;
    while (doc.anchors.has(id)) id=slug+'-'+(++number);
    counts.set(slug,number);doc.anchors.add(id);
    doc.headings.push({level,label,index:doc.lines.length,topLevel});
    doc.lines.push('');doc.visible.push(visible);
    if (level===1 && label.trim()) doc.title=true;
  };
  const htmlLinks=(value,markup=htmlMarkup(value))=>{
    for (const tag of markup) {
      if (tag.kind!=='tag' || tag.closing) continue;
      const target=tag.name==='a'?'href':tag.name==='img'?'src':undefined;
      if (target && tag.attributes.has(target)) doc.links.push({url:parser.utils.unescapeAll(tag.attributes.get(target))});
      if (tag.name==='a' || /^h[1-6]$/.test(tag.name)) for (const key of ['id','name'])
        if (tag.attributes.has(key)) doc.anchors.add(parser.utils.unescapeAll(tag.attributes.get(key)));
    }
  };
  const inline=token=>{
    let visible='', label='';
    for (const child of token.children??[]) {
      if (child.type==='link_open' && !htmlState.rawText) doc.links.push({url:child.attrGet('href')});
      else if (child.type==='image') {visible+='■';label+=child.content;if (!htmlState.rawText) doc.links.push({url:child.attrGet('src')});}
      else if (child.type==='code_inline') {visible+='■';label+=child.content;}
      else if (child.type==='html_inline') {
        const markup=htmlMarkup(child.content,htmlState), text=htmlText(child.content,markup);
        htmlLinks(child.content,markup);visible+=text;label+=text;
      }
      else if (child.type==='softbreak' || child.type==='hardbreak') {visible+='\n';label+='\n';}
      else if (child.type==='text') {
        visible+=child.content;label+=child.content;
      }
    }
    return {visible,label};
  };
  for (let index=0;index<tokens.length;index++) {
    const token=tokens[index];
    if (['blockquote_open','bullet_list_open','ordered_list_open','list_item_open'].includes(token.type)) depth++;
    else if (['blockquote_close','bullet_list_close','ordered_list_close','list_item_close'].includes(token.type)) depth--;
    else if (token.type==='heading_open') {
      const hidden=!!htmlState.rawText, value=inline(tokens[index+1]);
      if (hidden) content(value.visible);
      else heading(Number(token.tag.slice(1)),value.label,value.visible,depth===0);
      index+=2;
    } else if (token.type==='inline') {
      const value=inline(token).visible;
      content(value);
      const table=tables.at(-1);
      if (table?.body && hasContent([value])) table.populated=true;
    }
    else if (token.type==='fence' || token.type==='code_block') {
      doc.lines.push('■');
      if (token.type==='fence') {
        const contentLines=(token.content.match(/\n/g)??[]).length+Number(!!token.content && !token.content.endsWith('\n'));
        if (token.map[1]-token.map[0]<contentLines+2) doc.fence=true;
      }
    } else if (token.type==='html_block') {
      const markup=htmlMarkup(token.content,htmlState), closing=new Map(), pairs=new Map();
      htmlLinks(token.content,markup);
      for (let at=markup.length-1;at>=0;at--) {
        const tag=markup[at];
        if (tag.kind!=='tag' || !/^h[1-6]$/.test(tag.name)) continue;
        if (tag.closing) closing.set(tag.name,at);
        else if (closing.has(tag.name)) pairs.set(at,closing.get(tag.name));
      }
      let offset=0;
      for (let at=0;at<markup.length;at++) {
        const end=pairs.get(at);
        if (end===undefined) continue;
        const open=markup[at], close=markup[end];
        content(htmlText(token.content.slice(offset,open.start)));
        const label=htmlText(token.content.slice(open.end,close.start));
        heading(Number(open.name.slice(1)),label,label,depth===0);
        offset=close.end;at=end;
      }
      content(htmlText(token.content.slice(offset)));
    } else if (token.type==='table_open') {
      tables.push({body:false,populated:false,hidden:!!htmlState.rawText});
    } else if (token.type==='tbody_open') tables.at(-1).body=true;
    else if (token.type==='table_close') {
      const table=tables.pop();
      if (!table.hidden && !table.populated) doc.emptyTables++;
    }
  }
  return doc;
}
export function documentAnchors(text) {return markdown(text).anchors;}

function hasContent(lines) {
  return lines.some(line=>line.replace(/<[^>]*>|[\s|*_:>#\-\[\]]/g,'').length);
}
export function readme({text},policy,{violation,missing}) {
  const doc=markdown(text);
  if (!doc.title) violation('readme-title','Provide a nonempty top-level title (Markdown or HTML).');
  if (doc.fence) violation('code-fence','A fenced code block is not closed.');
  if (doc.visible.some(knownPlaceholder)) violation('placeholder','Replace the visible template placeholder.');
  for (const [i,h] of doc.headings.entries()) {
    const next=doc.headings[i+1];
    if (!h.label.trim() || ((!next || next.level<=h.level) && !hasContent(doc.lines.slice(h.index+1,next?.index))))
      violation('empty-section','Fill or remove the empty heading: '+h.label);
  }
  if (doc.emptyTables) violation('empty-table','Fill or remove the empty table.');
  const local=[];
  for (const link of doc.links) {
    const url=link.url;
    if (!url) {violation('link-target','Provide a nonempty link target.'); continue;}
    if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(url)) continue;
    let name, anchor;
    try {
      const hash=url.indexOf('#');
      name=decodeURIComponent((hash<0?url:url.slice(0,hash)).split('?')[0]);
      anchor=hash<0?'':decodeURIComponent(url.slice(hash+1));
    } catch {violation('link-encoding','Invalid URL encoding: '+url); continue;}
    if (!name) {
      if (anchor && !doc.anchors.has(anchor)) violation('readme-anchor','Unresolved heading or explicit anchor: '+anchor);
    } else local.push({name,anchor});
  }
  return local;
}

export function pr({pr},policy,{violation}) {
  if (!pr.title.trim() || /[\r\n\u2028\u2029]/.test(pr.title)) violation('pr-title','Use a nonempty single-line PR title.');
  const doc=markdown(pr.body);
  if (doc.fence) violation('code-fence','A fenced code block is not closed.');
  if (knownPlaceholder(pr.title) || doc.visible.some(s=>knownPlaceholder(s) || /<[^<>]*[가-힣][^<>]*>/.test(s.replace(/<\/?[a-zA-Z][^<>]*>/g,''))))
    violation('placeholder','Replace PR template placeholders with actual information.');
}
