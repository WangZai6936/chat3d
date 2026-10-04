import {Box3,Color,Matrix4,Quaternion,Vector3} from 'three';
import type {SceneDocument,Vec3} from '../domain/types';
import {buildPrimitiveGeometry} from './geometry';
import type {CaptureView} from './capture';
export function isSoftwareCaptureAvailable(){return typeof document!=='undefined'&&typeof CanvasRenderingContext2D!=='undefined'&&typeof ImageData!=='undefined';}
/** Bounded CPU z-buffer. Geometry evidence only: no PBR, textures, refraction or shadows. */
export async function rasterizeScene(doc:SceneDocument,view:CaptureView,targetIds?:string[],options:{width?:number;height?:number;signal?:AbortSignal}={}){
 const width=options.width??640,height=options.height??480;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<64||height<64||width>1280||height>1280)throw Error('软件检查图尺寸无效');
 const direction:Record<CaptureView,Vec3>={perspective:[1,.75,1],front:[0,0,1],back:[0,0,-1],side:[1,0,0],left:[-1,0,0],top:[0,1,0],bottom:[0,-1,0],underside:[.5,-1,.5]};
 if(!direction[view])throw Error('检查视角无效');
 const toward=new Vector3(...direction[view]).normalize(),right=new Vector3().crossVectors((view==='top'||view==='bottom')?new Vector3(0,0,-1):new Vector3(0,1,0),toward).normalize(),up=new Vector3().crossVectors(toward,right);
 const geometries:{p:Float32Array|ArrayLike<number>;index:ArrayLike<number>|null;matrix:Matrix4;color:number[];opacity:number;target:boolean}[]=[],all=new Box3(),focus=new Box3();
 const ids=targetIds?.length?new Set(targetIds):null,materials=new Map(doc.materials.map(m=>[m.id,m]));let triangles=0,matched=0;
 for(const n of doc.nodes){
  if(options.signal?.aborted)throw new DOMException('已停止','AbortError');if(!n.visible||!n.geometry)continue;
  const g=buildPrimitiveGeometry(n.geometry);try{const p=g.getAttribute('position');const matrix=new Matrix4().compose(new Vector3(...n.transform.position),new Quaternion(...n.transform.rotationQuaternion),new Vector3(...n.transform.scale));g.computeBoundingBox();const b=g.boundingBox!.clone().applyMatrix4(matrix);all.union(b);if(!ids||ids.has(n.id)){focus.union(b);matched++;}const count=(g.index?.count??p.count)/3;triangles+=count;if(triangles>700000)throw Error('软件检查超过70万三角面预算，需分区检查或使用WebGL');const m=materials.get(n.materialId??'');const color=new Color(m?.baseColor??'#aab6c3').convertLinearToSRGB();geometries.push({p:Float32Array.from(p.array),index:g.index?Uint32Array.from(g.index.array):null,matrix,color:[color.r*255,color.g*255,color.b*255],opacity:m?.opacity??1,target:!ids||ids.has(n.id)});}finally{g.dispose();}
 }
 if(!matched||focus.isEmpty())throw Error('没有可见的取景目标');
 const center=focus.getCenter(new Vector3());let xmax=0,ymax=0;
 for(const x of [focus.min.x,focus.max.x])for(const y of [focus.min.y,focus.max.y])for(const z of [focus.min.z,focus.max.z]){const p=new Vector3(x,y,z).sub(center);xmax=Math.max(xmax,Math.abs(p.dot(right)));ymax=Math.max(ymax,Math.abs(p.dot(up)));}
 const scale=Math.min((width-24)/Math.max(.01,2*xmax),(height-24)/Math.max(.01,2*ymax))*.91;
 const data=new Uint8ClampedArray(width*height*4),depth=new Float32Array(width*height);depth.fill(-Infinity);for(let i=0;i<data.length;i+=4){data[i]=228;data[i+1]=235;data[i+2]=241;data[i+3]=255;}
 const owner=new Uint8Array(width*height);
 const light=new Vector3(-.5,1,.7).normalize();let pixelChecks=0,drawn=0,processed=0;
 // Opaque first, then translucent far-to-near candidates. This is an explicit visual approximation.
 geometries.sort((a,b)=>Number(a.opacity<.98)-Number(b.opacity<.98));
 for(const g of geometries){
  const count=g.p.length/3,projected=new Float32Array(count*3),world:Vector3[]=[];
  for(let i=0;i<count;i++){const w=new Vector3(g.p[i*3],g.p[i*3+1],g.p[i*3+2]).applyMatrix4(g.matrix);world.push(w);const p=w.clone().sub(center);projected[i*3]=width/2+p.dot(right)*scale;projected[i*3+1]=height/2-p.dot(up)*scale;projected[i*3+2]=p.dot(toward);}
  const len=g.index?.length??count;
  for(let i=0;i<len;i+=3){
   if(++processed%2048===0){if(options.signal?.aborted)throw new DOMException('已停止','AbortError');await new Promise(r=>setTimeout(r,0));}
   const ai=g.index?.[i]??i,bi=g.index?.[i+1]??i+1,ci=g.index?.[i+2]??i+2;
   const ax=projected[ai*3],ay=projected[ai*3+1],bx=projected[bi*3],by=projected[bi*3+1],cx=projected[ci*3],cy=projected[ci*3+1];
   const area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);if(Math.abs(area)<.02)continue;
   const minX=Math.max(0,Math.floor(Math.min(ax,bx,cx))),maxX=Math.min(width-1,Math.ceil(Math.max(ax,bx,cx))),minY=Math.max(0,Math.floor(Math.min(ay,by,cy))),maxY=Math.min(height-1,Math.ceil(Math.max(ay,by,cy)));if(minX>maxX||minY>maxY)continue;
   pixelChecks+=(maxX-minX+1)*(maxY-minY+1);if(pixelChecks>150000000)throw Error('软件检查像素预算超限，请缩小范围或使用WebGL');
   const normal=new Vector3().crossVectors(world[bi].clone().sub(world[ai]),world[ci].clone().sub(world[ai])).normalize();if(normal.dot(toward)<0)normal.negate();const shade=.4+.5*Math.max(0,normal.dot(light))+.1*Math.abs(normal.y);
   for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
    const px=x+.5,py=y+.5,w1=((bx-px)*(cy-py)-(by-py)*(cx-px))/area,w2=((cx-px)*(ay-py)-(cy-py)*(ax-px))/area,w3=1-w1-w2;if(w1<0||w2<0||w3<0)continue;
    const z=w1*projected[ai*3+2]+w2*projected[bi*3+2]+w3*projected[ci*3+2],k=y*width+x;if(z<depth[k])continue;const alpha=g.opacity;if(alpha>=.98){depth[k]=z;owner[k]=g.target?1:0;}for(let c=0;c<3;c++)data[k*4+c]=g.color[c]*shade*alpha+data[k*4+c]*(1-alpha);drawn++;
   }
  }
 }
 return {width,height,data,triangles,pixelChecks,drawn,visibleTargetPixels:owner.reduce((a,b)=>a+b,0),backend:'software' as const,limitations:'软件几何检查图：保留实际三角面与深度遮挡；不支持PBR、纹理、阴影或精确透明折射，不能用于材质验收。'};
}
export async function rasterizeWithFallback(doc:SceneDocument,view:CaptureView,targetIds?:string[],signal?:AbortSignal,render:typeof rasterizeScene=rasterizeScene){
 const sizes=[[640,480],[320,240],[160,120]] as const;
 for(let index=0;index<sizes.length;index++){
  if(signal?.aborted)throw new DOMException('已停止','AbortError');
  const [width,height]=sizes[index];try{return {...await render(doc,view,targetIds,{width,height,signal}),degraded:index>0};}
  catch(error){if(signal?.aborted||index===sizes.length-1||!(error instanceof Error)||!error.message.includes('软件检查像素预算超限'))throw error;}
 }
 throw Error('软件截图未生成');
}
let lastSoftwareInfo:{width:number;height:number;degraded:boolean}|null=null;
export function getLastSoftwareCaptureInfo(){return lastSoftwareInfo;}
export async function captureSoftware(doc:SceneDocument,view:CaptureView,targetIds?:string[],signal?:AbortSignal){
 lastSoftwareInfo=null;if(!isSoftwareCaptureAvailable())throw Error('软件检查画布不可用');const r=await rasterizeWithFallback(doc,view,targetIds,signal);const canvas=document.createElement('canvas');canvas.width=r.width;canvas.height=r.height;const ctx=canvas.getContext('2d');if(!ctx)throw Error('软件检查画布创建失败');ctx.putImageData(new ImageData(r.data,r.width,r.height),0,0);lastSoftwareInfo={width:r.width,height:r.height,degraded:r.degraded};return canvas.toDataURL('image/png');
}

/** Geometry-only camera aid; it does not certify detail or remove occluders. */
export async function suggestVisibleViews(doc:SceneDocument,targetIds:string[],signal?:AbortSignal){
 if(!targetIds.length||targetIds.length>96)throw Error('视角诊断需要1–96个真实目标');
 const ids=new Set(targetIds);if(targetIds.some(id=>!doc.nodes.some(n=>n.id===id&&n.visible&&n.geometry)))throw Error('视角目标不存在');
 const isolated={...doc,nodes:doc.nodes.filter(n=>ids.has(n.id))};
 const scores=[];for(const view of ['perspective','front','back','side','left','top','bottom','underside'] as CaptureView[]){
  const visible=await rasterizeScene(doc,view,targetIds,{width:160,height:120,signal}),alone=await rasterizeScene(isolated,view,targetIds,{width:160,height:120,signal});
  scores.push({view,visiblePixels:visible.visibleTargetPixels,projectedPixels:alone.visibleTargetPixels,fraction:alone.visibleTargetPixels?visible.visibleTargetPixels/alone.visibleTargetPixels:0});
 }
 const ranked=[...scores].sort((a,b)=>b.fraction-a.fraction||b.visiblePixels-a.visiblePixels);
 return {recommended:ranked.some(s=>s.projectedPixels>0)?ranked.slice(0,2).map(s=>s.view):[],scores,accepted:false,limitations:'低分辨率软件几何可见面积估计，仅辅助选角；不证明关键结构或操作接触可见。透明表面近似处理，仍需检查实际近景。'};
}
