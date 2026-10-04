import {isServerCaptureAvailable,captureWithServer} from './serverCapture';
import {isSoftwareCaptureAvailable,captureSoftware} from './softwareCapture';
import type { SceneDocument } from '../domain/types';
export type CaptureView = 'perspective' | 'front' | 'side' | 'back' | 'left' | 'top' | 'bottom' | 'underside';
type Capture = (doc: SceneDocument, view: CaptureView, targetIds?:string[],time?:number,signal?:AbortSignal) => Promise<string>;
let handler: Capture | null = null;
let lastBackend:'webgl'|'server'|'software'|null=null;
export function getLastCaptureBackend(){return lastBackend;}
export function registerSceneCapture(capture: Capture): () => void {handler=capture;return()=>{if(handler===capture)handler=null;};}
export function isSceneCaptureAvailable():boolean{return handler!==null||isServerCaptureAvailable()||isSoftwareCaptureAvailable();}
export async function captureScene(doc:SceneDocument,view:CaptureView,targetIds?:string[],time?:number,signal?:AbortSignal):Promise<string>{
 lastBackend=null;let failure:unknown;
 if(handler){try{const data=await handler(doc,view,targetIds,time,signal);lastBackend='webgl';return data;}catch(e){if(signal?.aborted)throw e;failure=e;}}
 if(isServerCaptureAvailable()){try{const data=(await captureWithServer(doc,[view],targetIds,time,signal))[0];lastBackend='server';return data;}catch(e){if(signal?.aborted)throw e;failure=e;}}
 if(isSoftwareCaptureAvailable()){
  if(time!==undefined)throw Error('软件几何检查暂不支持动画采样，不能用静帧代替动态验收');
  const data=await captureSoftware(doc,view,targetIds,signal);lastBackend='software';return data;
 }
 throw failure??new Error('三维视口未就绪，且其他检查渲染器均不可用');
}
export async function captureSceneBatch(doc:SceneDocument,views:CaptureView[],targetIds?:string[],signal?:AbortSignal):Promise<string[]>{
 const images:string[]=[];for(const view of views)images.push(await captureScene(doc,view,targetIds,undefined,signal));return images;
}
