/** Shape-preserving cubic radius interpolation. Heights stay strictly ordered;
 * radii stay between adjacent control values, preserving holes and wall clearance. */
export function smoothRadialProfile(points:[number,number][]):[number,number][]{
 const n=points.length,h=points.slice(1).map((p,i)=>p[1]-points[i][1]),d=h.map((v,i)=>(points[i+1][0]-points[i][0])/v);
 const m=points.map((_,i)=>i===0?d[0]:i===n-1?d[n-2]:d[i-1]*d[i]<=0?0:(3*(h[i-1]+h[i]))/((2*h[i]+h[i-1])/d[i-1]+(h[i]+2*h[i-1])/d[i]));
 const out:[number,number][]=[];
 for(let i=0;i<n-1;i++)for(let j=0;j<8;j++){const t=j/8,t2=t*t,t3=t2*t,r=(2*t3-3*t2+1)*points[i][0]+(t3-2*t2+t)*h[i]*m[i]+(-2*t3+3*t2)*points[i+1][0]+(t3-t2)*h[i]*m[i+1];out.push([Math.max(Math.min(points[i][0],points[i+1][0]),Math.min(Math.max(points[i][0],points[i+1][0]),r)),points[i][1]+t*h[i]]);}
 out.push([...points[n-1]]);return out;
}
