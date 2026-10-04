type Point=[number,number];
const EPS=1e-9;
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const on=(a:Point,b:Point,p:Point)=>Math.abs(cross(a,b,p))<=EPS&&p[0]>=Math.min(a[0],b[0])-EPS&&p[0]<=Math.max(a[0],b[0])+EPS&&p[1]>=Math.min(a[1],b[1])-EPS&&p[1]<=Math.max(a[1],b[1])+EPS;
const intersects=(a:Point,b:Point,c:Point,d:Point)=>on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b)||(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0);
const inside=(p:Point,ring:Point[])=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if(on(a,b,p))return false;if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
/** Simple concave contours and disjoint interior holes; no semantic shape assumptions. */
export function validateProfile(points:Point[],holes:Point[][]=[]):Error[]{
 if(!Array.isArray(holes)||holes.length>8)return [new Error('轮廓最多8个内部孔')];
 const rings=[points,...holes];
 if(rings.some(r=>!Array.isArray(r)||r.length<3||r.length>64||r.some(p=>!Array.isArray(p)||p.length!==2||p.some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>100))))return [new Error('每个轮廓需3–64个有限二维点，坐标绝对值不超过100米')];
 for(const r of rings){
  const area=r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1];},0);
  if(Math.abs(area)<EPS)return [new Error('轮廓面积退化')];
  for(let i=0;i<r.length;i++){
   const a=r[i],b=r[(i+1)%r.length];if(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-6)return [new Error('轮廓包含重复相邻点')];
   const c=r[(i+2)%r.length];if(Math.abs(cross(a,b,c))<EPS&&((b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1]))<0)return [new Error('轮廓边不能折返重叠')];
   for(let j=i+2;j<r.length;j++){if(i===0&&j===r.length-1)continue;if(intersects(a,b,r[j],r[(j+1)%r.length]))return [new Error('轮廓不能自交或自接触')];}
  }
 }
 for(let i=1;i<rings.length;i++){
  if(!inside(rings[i][0],points))return [new Error('孔必须严格位于外轮廓内部')];
  for(let j=0;j<i;j++){
   const a=rings[i],b=rings[j];for(let x=0;x<a.length;x++)for(let y=0;y<b.length;y++)if(intersects(a[x],a[(x+1)%a.length],b[y],b[(y+1)%b.length]))return [new Error('孔不能相交或接触任何轮廓')];
   if(j>0&&(inside(a[0],b)||inside(b[0],a)))return [new Error('孔不能互相包含或重叠')];
  }
 }
 return [];
}
/** Conservative clearance for contour rounding, not a general offset/boolean solver. */
export function profileCornerLimit(rings:Point[][]):number{
 let clearance=Infinity;
 const distance=(p:Point,a:Point,b:Point)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
 for(let ri=0;ri<rings.length;ri++){const r=rings[ri];for(let i=0;i<r.length;i++){
  clearance=Math.min(clearance,Math.hypot(r[i][0]-r[(i+1)%r.length][0],r[i][1]-r[(i+1)%r.length][1]));
  for(let sj=0;sj<rings.length;sj++)for(let j=0;j<rings[sj].length;j++){if(ri===sj&&(j===i||(j+1)%r.length===i))continue;clearance=Math.min(clearance,distance(r[i],rings[sj][j],rings[sj][(j+1)%rings[sj].length]));}
 }}return clearance*.24;
}
