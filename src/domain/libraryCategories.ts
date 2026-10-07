import {ASSET_CATEGORIES} from './modelAssets';
import {openModelAssetDatabase} from './modelAssetStorage';
import {validCategory} from './libraryMetadata';
export type LibraryKind='asset'|'scene';
export interface LibraryCategory {value:string;label:string;revision:number;parentValue?:string}
export const defaultLibraryCategories=(kind:LibraryKind='asset'):LibraryCategory[]=>(kind==='asset'?[...ASSET_CATEGORIES]:['仓库','车间','产线','其他场景']).map(value=>({value,label:value,revision:0}));
export function categoryLabel(categories:LibraryCategory[],value?:string){return value?(categories.find(c=>c.value===value)?.label??value):'未分类';}
export function categoryPath(categories:LibraryCategory[],value?:string){const c=categories.find(c=>c.value===value);return c?.parentValue?categoryLabel(categories,c.parentValue)+' / '+c.label:categoryLabel(categories,value);}
export function categoryMatches(categories:LibraryCategory[],value:string|undefined,filter:string){return filter==='全部'||(filter==='未分类'?!value:value===filter||categories.find(c=>c.value===value)?.parentValue===filter);}
export function orderedCategories(categories:LibraryCategory[]){return categories.filter(c=>!c.parentValue).flatMap(c=>[c,...categories.filter(child=>child.parentValue===c.value)]);}
export function validateCategoryTree(categories:LibraryCategory[]){
 if(categories.length>500||new Set(categories.map(c=>c.value)).size!==categories.length)throw Error('分类数量或编号无效');
 for(const c of categories){if(!validCategory(c.value)||!validCategory(c.label)||!Number.isSafeInteger(c.revision)||c.revision<0)throw Error('分类信息无效');if(c.parentValue){const p=categories.find(x=>x.value===c.parentValue);if(!p||p.value===c.value||p.parentValue)throw Error('分类最多两级，上级必须是已有一级分类');}}
}
export async function listLibraryCategories(encountered:string[]=[],kind:LibraryKind='asset'):Promise<LibraryCategory[]>{
 const db=await openModelAssetDatabase();return new Promise((resolve,reject)=>{const store=kind==='asset'?'categories':'sceneCategories',tx=db.transaction([...new Set([store,'items','categories'])]),r=tx.objectStore(store).getAll(),items=tx.objectStore('items').getAll(),legacy=tx.objectStore('categories').getAll();tx.oncomplete=()=>{db.close();const rows=new Map(defaultLibraryCategories(kind).map(c=>[c.value,c]));for(const c of r.result as LibraryCategory[])rows.set(c.value,c);for(const value of [...encountered,...(kind==='asset'?items.result.map((a:{category:string})=>a.category):[])])if(validCategory(value)&&!rows.has(value))rows.set(value,{value,label:kind==='scene'?(legacy.result as LibraryCategory[]).find(c=>c.value===value)?.label??value:value,revision:0});resolve(orderedCategories([...rows.values()]));};tx.onabort=()=>{db.close();reject(Error('分类读取失败'));};});
}
/** Stable values preserve all model versions and references. Catalogs are isolated by kind. */
export async function saveLibraryCategory(label:string,current?:LibraryCategory,options:{kind?:LibraryKind;parentValue?:string}={}):Promise<LibraryCategory>{
 if(typeof label!=='string'||(current&&(!validCategory(current.value)||!Number.isSafeInteger(current.revision)||current.revision<0)))throw Error('分类信息无效');
 label=label.trim();if(!validCategory(label)||['全部','未分类'].includes(label))throw Error('请输入 1–80 字的分类名称，不能使用“全部”或“未分类”');
 const kind=options.kind??'asset',parentValue=options.parentValue??current?.parentValue;
 const db=await openModelAssetDatabase();return new Promise((resolve,reject)=>{const name=kind==='asset'?'categories':'sceneCategories',tx=db.transaction([name,'items'],'readwrite'),store=tx.objectStore(name),r=store.getAll(),items=tx.objectStore('items').getAll();let error='',result:LibraryCategory;
 items.onsuccess=()=>{try{const rows=new Map(defaultLibraryCategories(kind).map(c=>[c.value,c]));for(const c of r.result as LibraryCategory[])rows.set(c.value,c);if(kind==='asset')for(const a of items.result)if(!rows.has(a.category))rows.set(a.category,{value:a.category,label:a.category,revision:0});
 if([...rows.values()].some(c=>c.value!==current?.value&&c.label===label&&(c.parentValue??'')===(parentValue??'')))throw Error('该分类已存在');
 if(current&&(rows.get(current.value)?.revision??0)!==current.revision)throw Error('分类已在其他页面更新，请重新打开分类管理');
 const value=current?.value??(!parentValue&&!rows.has(label)?label:'category-'+crypto.randomUUID());
 result={value,label,revision:(current?.revision??0)+1,...(parentValue?{parentValue}:{})};rows.set(value,result);validateCategoryTree([...rows.values()]);if(parentValue&&!r.result.some((c:LibraryCategory)=>c.value===parentValue))store.put(rows.get(parentValue)!);store.put(result);
 }catch(e){error=(e as Error).message;tx.abort();}};
 tx.oncomplete=()=>{db.close();if(typeof window!=='undefined')window.dispatchEvent(new Event('chat3d:categories'));resolve(result);};tx.onabort=()=>{db.close();reject(Error(error||'分类保存失败，原有分类未改动'));};tx.onerror=()=>{};
 });
}
