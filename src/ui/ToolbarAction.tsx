import type {ReactNode} from 'react';
import {Tooltip} from '@radix-ui/themes';
import {Button} from '@heroui/react';
export function ToolbarAction({label,help,disabled=false,disabledReason,pressed,onPress,children}:{label:string;help:string;disabled?:boolean;disabledReason?:string;pressed?:boolean;onPress:()=>void;children:ReactNode}){
 const explanation=disabled&&disabledReason?`${label}：${disabledReason}`:`${label}：${help}`;
 return <Tooltip content={explanation} delayDuration={150}><div className="canvas-tool-help" title={explanation} tabIndex={disabled?0:undefined} aria-label={disabled?explanation:undefined}><Button isIconOnly variant="ghost" aria-label={label} aria-pressed={pressed} isDisabled={disabled} onPress={onPress}>{children}</Button></div></Tooltip>;
}
