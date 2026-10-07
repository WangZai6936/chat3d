import {useEffect} from 'react';
import {Button} from '@radix-ui/themes';
import {CheckCircledIcon,Cross1Icon} from '@radix-ui/react-icons';
import './save-toast.css';
export const isLibrarySaveNotice=(text:string)=>/^(资产已保存到资产库|场景已保存到场景库)/.test(text);
export function SaveToast({message,onClose,duration=5000}:{message:string;onClose:()=>void;duration?:number}){
 useEffect(()=>{const timer=setTimeout(onClose,duration);return()=>clearTimeout(timer);},[message,onClose,duration]);
 return <div className="library-save-toast" role="status"><CheckCircledIcon aria-hidden="true"/><span>{message.startsWith('资产')?'资产已保存':'场景已保存'}</span><Button variant="ghost" color="gray" aria-label="关闭保存提示" onClick={onClose}><Cross1Icon/></Button></div>;
}
