import {captureIsolatedGpu,isIsolatedGpuCaptureAvailable} from './isolatedGpuCapture';
import {isServerCaptureAvailable,captureWithServer} from './serverCapture';
import {isSoftwareCaptureAvailable,captureSoftwareEvidence} from './softwareCapture';
import type { SceneDocument } from '../domain/types';
export type CaptureView = 'perspective' | 'front' | 'side' | 'back' | 'left' | 'top' | 'bottom' | 'underside';
type Capture = (doc: SceneDocument, view: CaptureView, targetIds?:string[],time?:number,signal?:AbortSignal) => Promise<string>;
let handler: Capture | null = null;
let lastBackend:'webgl'|'server'|'software'|null=null;
export function getLastCaptureBackend(){return lastBackend;}
export function registerSceneCapture(capture: Capture): () => void {handler=capture;return()=>{if(handler===capture)handler=null;};}
export function isSceneCaptureAvailable():boolean{return handler!==null||isServerCaptureAvailable()||isSoftwareCaptureAvailable();}
export interface CaptureEvidence {
 image:string;backend:'webgl'|'server'|'software';projectId:string;revision:number;view:CaptureView;targetIds?:string[];time?:number;
 softwareInfo?:{width:number;height:number;degraded:boolean};
}
export type EvidenceCapture=(doc:SceneDocument,view:CaptureView,targetIds?:string[],time?:number,signal?:AbortSignal)=>Promise<CaptureEvidence>;
export const isIsolatedCaptureAvailable=()=>isIsolatedGpuCaptureAvailable()||isServerCaptureAvailable()||isSoftwareCaptureAvailable();
// Never use the navigation-owned viewport for managed concurrent conversations.
// Every renderer below receives the exact task document and produces its own image.
export const captureIsolatedSceneEvidence:EvidenceCapture=(doc,view,targetIds,time,signal)=>captureEvidence(doc,view,targetIds,time,signal,false);
export const captureSceneEvidence:EvidenceCapture=(doc,view,targetIds,time,signal)=>captureEvidence(doc,view,targetIds,time,signal,true);
async function captureEvidence(doc:SceneDocument,view:CaptureView,targetIds?:string[],time?:number,signal?:AbortSignal,allowViewport=true):Promise<CaptureEvidence>{
 const binding={projectId:doc.projectId,revision:doc.revision,view,...(targetIds?{targetIds:[...targetIds]}:{}),...(time!==undefined?{time}:{})};let failure:unknown;
 const check=()=>{if(signal?.aborted)throw new DOMException('已停止','AbortError');};check();
 if(allowViewport&&handler){try{const image=await handler(doc,view,targetIds,time,signal);check();return {...binding,image,backend:'webgl'};}catch(e){check();failure=e;}}
 if(!allowViewport&&isIsolatedGpuCaptureAvailable()){try{const image=await captureIsolatedGpu(doc,view,targetIds,time,signal);check();return {...binding,image,backend:'webgl'};}catch(e){check();failure=e;}}
 if(isServerCaptureAvailable()){try{const image=(await captureWithServer(doc,[view],targetIds,time,signal))[0];check();return {...binding,image,backend:'server'};}catch(e){check();failure=e;}}
 if(isSoftwareCaptureAvailable()){
  if(time!==undefined)throw Error('软件几何检查暂不支持动画采样，不能用静帧代替动态验收');
  const result=await captureSoftwareEvidence(doc,view,targetIds,signal);check();return {...binding,...result,backend:'software'};
 }
 throw failure??new Error(allowViewport?'三维视口未就绪，且其他检查渲染器均不可用':'独立检查渲染器不可用；不会借用其他会话的视口，当前结果未经视觉验收');
}
export async function captureScene(doc:SceneDocument,view:CaptureView,targetIds?:string[],time?:number,signal?:AbortSignal):Promise<string>{
 lastBackend=null;const result=await captureSceneEvidence(doc,view,targetIds,time,signal);lastBackend=result.backend;return result.image;
}
export async function captureSceneBatch(doc:SceneDocument,views:CaptureView[],targetIds?:string[],signal?:AbortSignal):Promise<string[]>{
 const images:string[]=[];for(const view of views)images.push(await captureScene(doc,view,targetIds,undefined,signal));return images;
}
