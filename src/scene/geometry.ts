import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Geometry } from '../domain/types';

// 视口与导出共享几何构建，避免下载模型与画面不一致。
export function buildPrimitiveGeometry(g: Geometry): THREE.BufferGeometry {
  switch (g.type) {
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
