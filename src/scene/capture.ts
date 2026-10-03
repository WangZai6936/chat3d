import {isServerCaptureAvailable,captureWithServer} from './serverCapture';
import type { SceneDocument } from '../domain/types';
export type CaptureView = 'perspective' | 'front' | 'side' | 'back' | 'left' | 'top';
type Capture = (doc: SceneDocument, view: CaptureView, targetIds?:string[],time?:number,signal?:AbortSignal) => Promise<string>;
let handler: Capture | null = null;
export function registerSceneCapture(capture: Capture): () => void {
  handler = capture;
  return () => { if(handler === capture) handler = null; };
}
export function isSceneCaptureAvailable():boolean {return handler!==null||isServerCaptureAvailable();}
export async function captureScene(doc: SceneDocument, view: CaptureView, targetIds?:string[],time?:number,signal?:AbortSignal): Promise<string> {
  if(handler){try{return await handler(doc,view,targetIds,time,signal);}catch(e){if(!isServerCaptureAvailable()||signal?.aborted)throw e;}}
  if(isServerCaptureAvailable())return (await captureWithServer(doc,[view],targetIds,time,signal))[0];
  throw new Error('3D视口未就绪或不可用，且Blender检查服务尚未配置');
}

export async function captureSceneBatch(doc:SceneDocument,views:CaptureView[],targetIds?:string[],signal?:AbortSignal):Promise<string[]>{
 if(!handler&&isServerCaptureAvailable())return captureWithServer(doc,views,targetIds,undefined,signal);
 if(handler){try{const images:string[]=[];for(const view of views)images.push(await handler(doc,view,targetIds,undefined,signal));return images;}catch(e){if(!isServerCaptureAvailable()||signal?.aborted)throw e;return captureWithServer(doc,views,targetIds,undefined,signal);}}
 throw Error('尚无可用检查渲染器');
}
