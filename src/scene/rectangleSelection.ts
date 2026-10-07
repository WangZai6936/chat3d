import {Frustum,Matrix4,Mesh,Vector4,type Camera,type Object3D,type WebGLRenderer} from 'three';
import {visibleRectangleIds} from './visibleRectangleSelection';
export interface SelectionRectangle {left:number;right:number;top:number;bottom:number}
export interface SelectionObject {id:string;object:Object3D;assemblyId?:string}
export function normalizedSelectionRect(rect:SelectionRectangle):SelectionRectangle|null {
 if(!Object.values(rect).every(Number.isFinite))return null;
 const left=Math.max(-1,Math.min(rect.left,rect.right)),right=Math.min(1,Math.max(rect.left,rect.right));
 const bottom=Math.max(-1,Math.min(rect.top,rect.bottom)),top=Math.min(1,Math.max(rect.top,rect.bottom));
 return left<right&&bottom<top?{left,right,bottom,top}:null;
}
export function visibleSelectionMeshes(objects:SelectionObject[],camera:Camera):Array<{id:string;mesh:Mesh}> {
 const result:Array<{id:string;mesh:Mesh}>=[];
 for(const item of objects){
  let visible=true;for(let p:Object3D|null=item.object;p;p=p.parent)if(!p.visible){visible=false;break;}
  if(!visible)continue;item.object.updateWorldMatrix(true,true);
  item.object.traverseVisible(o=>{if((o as Mesh).isMesh&&camera.layers.test(o.layers))result.push({id:item.id,mesh:o as Mesh});});
 }
 return result;
}
// Homogeneous clipping handles near/far planes and triangles crossing the camera.
// A bounding volume is only a broad-phase rejection, never evidence of selection.
function clippedTriangle(points:Vector4[],rect:SelectionRectangle):boolean {
 const planes=[(p:Vector4)=>p.x-rect.left*p.w,(p:Vector4)=>rect.right*p.w-p.x,(p:Vector4)=>p.y-rect.bottom*p.w,(p:Vector4)=>rect.top*p.w-p.y,(p:Vector4)=>p.z+p.w,(p:Vector4)=>p.w-p.z];
 for(const distance of planes){const next:Vector4[]=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],da=distance(a),db=distance(b);if(da>=0)next.push(a);if((da>=0)!==(db>=0))next.push(a.clone().lerp(b,da/(da-db)));}points=next;if(points.length<3)return false;}
 // A tangent edge or vertex has no selectable area.
 let area=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if(a.w<=0||b.w<=0)return false;area+=(a.x*b.y-b.x*a.y)/(a.w*b.w);}
 return Math.abs(area)>1e-16;
}
export function throughRectangleIds(objects:SelectionObject[],camera:Camera,rect:SelectionRectangle):string[]{
 camera.updateMatrixWorld();const viewProjection=new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
 const crop=new Matrix4().set(2/(rect.right-rect.left),0,0,-(rect.right+rect.left)/(rect.right-rect.left),0,2/(rect.top-rect.bottom),0,-(rect.top+rect.bottom)/(rect.top-rect.bottom),0,0,1,0,0,0,0,1);
 const frustum=new Frustum().setFromProjectionMatrix(crop.multiply(viewProjection));const selected=new Set<string>();
 for(const {id,mesh} of visibleSelectionMeshes(objects,camera)){
  if(selected.has(id)||!frustum.intersectsObject(mesh))continue;
  const geometry=mesh.geometry,position=geometry.getAttribute('position');if(!position)continue;
  const index=geometry.index,total=index?.count??position.count,mat=mesh.material;
  const groups=Array.isArray(mat)?geometry.groups:[{start:0,count:total,materialIndex:0}];
  const matrix=new Matrix4().multiplyMatrices(viewProjection,mesh.matrixWorld);
  for(const group of groups){const material=Array.isArray(mat)?mat[group.materialIndex??0]:mat;if(!material?.visible||material.opacity===0)continue;
   const start=Math.max(group.start,geometry.drawRange.start),end=Math.min(total,group.start+group.count,geometry.drawRange.start+geometry.drawRange.count);
   for(let i=start;i+2<end;i+=3){const points=[0,1,2].map(k=>{const j=index?index.getX(i+k):i+k;return new Vector4(position.getX(j),position.getY(j),position.getZ(j),1).applyMatrix4(matrix);});if(clippedTriangle(points,rect)){selected.add(id);break;}}
   if(selected.has(id))break;
  }
 }
 return [...selected];
}
/** Default: depth-tested ID pixels. Through: actual projected triangle overlap.
 * Whole-model expansion is deliberately AFTER the visible/through hit test. */
export function rectangleObjectIds(objects:SelectionObject[],camera:Camera,rectangle:SelectionRectangle,wholeModel=false,options:{through?:boolean;renderer?:WebGLRenderer}={}):string[]{
 const rect=normalizedSelectionRect(rectangle);if(!rect)return [];
 const hits=options.through?throughRectangleIds(objects,camera,rect):visibleRectangleIds(objects,camera,rect,options.renderer);
 const picked=new Set(hits);
 if(wholeModel){const groups=new Set(objects.filter(o=>picked.has(o.id)&&o.assemblyId).map(o=>o.assemblyId));for(const item of objects)if(item.assemblyId&&groups.has(item.assemblyId))picked.add(item.id);}
 return objects.filter(o=>picked.has(o.id)).map(o=>o.id);
}
