import {useEffect,useState} from 'react';
export const CONVERSATION_WIDTH_KEY='chat3d.conversationWidth.v1';
export function clampConversationWidth(value:number,viewport=typeof window==='undefined'?1280:window.innerWidth){return Math.max(360,Math.min(Number.isFinite(value)?value:420,Math.max(360,Math.min(600,viewport-900))));}
export function useConversationWidth(){
 const [width,setWidth]=useState(()=>{try{const saved=localStorage.getItem(CONVERSATION_WIDTH_KEY);return clampConversationWidth(saved?Number(saved):420)}catch{return 360}});
 useEffect(()=>{try{localStorage.setItem(CONVERSATION_WIDTH_KEY,String(width))}catch{/* Preference persistence is optional. */}},[width]);
 useEffect(()=>{const resize=()=>setWidth(w=>clampConversationWidth(w));window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[]);
 return [width,(value:number)=>setWidth(clampConversationWidth(value))] as const;
}
export function ConversationResize({width,onChange}:{width:number;onChange:(value:number)=>void}){
 return <div className="conversation-resizer" role="separator" tabIndex={0} aria-label="调整对话区宽度" aria-orientation="vertical" aria-valuemin={360} aria-valuemax={clampConversationWidth(600)} aria-valuenow={Math.round(width)} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId)){const right=e.currentTarget.parentElement?.getBoundingClientRect().right??window.innerWidth;onChange(right-e.clientX)}}} onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();onChange(e.key==='Home'?360:e.key==='End'?600:width+(e.key==='ArrowLeft'?24:-24))}}}><span/></div>;
}
