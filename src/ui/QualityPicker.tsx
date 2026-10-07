import {useEffect,useState} from 'react';
import {Button,DropdownMenu} from '@radix-ui/themes';
import {LightningBoltIcon,MagicWandIcon,ChevronDownIcon} from '@radix-ui/react-icons';
import {useEditorStore} from '../store';
const active=new Set(['capturing','context','generating','validating','applying']);
export function QualityPicker({onConfigure}:{onConfigure?:()=>void}){
 const cfg=useEditorStore(s=>s.aiConfig),status=useEditorStore(s=>s.aiStatus);
 const [open,setOpen]=useState(false);useEffect(()=>{if(active.has(status))setOpen(false);},[status]);
 const quality=cfg?.generationQuality==='fast'?'fast':'fine',single=cfg?.agentMode==='single';
 const choose=(value:string)=>{const s=useEditorStore.getState();if(active.has(s.aiStatus))return;if(!s.aiConfig){onConfigure?.();return;}s.setAiConfig({...s.aiConfig,generationQuality:value==='fast'?'fast':'fine'});};
 return <DropdownMenu.Root open={open} onOpenChange={next=>{if(!next||!active.has(status))setOpen(next)}}><DropdownMenu.Trigger><Button type="button" variant="ghost" color="gray" className="quality-picker-trigger" disabled={active.has(status)} aria-label={`生成档位，当前${quality==='fast'?'快速':'精细'}`} title={active.has(status)?'本轮生成档位已锁定':quality==='fast'?'快速：优先主体与关键结构':single?'单次兼容：精细建模要求（无多轮复核）':'精细：更充分的细节与多视角检查'}>{quality==='fast'?<LightningBoltIcon/>:<MagicWandIcon/>}<span>{quality==='fast'?'快速':'精细'}</span><ChevronDownIcon/></Button></DropdownMenu.Trigger><DropdownMenu.Content className="quality-picker-menu" side="top" align="start" color="gray"><DropdownMenu.RadioGroup value={quality} onValueChange={choose}><DropdownMenu.RadioItem value="fast" aria-label="快速生成"><div><strong>快速</strong><small>主体与关键结构优先，减少细节打磨</small></div></DropdownMenu.RadioItem><DropdownMenu.RadioItem value="fine" aria-label="精细生成"><div><strong>精细</strong><small>{single?'更完整的建模要求；无多轮复核':'更充分的细节、视角检查与修正'}</small></div></DropdownMenu.RadioItem></DropdownMenu.RadioGroup></DropdownMenu.Content></DropdownMenu.Root>;
}
