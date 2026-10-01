import type { SceneDocument } from '../domain/types';
export type CaptureView = 'perspective' | 'front' | 'side' | 'top';
type Capture = (doc: SceneDocument, view: CaptureView, targetIds?:string[]) => Promise<string>;
let handler: Capture | null = null;
export function registerSceneCapture(capture: Capture): () => void {
  handler = capture;
  return () => { if(handler === capture) handler = null; };
}
export async function captureScene(doc: SceneDocument, view: CaptureView, targetIds?:string[]): Promise<string> {
  if (!handler) throw new Error('3D 视口尚未就绪，无法进行截图复核');
  return handler(doc, view, targetIds);
}
