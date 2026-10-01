import * as THREE from 'three';
import type {Material} from '../domain/types';
// Shared by viewport and GLB export, including the same local canvas labels.
export function createSceneMaterial(m?:Material,label?:string):THREE.MeshStandardMaterial{
 const material=new THREE.MeshStandardMaterial({color:m?.baseColor??'#A5ABB4',roughness:m?.roughness??.5,metalness:m?.metalness??.35,opacity:m?.opacity??1,transparent:(m?.opacity??1)<1,depthWrite:(m?.opacity??1)>=1,emissive:m?.emissive??'#000000',emissiveIntensity:m?.emissiveIntensity??0});
 if(label && typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d');
  if(ctx){ctx.fillStyle='#ffffff';ctx.font='600 105px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,512,128,1000);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;material.map=texture;material.transparent=true;material.alphaTest=.04;material.depthWrite=false;material.side=THREE.DoubleSide;}
 }
 return material;
}
