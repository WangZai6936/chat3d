import type {Geometry} from './types';
import {buildPrimitiveGeometry} from '../scene/geometry';
/** Bounded, welded-edge topology clues. Closed does not mean collision-free or usable. */
export function inspectTopology(geometry:Geometry,tolerance=1e-6){
 if(!Number.isFinite(tolerance)||tolerance<=0||tolerance>.001)throw Error('焊接容差必须在0至0.001米范围内');
 const g=buildPrimitiveGeometry(geometry);
 try{
  const p=g.getAttribute('position'),index=g.index;const count=(index?.count??p.count)/3;
  if(count>200000)throw Error('单部件超过20万面检查预算，请按实际结构拆分检查');
  const welded=new Map<string,number>(),vertex:number[]=[];let next=0;
  for(let i=0;i<p.count;i++){
   const xyz=[p.getX(i),p.getY(i),p.getZ(i)];if(xyz.some(x=>!Number.isFinite(x)))throw Error('网格含非有限坐标');
   const key=xyz.map(x=>Math.round(x/tolerance)).join(',');if(!welded.has(key))welded.set(key,next++);vertex.push(welded.get(key)!);
  }
  const edges=new Map<string,{count:number;direction:number}>(),faces=new Set<string>();let degenerate=0,duplicate=0;
  for(let i=0;i<count;i++){
   const raw=[0,1,2].map(j=>index?index.getX(i*3+j):i*3+j),ids=raw.map(j=>vertex[j]);
   if(new Set(ids).size<3){degenerate++;continue;}
   const a=raw.map(j=>[p.getX(j),p.getY(j),p.getZ(j)]),u=a[1].map((x,k)=>x-a[0][k]),v=a[2].map((x,k)=>x-a[0][k]);
   if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<=tolerance*tolerance){degenerate++;continue;}
   const face=[...ids].sort((a,b)=>a-b).join(',');if(faces.has(face))duplicate++;faces.add(face);
   for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],key=a<b?a+','+b:b+','+a;const e=edges.get(key)??{count:0,direction:0};e.count++;e.direction+=a<b?1:-1;edges.set(key,e);}
  }
  const boundary=[...edges.values()].filter(e=>e.count===1).length,nonManifold=[...edges.values()].filter(e=>e.count>2).length,inconsistent=[...edges.values()].filter(e=>e.count===2&&e.direction!==0).length;
  return {triangles:count,weldedVertices:next,boundaryEdges:boundary,nonManifoldEdges:nonManifold,inconsistentWindingEdges:inconsistent,degenerateTriangles:degenerate,duplicateTriangles:duplicate,tolerance,accepted:false as const,limitations:'仅检查局部网格边拓扑，开口可能是设计需要；闭合不证明壳体厚度、实体连通、自相交、部件装配或视觉质量。容差焊接可能合并极近顶点，需结合对象用途核对。'};
 }finally{g.dispose();}
}
