/** Library labels are separate from immutable geometry and instance names. */
export interface LibraryMetadata { name:string; category?:string; description?:string }
export function validCategory(value:unknown):value is string{return typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=80&&!/[\u0000-\u001f]/.test(value);}
export function normalizeLibraryMetadata(value:LibraryMetadata,kind:'asset'|'scene'):LibraryMetadata{
 if(!value||typeof value.name!=='string'||(value.category!==undefined&&typeof value.category!=='string')||(value.description!==undefined&&typeof value.description!=='string'))throw Error('名称、分类与说明格式无效');
 const name=value.name.trim(),category=value.category?.trim()||undefined,description=value.description?.trim()||undefined;
 if(!name||name.length>80)throw Error('请输入 1–80 字的名称');
 if(category&&!validCategory(category))throw Error('分类名称须为 1–80 字');
 if(description&&description.length>1000)throw Error('说明不能超过 1000 字');
 return {name,category:category??(kind==='asset'?'其他':undefined),description};
}
