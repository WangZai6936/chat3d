import assert from 'node:assert/strict';import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try{const {fitDistance}=await server.ssrLoadModule('/src/scene/framing.ts');
let checks=0;for(const aspect of [.5,1,2.2])for(const phi of [.02,1.012,1.4]){const size=[30,4.8,20],theta=.733,fov=38*Math.PI/180,d=fitDistance(size,theta,phi,fov,aspect),back=[Math.sin(phi)*Math.sin(theta),Math.cos(phi),Math.sin(phi)*Math.cos(theta)],right=[Math.cos(theta),0,-Math.sin(theta)],up=[-Math.cos(phi)*Math.sin(theta),Math.sin(phi),-Math.cos(phi)*Math.cos(theta)];for(const x of [-15,15])for(const y of [-2.4,2.4])for(const z of [-10,10]){const dot=a=>a[0]*x+a[1]*y+a[2]*z;const depth=d-dot(back);assert.ok(Math.abs(dot(right))/depth<=Math.tan(fov/2)*aspect*.861);assert.ok(Math.abs(dot(up))/depth<=Math.tan(fov/2)*.861);checks++;}}assert.ok(checks===72);console.log('PASS framing fits all 72 corner cases across portrait, landscape and overhead views');
console.log('1 framing check passed');
}finally{await server.close()}
