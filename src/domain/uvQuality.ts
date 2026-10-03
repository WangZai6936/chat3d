import type {SceneNode} from './types';
export function inspectMeshUV(node:SceneNode){
 const g=node.geometry;if(g?.type!=='mesh')return {status:'parametric' as const,triangles:0,degenerateUV:0};
 const p=g.params;if(!p.uvs)return {status:'missing' as const,triangles:p.indices.length/3,degenerateUV:0};
 let degenerateUV=0,geometryTriangles=0;
 for(let i=0;i<p.indices.length;i+=3){const [a,b,c]=p.indices.slice(i,i+3),pos=p.positions,uv=p.uvs;
  const x=[0,1,2].map(j=>pos[b*3+j]-pos[a*3+j]),y=[0,1,2].map(j=>pos[c*3+j]-pos[a*3+j]);
  const area=Math.hypot(x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]);if(area<1e-12)continue;geometryTriangles++;
  const uvArea=Math.abs((uv[b*2]-uv[a*2])*(uv[c*2+1]-uv[a*2+1])-(uv[b*2+1]-uv[a*2+1])*(uv[c*2]-uv[a*2]));if(uvArea<1e-10)degenerateUV++;
 }
 return {status:degenerateUV?'collapsed' as const:'coordinates_present' as const,triangles:geometryTriangles,degenerateUV};
}
