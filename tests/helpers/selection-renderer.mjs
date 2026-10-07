import {Color,Vector2,Vector3,Vector4,Raycaster} from 'three';
// CPU raster oracle for ID-pass contract tests. NOT a WebGL renderer: this cannot
// validate shader compilation, GPU drivers, or real framebuffer formats.
export function selectionRenderer(width=64,height=64,{raster=true,tileSize=1024,failRead=false,pixelRatio=1}={}){
 const state={target:null,cube:0,mipmap:0,viewport:new Vector4(4,5,width,height),scissor:new Vector4(2,3,10,12),scissorTest:true,color:new Color('#abcdef'),alpha:.4,autoClear:false,xr:{enabled:true},renders:0,reads:0,pixels:null,scenes:[],currentViewport:new Vector4(4,5,width,height).multiplyScalar(pixelRatio)};
 return Object.assign(state,{
  capabilities:{maxTextureSize:tileSize},getContext:()=>({isContextLost:()=>false}),getDrawingBufferSize:v=>v.set(width,height),getRenderTarget:()=>state.target,getActiveCubeFace:()=>state.cube,getActiveMipmapLevel:()=>state.mipmap,getViewport:v=>v.copy(state.viewport),getScissor:v=>v.copy(state.scissor),getScissorTest:()=>state.scissorTest,getClearColor:c=>c.copy(state.color),getClearAlpha:()=>state.alpha,
  setRenderTarget(t,c=0,m=0){state.target=t;state.cube=c;state.mipmap=m;state.currentViewport=t?t.viewport.clone():state.viewport.clone().multiplyScalar(pixelRatio)},setViewport(...v){state.viewport=v[0]?.isVector4?v[0].clone():new Vector4(...v);state.currentViewport=state.viewport.clone().multiplyScalar(pixelRatio)},setScissor(v){state.scissor=v.clone()},setScissorTest:v=>state.scissorTest=v,setClearColor(c,a=1){state.color=new Color(c);state.alpha=a},
  render(scene,camera){state.renders++;state.scenes.push(scene.children.length);scene.updateMatrixWorld();camera.updateMatrixWorld();const w=state.target.width,h=state.target.height;if(state.currentViewport.x!==0||state.currentViewport.y!==0||state.currentViewport.z!==w||state.currentViewport.w!==h)throw Error('ID viewport/device-pixel size mismatch');state.pixels=new Uint8Array(w*h*4);const colors=new Map();
   for(const mesh of scene.children){const mat=Array.isArray(mesh.material)?mesh.material.find(m=>m.visible):mesh.material;if(!mat?.visible)continue;mesh.onBeforeRender(this,scene,camera,mesh.geometry,mat);colors.set(mesh,mat.uniforms.objectId.value.clone());}
   if(!raster){let p=0;for(const color of colors.values()){if(p+3>=state.pixels.length)break;state.pixels[p++]=Math.round(color.x*255);state.pixels[p++]=Math.round(color.y*255);state.pixels[p++]=Math.round(color.z*255);state.pixels[p++]=255;}return;}
   const ray=new Raycaster(),near=new Vector3(),far=new Vector3();
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){const point=new Vector2((x+.5)/w*2-1,(y+.5)/h*2-1);ray.setFromCamera(point,camera);near.set(point.x,point.y,-1).unproject(camera);far.set(point.x,point.y,1).unproject(camera);ray.near=Math.max(0,near.clone().sub(ray.ray.origin).dot(ray.ray.direction));ray.far=far.clone().sub(ray.ray.origin).dot(ray.ray.direction);const hit=ray.intersectObjects([...colors.keys()],false)[0];if(!hit)continue;const color=colors.get(hit.object),i=(y*w+x)*4;state.pixels[i]=Math.round(color.x*255);state.pixels[i+1]=Math.round(color.y*255);state.pixels[i+2]=Math.round(color.z*255);state.pixels[i+3]=255;}
  },
  readRenderTargetPixels(_t,_x,_y,_w,_h,pixels){state.reads++;if(failRead)throw Error('readback failed');pixels.set(state.pixels)}
 });
}
