// Structural metadata only: never log headers, URLs, credentials or model text.
const LIMIT=64*1024;
const FINISH_REASONS=new Set(['stop','length','tool_calls','function_call','content_filter','error']);
export function createProxyDiagnostics(endpoint,write=record=>console.info('[chat3d-model]',JSON.stringify(record))){
 const started=Date.now();
 const id=globalThis.crypto.randomUUID();
 const safeEndpoint=endpoint==='/chat/completions'?'/chat/completions':endpoint==='/models'?'/models':'other';
 const record={id,endpoint:safeEndpoint,status:null,responseType:'unknown',bytes:0,chunks:0,sseEvents:0,parsedEvents:0,malformedEvents:0,oversizedRecords:0,completionChunks:0,responseApiEvents:0,textCharacters:0,reasoningCharacters:0,toolCallDeltas:0,hasError:false,doneMarker:false,finishReasons:[]};
 let finished=false,mode='other',decoder=new TextDecoder(),line='',data='',droppingLine=false,droppingEvent=false,json='',jsonOversized=false;
 const publish=value=>{try{write(value);}catch{/* Diagnostics must never interrupt proxy traffic. */}};
 publish({id,endpoint:safeEndpoint,phase:'started'});
 const textLength=value=>typeof value==='string'?value.length:Array.isArray(value)?value.reduce((n,item)=>n+(typeof item?.text==='string'?item.text.length:0),0):0;
 function parse(value){
  const raw=value.trim();if(!raw)return;
  if(raw==='[DONE]'){record.doneMarker=true;return;}
  let obj;try{obj=JSON.parse(raw);}catch{record.malformedEvents++;return;}
  record.parsedEvents++;
  if(!obj||typeof obj!=='object')return;
  if(obj.error)record.hasError=true;
  if(typeof obj.type==='string'&&obj.type.startsWith('response.'))record.responseApiEvents++;
  if(Array.isArray(obj.choices)){
   record.completionChunks++;
   for(const choice of obj.choices){
    if(!choice||typeof choice!=='object')continue;
    const message=choice.delta??choice.message;
    if(message&&typeof message==='object'){
     record.textCharacters+=textLength(message.content);
     record.reasoningCharacters+=textLength(message.reasoning_content??message.reasoning??message.thinking);
     if(Array.isArray(message.tool_calls))record.toolCallDeltas+=message.tool_calls.length;
     if(message.function_call)record.toolCallDeltas++;
    }
    if(typeof choice.finish_reason==='string'){
     const reason=FINISH_REASONS.has(choice.finish_reason)?choice.finish_reason:'other';
     if(!record.finishReasons.includes(reason))record.finishReasons.push(reason);
    }
   }
  }
 }
 function consumeLine(value){
  if(value.endsWith('\r'))value=value.slice(0,-1);
  if(!value){
   if(data||droppingEvent){record.sseEvents++;if(!droppingEvent)parse(data);}
   data='';droppingEvent=false;return;
  }
  if(!value.startsWith('data:')||droppingEvent)return;
  const next=value.slice(5).replace(/^ /,'');
  if(data.length+next.length+1>LIMIT){record.oversizedRecords++;data='';droppingEvent=true;return;}
  data+=(data?'\n':'')+next;
 }
 function consumeSse(value){
  for(const part of value.split(/(?<=\n)/)){
   if(!droppingLine){
    if(line.length+part.length>LIMIT){record.oversizedRecords++;line='';droppingLine=true;droppingEvent=true;}
    else line+=part;
   }
   if(part.endsWith('\n')){
    if(!droppingLine)consumeLine(line.slice(0,-1));
    line='';droppingLine=false;
   }
  }
 }
 function consume(value){
  if(mode==='sse')consumeSse(value);
  else if(mode==='json'&&!jsonOversized){
   if(json.length+value.length>LIMIT){json='';jsonOversized=true;record.oversizedRecords++;}
   else json+=value;
  }
 }
 return {
  response(response){
   record.status=response.status;
   const type=(response.headers.get('content-type')??'').split(';')[0].trim().toLowerCase();
   mode=type==='text/event-stream'?'sse':type==='application/json'||type.endsWith('+json')?'json':'other';
   record.responseType=mode==='other'?(type==='text/html'?'html':'other'):mode;
  },
  observe(chunk){
   record.chunks++;record.bytes+=chunk.byteLength;
   record.firstByteMs??=Date.now()-started;
   if(mode!=='other')consume(decoder.decode(chunk,{stream:true}));
  },
  finish(outcome){
   if(finished)return;finished=true;
   consume(decoder.decode());
   if(mode==='sse'){if(line&&!droppingLine)consumeLine(line);consumeLine('');}
   else if(mode==='json'&&!jsonOversized)parse(json);
   publish({...record,finishReasons:[...record.finishReasons],phase:'finished',outcome:outcome==='complete'?'complete':'interrupted',durationMs:Date.now()-started});
  },
 };
}
