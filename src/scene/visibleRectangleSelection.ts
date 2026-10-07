import {Color,Matrix4,Mesh,NoBlending,Scene,ShaderMaterial,Vector2,Vector3,Vector4,WebGLRenderTarget,type Camera,type Side,type WebGLRenderer} from 'three';
import {visibleSelectionMeshes,type SelectionObject,type SelectionRectangle} from './rectangleSelection';
/** ID pass: one nearest positive-opacity surface per drawing-buffer pixel.
 * No sparse rays, projected bounding-box hits, or full-scene CPU triangle scan.
 * Uses opaque geometric surfaces, not texture alpha / transparency compositing.
 * Non-antialiased subpixel boundaries can differ from the displayed MSAA image.
 */
export function visibleRectangleIds(objects:SelectionObject[],camera:Camera,rect:SelectionRectangle,renderer?:WebGLRenderer):string[]{
 if(!renderer||renderer.getContext().isContextLost())throw Error('可见框选需要可用的三维视图；选区未改变。');
 const size=renderer.getDrawingBufferSize(new Vector2()),width=size.x,height=size.y;
 if(width<=0||height<=0)return [];
 const x0=Math.max(0,Math.ceil((rect.left+1)*width/2-.5)),x1=Math.min(width,Math.ceil((rect.right+1)*width/2-.5));
 const y0=Math.max(0,Math.ceil((1-rect.top)*height/2-.5)),y1=Math.min(height,Math.ceil((1-rect.bottom)*height/2-.5));
 if(x0>=x1||y0>=y1)return [];
 const scene=new Scene(),materials=new Map<string,ShaderMaterial>(),ids=[''],idMap=new Map<string,number>();
 const materialFor=(side:Side,visible:boolean)=>{const key=`${side}:${visible}`;let material=materials.get(key);if(!material){material=new ShaderMaterial({uniforms:{objectId:{value:new Vector3()}},vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform vec3 objectId; void main(){gl_FragColor=vec4(objectId,1.0);}',side,visible,blending:NoBlending,toneMapped:false});materials.set(key,material);}return material;};
 camera.updateMatrixWorld();
 for(const {id,mesh} of visibleSelectionMeshes(objects,camera)){
  let value=idMap.get(id);if(value===undefined){value=ids.length;if(value>0xffffff)throw Error('框选 ID 缓冲区容量不足；选区未改变。');idMap.set(id,value);ids.push(id);}
  const source=mesh.material;
  // Reuse geometry without reparenting or mutating live scene objects/materials.
  const mapMaterial=(m:import('three').Material)=>materialFor(m.side,m.visible&&m.opacity!==0);
  const proxy=new Mesh(mesh.geometry,Array.isArray(source)?source.map(mapMaterial):mapMaterial(source));
  proxy.matrixAutoUpdate=false;proxy.matrix.copy(mesh.matrixWorld);proxy.layers.mask=mesh.layers.mask;
  const color=new Vector3((value&255)/255,((value>>8)&255)/255,((value>>16)&255)/255);
  proxy.onBeforeRender=(_r,_s,_c,_g,m)=>{const shader=m as ShaderMaterial;shader.uniforms.objectId.value.copy(color);shader.uniformsNeedUpdate=true;};
  scene.add(proxy);
 }
 const target=new WebGLRenderTarget(1,1,{depthBuffer:true,stencilBuffer:false});
 const previous={target:renderer.getRenderTarget(),cube:renderer.getActiveCubeFace(),mipmap:renderer.getActiveMipmapLevel(),viewport:renderer.getViewport(new Vector4()),scissor:renderer.getScissor(new Vector4()),scissorTest:renderer.getScissorTest(),color:renderer.getClearColor(new Color()),alpha:renderer.getClearAlpha(),autoClear:renderer.autoClear,xr:renderer.xr.enabled};
 const picked=new Set<string>(),selectionCamera=camera.clone();selectionCamera.matrixAutoUpdate=false;selectionCamera.matrix.copy(camera.matrixWorld);const tileSize=Math.min(1024,renderer.capabilities.maxTextureSize);
 try{
  renderer.xr.enabled=false;renderer.autoClear=true;renderer.setClearColor(0,0);
  for(let y=y0;y<y1;y+=tileSize)for(let x=x0;x<x1;x+=tileSize){
   const w=Math.min(tileSize,x1-x),h=Math.min(tileSize,y1-y);target.setSize(w,h);
   const left=x/width*2-1,right=(x+w)/width*2-1,top=1-y/height*2,bottom=1-(y+h)/height*2;
   const crop=new Matrix4().set(2/(right-left),0,0,-(right+left)/(right-left),0,2/(top-bottom),0,-(top+bottom)/(top-bottom),0,0,1,0,0,0,0,1);
   selectionCamera.projectionMatrix.copy(camera.projectionMatrix).premultiply(crop);selectionCamera.projectionMatrixInverse.copy(selectionCamera.projectionMatrix).invert();
   // setRenderTarget uses device-pixel target.viewport. setViewport would multiply DPR again.
   renderer.setRenderTarget(target);renderer.render(scene,selectionCamera);
   const pixels=new Uint8Array(w*h*4);renderer.readRenderTargetPixels(target,0,0,w,h,pixels);
   if(renderer.getContext().isContextLost())throw Error('三维上下文已丢失；选区未改变。');
   for(let i=0;i<pixels.length;i+=4){const id=pixels[i]|pixels[i+1]<<8|pixels[i+2]<<16;if(id&&ids[id])picked.add(ids[id]);}
  }
  return [...picked];
 }finally{
  renderer.setViewport(previous.viewport);renderer.setScissor(previous.scissor);renderer.setScissorTest(previous.scissorTest);renderer.setRenderTarget(previous.target,previous.cube,previous.mipmap);renderer.setClearColor(previous.color,previous.alpha);renderer.autoClear=previous.autoClear;renderer.xr.enabled=previous.xr;
  target.dispose();for(const material of materials.values())material.dispose();scene.clear();
 }
}
