import {useEffect} from 'react';
import {TrashIcon} from '@radix-ui/react-icons';
import {useEditorStore} from '../store';
import {ToolbarAction} from './ToolbarAction';

/** Ignore typing, held keys and overlays so Delete only acts on the visible scene. */
export function isSceneDeleteKey(event:KeyboardEvent):boolean {
  if(event.key!=='Delete'||event.defaultPrevented||event.repeat||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return false;
  const target=event.target instanceof Element?event.target:null;
  if(target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="spinbutton"],[role="menu"],[role="listbox"],[role="dialog"],[role="alertdialog"]'))return false;
  return !document.querySelector('[aria-modal="true"],[role="dialog"],[role="alertdialog"],dialog[open]');
}

export function DeleteSelectionAction({active=true,onNotice}:{active?:boolean;onNotice?:(message:string)=>void}) {
  const selection=useEditorStore(s=>s.selection),status=useEditorStore(s=>s.aiStatus);
  const locked=['capturing','context','generating','validating','previewing','applying'].includes(status);
  const remove=()=>{
    const result=useEditorStore.getState().deleteSelection();
    onNotice?.(result.ok?'已从当前场景删除选中对象，可撤销恢复。资产库原件保留。':result.error??'删除失败');
  };
  useEffect(()=>{
    if(!active)return;
    const key=(event:KeyboardEvent)=>{
      if(!isSceneDeleteKey(event)||locked||!selection.length)return;
      event.preventDefault();remove();
    };
    window.addEventListener('keydown',key);
    return()=>window.removeEventListener('keydown',key);
  },[active,locked,selection,onNotice]);
  return <ToolbarAction label="删除选中对象" help="从当前场景删除选中模型或零件（Delete），可撤销恢复；资产库原件保留" disabled={!active||!selection.length||locked} disabledReason={!selection.length?'请先选中一个或多个对象':status==='previewing'?'请先应用或放弃当前预览':locked?'任务执行中，暂不能删除对象':'请先打开工作台'} onPress={remove}><TrashIcon/></ToolbarAction>;
}
