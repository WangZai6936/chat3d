import {embeddedTexture,proceduralMaps,materialReady} from './surfaceTextures';
import * as THREE from 'three';
import type {Material} from '../domain/types';
// Shared by viewport and GLB export, including the same local canvas labels.
export function createSceneMaterial(m?:Material,label?:string):THREE.MeshStandardMaterial{
 const material=new THREE.MeshStandardMaterial({color:m?.baseColor??'#A5ABB4',roughness:m?.roughness??.5,metalness:m?.metalness??.35,opacity:m?.opacity??1,transparent:!!m?.transparent||(m?.opacity??1)<1,alphaTest:m?.alphaTest??0,side:m?.doubleSided?THREE.DoubleSide:THREE.FrontSide,depthWrite:!m?.transparent&&(m?.opacity??1)>=1,emissive:m?.emissive??'#000000',emissiveIntensity:m?.emissiveIntensity??0});
 const pending:Promise<void>[]=[];
 if(m?.surface){const maps=proceduralMaps(m.surface);material.normalMap=maps.normal;material.roughnessMap=maps.rough;material.normalScale.setScalar(m.surface.strength);}
 const keys={baseColor:'map',normal:'normalMap',roughness:'roughnessMap',metalness:'metalnessMap',emissive:'emissiveMap',occlusion:'aoMap'} as const;
 if(m?.maps)for(const [key,field] of Object.entries(keys)){const spec=m.maps[key as keyof typeof keys];if(spec){const loaded=embeddedTexture(spec,key==='baseColor'||key==='emissive');material[field]?.dispose();material[field]=loaded.texture;pending.push(loaded.ready);}}
 if(m?.normalScale!==undefined)material.normalScale.setScalar(m.normalScale);
 const ready=Promise.all(pending).then(()=>{});materialReady.set(material,ready);ready.catch(()=>{material.userData.textureError='图片贴图解码失败';});
 if(label && typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d');
  if(ctx){ctx.fillStyle='#ffffff';ctx.font='600 105px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,512,128,1000);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;material.map=texture;material.transparent=true;material.alphaTest=.04;material.depthWrite=false;material.side=THREE.DoubleSide;}
 }
 return material;
}
