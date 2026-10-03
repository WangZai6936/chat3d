import type {SceneDocument} from './types';
import type {EditScope} from './editScope';
export function resolveConversationIntent(text:string,history:{role:string;text:string}[]=[]):string{
 const brief=/^(?:开始|继续|好的?|可以|执行|开始执行|继续执行)[吧啊。！!\s]*$/;
 return brief.test(text.trim())?([...history].reverse().find(m=>m.role==='user'&&!brief.test(m.text.trim()))?.text??text):text;
}
// Highlight is reference context, never an implicit permission boundary.
// Preserve a hard boundary only for an explicit, unambiguous selected-object instruction.
export function conversationScope(text:string,doc:SceneDocument,selection:string[],lockPlacement=false,history:{role:string;text:string}[]=[]):EditScope{
 text=resolveConversationIntent(text,history);
 const movementText=text.replace(/“[^”]*”|「[^」]*」|"[^"\n]*"|`[^`]*`/g,'');
 const requestsMovement=movementText.split(/[，,。；;]|但是|但|同时/).some(part=>/(移动|挪动|挪(?=\s*(?:[一二两三四五六七八九十百\d]|到|至|[上下左右前后]|开|这台|这个|选中|设备|对象))|平移|旋转|重新布局|调整布局|重新摆放|调整位置|[向往朝][左右前后上下].{0,6}(?:移|挪))/.test(part)&&!/(不要|不必|无需|不需要|禁止|不能|别|保持|保留|是否|能否|可以吗|吗|如何|怎么)/.test(part));
 const scope:EditScope=lockPlacement&&!requestsMovement?{lockPlacement:true}:{};
 const explicit=/(?:仅|只)(?:修改|改|调整|优化|编辑|移动|挪动|挪|旋转)\s*(?:当前)?\s*(?:选中的?|这台|这个|该)(?:对象|设备|组件|零件)?/.test(text);
 if(!explicit||!selection.length||/(?:不要|不必|无需|不需要).{0,3}(?:仅|只)/.test(text)||/选中.{0,5}(?:以外|之外)/.test(text))return scope;
 const ids=new Set(selection.filter(id=>doc.nodes.some(n=>n.id===id)));
 if(/这台|(?:选中的?|该)设备|组件/.test(text))for(const n of doc.nodes)if(ids.has(n.id)&&n.assemblyId)for(const member of doc.nodes)if(member.assemblyId===n.assemblyId)ids.add(member.id);
 if(ids.size){scope.nodeIds=[...ids];scope.allowAssemblyAdditions=true;}return scope;
}
