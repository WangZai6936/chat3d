import type {SceneDocument} from './types';
import {serializeProject} from './project';
/** Portable model-only diagnostic payload. No chat, model configuration or credentials. */
export async function encodeReviewProject(doc:SceneDocument):Promise<string>{
 const bytes=new TextEncoder().encode(serializeProject(doc));
 const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
 const zipped=new Uint8Array(await new Response(stream).arrayBuffer());
 let binary='';for(let i=0;i<zipped.length;i+=8192)binary+=String.fromCharCode(...zipped.subarray(i,i+8192));
 return 'CHAT3D-REVIEW-1:'+btoa(binary);
}
