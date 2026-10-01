// @ts-nocheck
// Shared procedural standard from the independently reviewed SMT sandbox.
import * as T from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
export function createWorkshop({text=true,lines=2,people=true,materialZone=true,qualityZone=true}={}){
 const root=new T.Group();root.name='SMT Workshop';const pickables=[],labels=[],boards=[],vehicles=[];const geo=new Map();
 const mats={};const material=(name,color,rough=.65,metal=.0,extra={})=>mats[name]=new T.MeshStandardMaterial({color,roughness:rough,metalness:metal,...extra});
 material('panel','#e2e9e8',.48,.13);material('bright','#f7faf7',.48,.05);material('dark','#293a40',.68,.15);material('base','#586f78',.8,.05);material('teal','#407e79',.48,.20);material('blue','#6a8799',.52,.2);material('steel','#a6b8bd',.34,.7);material('rubber','#26343a',.9);material('glass','#345362',.23,.28,{transparent:true,opacity:.67,depthWrite:false});material('screen','#153c47',.38,.15,{emissive:'#1f6468',emissiveIntensity:.35});material('green','#52c5a2',.35,.1,{emissive:'#268c6e',emissiveIntensity:.3});material('yellow','#dbb358',.65);material('red','#c26050',.55);material('floor','#b8c7ca',.88);material('lane','#839b9e',.92);material('zone','#a6bcbd',.92);material('pcb','#256958',.58);material('box','#b09d7b',.87);material('skin','#c5ad99',.88);material('uniform','#587f8c',.85);material('pants','#3b5361',.85);material('cap','#e1e9e6',.92);
 function mesh(parent,g,mat,x=0,y=0,z=0){const m=new T.Mesh(g,mats[mat]||mats.panel);m.position.set(x,y,z);m.castShadow=mat!=='glass';m.receiveShadow=true;parent.add(m);return m;}
 function box(p,w,h,d,x,y,z,m='panel',r=.012){const k=`b${w},${h},${d},${r}`;if(!geo.has(k))geo.set(k,r?new RoundedBoxGeometry(w,h,d,1,Math.min(r,w/4,h/4,d/4)):new T.BoxGeometry(w,h,d));return mesh(p,geo.get(k),m,x,y,z);}
 function cyl(p,r,h,x,y,z,m='steel',segments=16){const k=`c${r},${h},${segments}`;if(!geo.has(k))geo.set(k,new T.CylinderGeometry(r,r,h,segments));return mesh(p,geo.get(k),m,x,y,z);}
 function sphere(p,r,x,y,z,m){const k=`s${r}`;if(!geo.has(k))geo.set(k,new T.SphereGeometry(r,12,10));return mesh(p,geo.get(k),m,x,y,z);}
 function group(p,x=0,y=0,z=0){const g=new T.Group();g.position.set(x,y,z);p.add(g);return g;}
 function writing(p,value,w,h,x,y,z,{color='#42626a',bg=null,floor=false}={}){if(!text){const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshStandardMaterial({color}));m.position.set(x,y,z);if(floor)m.rotation.x=-Math.PI/2;m.userData.label=value;p.add(m);return m;}if(typeof document==='undefined')return;const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d');if(bg){ctx.fillStyle=bg;ctx.fillRect(0,0,c.width,c.height)}ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 110px sans-serif';ctx.fillText(value,512,128);const tx=new T.CanvasTexture(c);tx.colorSpace=T.SRGBColorSpace;const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:tx,transparent:true,depthWrite:false,side:T.DoubleSide}));m.position.set(x,y,z);if(floor)m.rotation.x=-Math.PI/2;p.add(m);return m;}
 function entity(g,code,title,description,zone,label=false){g.userData={code,title,description,zone};g.traverse(o=>{if(o.isMesh){o.userData.entity=g;pickables.push(o)}});if(label)labels.push({object:g,title,code,height:2.5});return g;}
 function lightTower(g,x,y,z){cyl(g,.025,.22,x,y,z);['green','yellow','red'].forEach((m,i)=>cyl(g,.052,.065,x,y+.15+i*.072,z,m));}
 function feet(g,w,d){for(const x of [-w*.39,w*.39])for(const z of [-d*.36,d*.36]){cyl(g,.075,.08,x,.05,z,'rubber');cyl(g,.029,.12,x,.12,z);}}
 function door(g,x,y,z,w,h){box(g,w,h,.025,x,y,z,'panel',.003);box(g,.025,h*.24,.036,x+w*.30,y+.03,z+.03,'steel',.005);}
 function control(g,x,y,z){box(g,.36,.29,.065,x,y,z,'dark',.025);box(g,.30,.22,.005,x,y,z+.036,'screen',.005);for(let i=0;i<3;i++)box(g,.19,.008,.003,x-.02,y+.055-i*.045,z+.041,i===0?'green':'steel',.001);box(g,.045,.025,.04,x+.12,y-.20,z,'yellow');sphere(g,.024,x+.12,y-.17,z,'red');}
 function belt(p,length,x,z,y=.92,width=.42){const g=group(p,x,0,z);for(const zz of [-width/2,width/2]){box(g,length,.085,.048,0,y,zz,'steel');box(g,length-.04,.013,.031,0,y+.052,zz*.89,'rubber');}for(const xx of [-length*.37,length*.37]){box(g,.045,y-.13,width*.9,xx,(y-.13)/2+.1,0,'steel');box(g,.19,.06,width,xx,.06,0,'dark');}return g;}
 // Architectural plinth and floor: the viewer sees an intentional cutaway, not an infinite grid.
 box(root,30.8,.38,20.8,0,-.23,0,'base',.15);box(root,30,.08,20,0,0,0,'floor',.02);
 for(let x=-15;x<=15;x+=2.5)box(root,.012,.002,20,x,.043,0,'zone',0);for(let z=-10;z<=10;z+=2.5)box(root,30,.002,.012,0,.043,z,'zone',0);
 for(const z of [-7,0,6.3]){box(root,28,.008,1.30,0,.05,z,'lane',0);for(const zz of [z-.73,z+.73])box(root,28,.005,.042,0,.057,zz,'yellow',0);for(let x=-13;x<=13;x+=2.5) {const a=box(root,.22,.008,.035,x,.061,z,'bright',0);a.rotation.y=.6;const b=box(root,.22,.008,.035,x,.061,z+.105,'bright',0);b.rotation.y=-.6;}}
 // Rear wall and glazing; open front and right preserve the view of the production floor.
 box(root,30,.42,.18,0,.25,-9.86,'bright');box(root,30,.58,.18,0,3.72,-9.86,'bright');
 for(let x=-14.8;x<14.8;x+=3.7){box(root,.18,4,.23,x,2,-9.82,'bright');box(root,3.45,2.9,.025,x+1.85,2,-9.83,'glass');box(root,3.5,.045,.075,x+1.85,2.45,-9.76,'steel');}
 box(root,.18,2.4,20,-14.92,1.25,0,'bright');box(root,.20,.10,20,-14.90,2.49,0,'teal');
 writing(root,'PRECISION / ELECTRONICS MANUFACTURING',10,.36,0,3.71,-9.72,{color:'#3c686a'});
 for(const x of [-14.4,-7.2,0,7.2,14.4]){box(root,.22,4.8,.22,x,2.4,-8.5,'bright');box(root,.24,.24,17.1,x,4.68,0,'bright');for(const z of [-5,2,7]){box(root,1.5,.055,.23,x,4.50,z,'steel');box(root,1.4,.012,.19,x,4.467,z,'bright');}}
 for(const z of [-8.3,-7.96]){const pipe=cyl(root,.045,28.6,0,4.3,z,'blue');pipe.rotation.z=Math.PI/2;}
 // Line base zones, paint and procedural machines.
 const types=[['loader',-11.8,1.25,'自动上板机','将料架中的 PCB 逐片送入产线，建立连续生产节拍。'],['printer',-9.15,1.9,'锡膏印刷机','完成焊盘锡膏印刷，操作人员从正面进行换型与工艺确认。'],['spi',-6.35,1.35,'SPI 锡膏检测','检查锡膏位置与形态，衔接印刷和贴装工序。'],['mounter',-2.8,3.5,'高速贴片单元','双机位示意，包含供料器、观察窗、内部运动导轨与操作界面。'],['reflow',3.05,5.65,'多温区回流炉','PCB 经输送轨道通过连续加热与冷却温区。'],['aoi',7.7,1.7,'AOI 光学检测','回流后检测组件位置及焊接外观，异常板流向复检区。'],['unloader',10.85,1.3,'自动下板机','完成良品缓存与收板，连接后续装配和检验。']];
 function machine(type,w,x,z,index,line){const g=group(root,x,.08,z);const d=type==='mounter'?1.85:type==='reflow'?1.28:1.45;feet(g,w,d);box(g,w,.16,d*.91,0,.18,0,'dark');
  if(type==='loader'||type==='unloader'){
   box(g,w,.62,d,0,.54,0);for(const xx of [-w*.44,w*.44])box(g,.09,.96,d,xx,1.31,0,'bright');box(g,w,.09,d,0,1.84,0,'bright');box(g,w*.75,.04,d*.72,0,.91,0,'steel');for(let j=0;j<7;j++)box(g,w*.59,.018,d*.56,0,1.0+j*.09,0,'dark');box(g,w*.68,.80,.035,0,1.36,d*.47,'glass');control(g,w*.25,.70,d*.53);
  }else if(type==='reflow'){
   box(g,w,.60,d,0,.53,0);box(g,w,.51,d*.96,0,1.14,0,'bright',.05);box(g,w,.05,d*.98,0,1.43,0,'teal');for(let i=0;i<7;i++){const xx=(i-3)*w/7;box(g,.018,.47,d*.98,xx,1.15,0,'steel',0);box(g,w/7-.06,.06,d*.68,xx,1.50,0,'panel');door(g,xx,.52,d*.505,w/7-.045,.40);}for(const xx of [-w*.27,w*.27]){cyl(g,.11,.60,xx,1.80,-.18,'steel');const elbow=cyl(g,.11,.40,xx,2.06,-.34,'steel');elbow.rotation.x=Math.PI/2;}control(g,-w*.37,1.16,d*.53);
  }else{
   box(g,w,.65,d,0,.53,0,'dark');const doors=type==='mounter'?4:2;for(let i=0;i<doors;i++)door(g,(i-(doors-1)/2)*w/doors,.53,d*.506,w/doors-.035,.55);
   box(g,w,.10,d,0,.93,0,'teal');box(g,w,.075,d,0,1.75,0,'bright');for(const xx of [-w*.475,w*.475])box(g,.065,.76,d,xx,1.33,0,'panel');box(g,w,.72,.035,0,1.33,-d*.47,'panel');box(g,w-.12,.59,.022,0,1.34,d*.482,'glass');for(let k=1;k<doors;k++)box(g,.022,.61,.042,(k-doors/2)*w/doors,1.34,d*.50,'dark');box(g,w-.2,.06,.05,0,1.09,d*.5,'dark');
   box(g,w*.84,.06,.12,0,1.45,0,'steel');box(g,.25,.24,.22,-w*.10,1.34,0,'dark');for(const zz of [-.19,.19])box(g,w+.10,.03,.025,0,.97,zz,'steel');
   if(type==='mounter'){for(let i=0;i<18;i++){let xx=(i-8.5)*w*.048;box(g,.12,.035,.54,xx,.93,d*.55,'steel');box(g,.024,.24,.028,xx,.78,d*.58,'dark');const reel=cyl(g,.065,.034,xx,.66,d*.74,i%3===0?'dark':'steel');reel.rotation.x=Math.PI/2;const hub=cyl(g,.018,.041,xx,.66,d*.76,'rubber');hub.rotation.x=Math.PI/2;}box(g,w*.91,.04,.44,0,.88,d*.62,'dark');}else{box(g,w*.22,.08,d*.55,0,1.19,0,'steel');}
   control(g,w*.35,1.31,d*.55);
  }
  lightTower(g,-w*.35,type==='reflow'?1.54:1.86,-d*.28);writing(g,`${line}-${String(index+1).padStart(2,'0')}`,w*.5,.13,0,.44,d*.53,{color:'#527078'});
  return entity(g,`${line}-${String(index+1).padStart(2,'0')}`,types[index][3],types[index][4],`${line} 线`,['printer','mounter','reflow','aoi'].includes(type));
 }
 for(const [line,z] of [['A',-4.3],['B',2.5]].slice(0,lines)){
  box(root,27.7,.006,3.4,0,.049,z,'zone',0);writing(root,`${line} / SMT LINE`,5,.62,-9,.061,z+2.05,{color:'#536e73',floor:true});
  types.forEach(([type,x,w],i)=>machine(type,w,x,z,i,line));
  for(let i=0;i<types.length-1;i++){const end=types[i][1]+types[i][2]/2,start=types[i+1][1]-types[i+1][2]/2;belt(root,start-end,(end+start)/2,z,.99,.50);}
  // Boards are clearly illustrative animation, not production telemetry.
  for(let i=0;i<7;i++){const b=box(root,.27,.014,.22,-12+i*3.5,1.08,z,'pcb',.002);box(b,.05,.012,.05,0,.015,0,'dark',.001);boards.push({mesh:b,z,offset:i*3.45});}
 }
 // ESD-clad operators with restrained proportions and task poses.
 function person(x,z,yaw=0){if(!people || (lines===1&&z===4.4))return;const g=group(root,x,.10,z);g.userData.title='设备操作人员';g.userData.zone='作业区';g.rotation.y=yaw;for(const side of [-1,1]){box(g,.14,.08,.25,side*.105,.045,.03,'dark',.025);const leg=cyl(g,.070,.68,side*.10,.42,0,'pants');leg.rotation.z=side*.045;}box(g,.39,.49,.22,0,1.00,0,'uniform',.045);box(g,.018,.42,.004,0,1.02,.115,'steel',.002);box(g,.09,.11,.008,-.1,1.08,.123,'bright',.002);cyl(g,.063,.07,0,1.31,0,'skin');sphere(g,.133,0,1.46,0,'skin');const cap=sphere(g,.138,0,1.51,-.008,'cap');cap.scale.y=.58;for(const side of [-1,1]){const arm=cyl(g,.055,.35,side*.235,1.05,.025,'uniform');arm.rotation.z=side*.30;const fore=cyl(g,.046,.27,side*.27,.88,.135,'uniform');fore.rotation.x=1.10;sphere(g,.052,side*.27,.84,.25,'cap');}return g;}
 [[-9,-2.4],[-3,-2.4],[7.7,-2.5],[-9,4.4],[-2,4.4],[8,4.4],[-11,8.1],[5,8.4]].forEach(([x,z])=>person(x,z,Math.PI));person(12.7,-1.4,-Math.PI/2);
 // Material shelves, reel bins, carts, pallets and dedicated inspection benches.
 for(let r=0;r<(materialZone?3:0);r++){const g=group(root,-11+r*3.1,.07,8.2);for(const x of [-1.25,1.25])for(const z of [-.43,.43])box(g,.07,2.15,.07,x,1.075,z,'blue');for(let y=.20;y<2.2;y+=.62){box(g,2.6,.055,1,0,y,0,'steel');for(let j=0;j<4;j++){box(g,.49,.31,.70,(j-1.5)*.6,y+.19,0,j%2?'blue':'box',.015);box(g,.17,.06,.006,(j-1.5)*.6,y+.22,.356,'bright',.001);}}entity(g,`WH-0${r+1}`,'线边物料架','料盘与周转箱分层存放，靠近作业通道进行补料。','线边仓',r===0);}
 writing(root,'MATERIAL / 线边物料',5,.6,-8.6,.062,7.1,{floor:true});
 for(let i=0;i<(qualityZone?3:0);i++){const g=group(root,4+i*3,.07,8.5);box(g,2.4,.08,1.1,0,.83,0,'bright');for(const x of [-1,1])for(const z of [-.4,.4])box(g,.055,.8,.055,x,.41,z,'steel');box(g,2.4,.50,.04,0,1.1,-.52,'blue');control(g,.5,1.2,-.15);box(g,.5,.018,.27,.5,.88,.21,'dark');box(g,.46,.015,.34,-.6,.89,.15,'pcb');entity(g,`QC-0${i+1}`,'离线复检工作台','用于异常 PCB 复核、首件确认与工艺分析。','品质区',i===1);}
 writing(root,'QUALITY / 品质复检',5,.6,7,.062,7.1,{floor:true});
 function cart(x,z){const g=group(root,x,.07,z);g.userData.title='物料周转车';g.userData.zone='物流通道';for(const xx of [-.38,.38])for(const zz of [-.28,.28]){const wheel=cyl(g,.07,.04,xx,.08,zz,'rubber');wheel.rotation.z=Math.PI/2;box(g,.025,.8,.025,xx,.5,zz,'steel');}box(g,.85,.035,.65,0,.25,0,'steel');box(g,.85,.035,.65,0,.8,0,'steel');box(g,.66,.25,.5,0,.95,0,'blue');return g;}cart(-12.8,-1.4);cart(-5.5,5.0);cart(11.8,7.9);
 for(const z of [-7.0,0]){const g=group(root,8,.11,z);box(g,1.0,.28,.72,0,.20,0,'bright',.10);box(g,.87,.04,.61,0,.36,0,'dark',.02);box(g,.75,.018,.48,0,.40,0,'blue',.008);box(g,.72,.024,.012,0,.19,.365,'green',.005);for(const x of [-.30,.30])for(const zz of [-.32,.32]){const wheel=cyl(g,.11,.055,x,.13,zz,'rubber');wheel.rotation.x=Math.PI/2;}vehicles.push({object:g,z,phase:z===0?0:Math.PI});entity(g,z===0?'AGV-01':'AGV-02','自主移动搬运车','沿示意物流通道往返，为线边工位配送周转物料。','物流通道');}
 // Safety cabinets, guard bollards and small-scale details complete the scene.
 for(const x of [-13.7,13.7])for(const z of [-6.0,5.2]){cyl(root,.075,.65,x,.37,z,'yellow');cyl(root,.078,.09,x,.50,z,'dark');}
 const cabinet=group(root,13.4,.08,-8.6);box(cabinet,1.3,1.75,.65,0,.88,0,'bright');door(cabinet,-.32,.9,.34,.60,1.60);door(cabinet,.32,.9,.34,.60,1.60);writing(cabinet,'ELECTRICAL',.9,.16,0,1.5,.37);entity(cabinet,'UTIL-01','配电与公用设施','车间辅助配电设施示意，保留周边检修空间。','公用设施');
 const fire=group(root,-14.4,.08,7.4);box(fire,.5,.7,.22,0,.7,0,'red');writing(fire,'FIRE',.4,.14,0,.75,.12,{color:'#ffffff'});
 return {root,pickables,labels,boards,vehicles,mats,geo};
}
