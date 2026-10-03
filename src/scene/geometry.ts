import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Geometry } from '../domain/types';

// 视口与导出共享几何构建，避免下载模型与画面不一致。
export function buildPrimitiveGeometry(g: Geometry): THREE.BufferGeometry {
  switch (g.type) {
    case 'loft': {
      const {rings,segments:N}=g.params;const positions:number[]=[],indices:number[]=[],uvs:number[]=[];const stride=N+1;
      // Duplicate the UV seam: shared U=0 vertices formerly stretched the final strip.
      for(const r of rings)for(let j=0;j<=N;j++){const a=(j===N?0:j)*Math.PI*2/N;positions.push(r.center[0]+r.radiusX*Math.cos(a),r.center[1],r.center[2]+r.radiusZ*Math.sin(a));uvs.push(j/N,(r.center[1]-rings[0].center[1])/(rings[rings.length-1].center[1]-rings[0].center[1]));}
      for(let i=0;i<rings.length-1;i++)for(let j=0;j<N;j++){const a=i*stride+j,b=a+1,c=(i+1)*stride+j,d=c+1;indices.push(a,c,b,b,c,d);}
      // Independent cap vertices preserve sharp rims and non-collapsed planar UVs.
      for(const upper of [false,true]){const row=upper?rings.length-1:0,r=rings[row],centre=positions.length/3;positions.push(...r.center);uvs.push(.5,.5);const rim=positions.length/3;for(let j=0;j<N;j++){const a=j*Math.PI*2/N;positions.push(r.center[0]+r.radiusX*Math.cos(a),r.center[1],r.center[2]+r.radiusZ*Math.sin(a));uvs.push(.5+.5*Math.cos(a),.5+.5*Math.sin(a));}for(let j=0;j<N;j++){const a=rim+j,b=rim+(j+1)%N;indices.push(centre,upper?b:a,upper?a:b);}}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.computeVertexNormals();
      const normals=geo.getAttribute('normal');for(let i=0;i<rings.length;i++){const a=i*stride,b=a+N,v=new THREE.Vector3().fromBufferAttribute(normals,a).add(new THREE.Vector3().fromBufferAttribute(normals,b)).normalize();normals.setXYZ(a,v.x,v.y,v.z);normals.setXYZ(b,v.x,v.y,v.z);}return geo;
    }
    case 'sweepTube':return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(g.params.points.map(p=>new THREE.Vector3(...p)),false,'centripetal'),g.params.segments,g.params.radius,g.params.radialSegments,false);
    case 'mesh': {const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(g.params.positions,3));geo.setIndex(g.params.indices);if(g.params.uvs)geo.setAttribute('uv',new THREE.Float32BufferAttribute(g.params.uvs,2));if(g.params.normals)geo.setAttribute('normal',new THREE.Float32BufferAttribute(g.params.normals,3));else geo.computeVertexNormals();return geo;}
    case 'lathe': {const geo=new THREE.LatheGeometry(g.params.points.map(p=>new THREE.Vector2(...p)),g.params.segments);geo.computeVertexNormals();return geo;}
    case 'profile': {const shape=new THREE.Shape(g.params.points.map(p=>new THREE.Vector2(...p)));shape.closePath();const geo=new THREE.ExtrudeGeometry(shape,{depth:g.params.depth,bevelEnabled:false,steps:1});geo.translate(0,0,-g.params.depth/2);return geo;}
    case 'capsule':return new THREE.CapsuleGeometry(g.params.radius,g.params.length,8,24);
    case 'frame': {
      const {width:w,height:h,depth:d,thickness:t}=g.params;
      const shape=new THREE.Shape();shape.moveTo(-w/2,-h/2);shape.lineTo(w/2,-h/2);shape.lineTo(w/2,h/2);shape.lineTo(-w/2,h/2);shape.closePath();
      const hole=new THREE.Path();hole.moveTo(-w/2+t,-h/2+t);hole.lineTo(-w/2+t,h/2-t);hole.lineTo(w/2-t,h/2-t);hole.lineTo(w/2-t,-h/2+t);hole.closePath();shape.holes.push(hole);
      const geo=new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false,steps:1});geo.translate(0,0,-d/2);return geo;
    }
    case 'tube': {
      const {outerRadius:r,innerRadius:i,height:h}=g.params;
      const shape=new THREE.Shape();shape.absarc(0,0,r,0,Math.PI*2,false);const hole=new THREE.Path();hole.absarc(0,0,i,0,Math.PI*2,true);shape.holes.push(hole);
      const geo=new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false,steps:1,curveSegments:32});geo.translate(0,0,-h/2);geo.rotateX(-Math.PI/2);return geo;
    }
    case 'trapezoid': {
      const {widthTop:t,widthBottom:b,height:h,depth:d}=g.params;
      const shape=new THREE.Shape();shape.moveTo(-b/2,-h/2);shape.lineTo(b/2,-h/2);shape.lineTo(t/2,h/2);shape.lineTo(-t/2,h/2);shape.closePath();
      const geo=new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false,steps:1});geo.translate(0,0,-d/2);return geo;
    }
    case 'roundedPlate': {
      const {width:w, height:h, depth:d, cornerRadius:r, holeRadius=0}=g.params;
      // XY contour extruded then rotated to XZ; independent planar radius, real empty center.
      const shape=new THREE.Shape();
      shape.moveTo(-w/2+r,-d/2); shape.lineTo(w/2-r,-d/2);
      shape.quadraticCurveTo(w/2,-d/2,w/2,-d/2+r); shape.lineTo(w/2,d/2-r);
      shape.quadraticCurveTo(w/2,d/2,w/2-r,d/2); shape.lineTo(-w/2+r,d/2);
      shape.quadraticCurveTo(-w/2,d/2,-w/2,d/2-r); shape.lineTo(-w/2,-d/2+r);
      shape.quadraticCurveTo(-w/2,-d/2,-w/2+r,-d/2);
      if(holeRadius>0) { const hole=new THREE.Path();hole.absarc(0,0,holeRadius,0,Math.PI*2,true);shape.holes.push(hole); }
      const geometry=new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false,curveSegments:24,steps:1});
      geometry.translate(0,0,-h/2);geometry.rotateX(-Math.PI/2);return geometry;
    }
    case 'box': { const p=g.params; const min=Math.min(p.width,p.height,p.depth); const bevel=p.bevelRadius??Math.min(min*0.08,0.006); return bevel===0?new THREE.BoxGeometry(p.width,p.height,p.depth):new RoundedBoxGeometry(p.width,p.height,p.depth,3,bevel); }
    case 'sphere': return new THREE.SphereGeometry(g.params.radius,Math.max(g.params.widthSegments||32,48),Math.max(g.params.heightSegments||24,24));
    case 'cylinder': return new THREE.CylinderGeometry(g.params.radiusTop,g.params.radiusBottom,g.params.height,Math.max(g.params.radialSegments||32,48));
    case 'cone': return new THREE.ConeGeometry(g.params.radius,g.params.height,Math.max(g.params.radialSegments||32,48));
    case 'plane': return new THREE.PlaneGeometry(g.params.width,g.params.depth,g.params.widthSegments||1,g.params.depthSegments||1);
  }
}
