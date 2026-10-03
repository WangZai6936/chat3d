import type {SceneDocument,Vec3} from './types';
import {validateAnimation,type AnimationProgram,type AnimationTrack} from './animation';
export interface ProcessRoute {targetId:string;offsets:Vec3[];speed:number;dwell:number;returnToStart:boolean;carryIds?:string[]}
export function processRoute(doc:SceneDocument,input:ProcessRoute):AnimationProgram{
 const node=doc.nodes.find(n=>n.id===input.targetId);if(!node)throw Error('路线目标不存在');
 const {offsets,speed,dwell}=input;
 if(!Array.isArray(offsets)||offsets.length<2||offsets.length>16||offsets.some(p=>!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v)||Math.abs(v)>100))||offsets[0].some(v=>v!==0))throw Error('路线需2–16个相对位移点，以[0,0,0]开始，坐标绝对值不超过100米');
 if(!Number.isFinite(speed)||speed<.01||speed>5||!Number.isFinite(dwell)||dwell<0||dwell>60)throw Error('速度需0.01–5米/秒，停留需0–60秒');
 const targets=node.assemblyId?doc.nodes.filter(n=>n.assemblyId===node.assemblyId).map(n=>n.id):[node.id];
 if(doc.animation?.tracks.some(t=>t.targetIds.some(id=>targets.includes(id))&&t.channel!=='position'))throw Error('目标已有其他运动通道，请先明确如何合并，避免旋转/跟随叠加误差');
 const points=offsets.map(p=>[...p] as Vec3);if(input.returnToStart&&points[points.length-1].some(v=>v!==0))points.push([0,0,0]);
 let time=0;const keyframes:{time:number;value:Vec3}[]=[{time:0,value:points[0]}];
 for(let i=1;i<points.length;i++){const distance=Math.hypot(...points[i].map((v,j)=>v-points[i-1][j]));if(distance<.0001)throw Error('相邻路线点不能重复；停留请用停留秒数');time+=distance/speed;keyframes.push({time,value:points[i]});if(dwell>0){time+=dwell;keyframes.push({time,value:points[i]});}}
 if(time>3600)throw Error('路线总时间超过1小时');
 const carries=[...new Set(input.carryIds??[])];if(carries.some(id=>targets.includes(id)||!doc.nodes.some(n=>n.id===id)))throw Error('搬运目标不存在或与运动主体重复');
 const kept=(doc.animation?.tracks??[]).filter(t=>!(t.channel==='position'&&t.targetIds.some(id=>targets.includes(id))));
 if((doc.animation?.tracks??[]).some(t=>t.channel==='position'&&t.targetIds.some(id=>targets.includes(id))&&t.targetIds.some(id=>!targets.includes(id))))throw Error('已有位置轨道还绑定其他组件，需先拆分后编辑');
 if(kept.some(t=>t.targetIds.some(id=>carries.includes(id))))throw Error('载物已有动画，需先明确覆盖关系');
 const prefix='route-'+node.id;
 const tracks:AnimationTrack[]=[...kept,{id:prefix,name:node.assemblyName??node.name,targetIds:targets,channel:'position',keyframes},...carries.map(id=>({id:prefix+'-carry-'+id,name:'随主体搬运',targetIds:[id],channel:'follow' as const,sourceId:node.id,start:0,end:time}))];
 const animation:AnimationProgram={version:1,name:doc.animation?.name??'业务路线',loop:doc.animation?.loop??input.returnToStart,duration:Math.max(time,doc.animation?.duration??0),tracks};
 const errors=validateAnimation(animation,doc.nodes);if(errors.length)throw errors[0];return animation;
}
