import {Fragment} from 'react';
// Small, safe presentation subset. No HTML evaluation or model-authored links/images.
export function MessageText({text}:{text:string}){
 const inline=(line:string)=>line.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((part,i)=>part.startsWith('**')&&part.endsWith('**')?<strong key={i}>{part.slice(2,-2)}</strong>:part.startsWith('`')&&part.endsWith('`')?<code key={i} className="rounded bg-black/20 px-1">{part.slice(1,-1)}</code>:<Fragment key={i}>{part}</Fragment>);
 return <div className="break-words select-text space-y-1">{text.split('\n').map((line,i)=>{const bullet=/^\s*(?:[-*]|\d+[.、])\s+/.exec(line);return <div key={i} className={bullet?'pl-3':''}>{bullet?<><span className="mr-2 opacity-60">{bullet[0].trim()}</span>{inline(line.slice(bullet[0].length))}</>:inline(line)||'\u00a0'}</div>})}</div>;
}
