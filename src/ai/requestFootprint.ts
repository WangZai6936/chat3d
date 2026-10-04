import type {Context} from '@earendil-works/pi-ai';
export interface RequestFootprint {systemChars:number;toolSchemaChars:number;userTextChars:number;assistantChars:number;toolResultChars:number;imageBase64Chars:number;imageCount:number;totalSerializedChars:number;toolCount:number;messageCount:number}
/** Exact serialized character counts, not token estimates. Contains no text or secrets. */
export function measureRequestFootprint(context:Context):RequestFootprint{
 const out:RequestFootprint={systemChars:0,toolSchemaChars:0,userTextChars:0,assistantChars:0,toolResultChars:0,imageBase64Chars:0,imageCount:0,totalSerializedChars:JSON.stringify(context).length,toolCount:0,messageCount:context.messages.length};
 for(const m of context.messages){
  if(m.role==='system'){out.toolSchemaChars+=JSON.stringify(m.toolsAdded??[]).length;out.toolCount+=(m.toolsAdded??[]).length;}
  const content=typeof m.content==='string'?m.content:m.content.map(c=>{if(c.type==='image'){out.imageCount++;out.imageBase64Chars+=c.data.length;return {type:'image',mimeType:c.mimeType};}return c;});
  const size=JSON.stringify(content).length;
  if(m.role==='system')out.systemChars+=size;else if(m.role==='user')out.userTextChars+=size;else if(m.role==='assistant')out.assistantChars+=size;else if(m.role==='toolResult')out.toolResultChars+=size;
 }
 return out;
}

export function safeRequestFootprint(value:unknown):RequestFootprint|undefined{
 if(!value||typeof value!=='object')return undefined;
 const out={} as RequestFootprint;
 for(const key of ['systemChars','toolSchemaChars','userTextChars','assistantChars','toolResultChars','imageBase64Chars','imageCount','totalSerializedChars','toolCount','messageCount'] as const){const v=(value as Record<string,unknown>)[key];if(typeof v!=='number'||!Number.isFinite(v)||v<0)return undefined;out[key]=v;}return out;
}
