import {ASSET_CATEGORIES} from './modelAssets';
import {openModelAssetDatabase} from './modelAssetStorage';
import {validCategory} from './libraryMetadata';
export interface LibraryCategory {value:string;label:string;revision:number}
export const defaultLibraryCategories=():LibraryCategory[]=>ASSET_CATEGORIES.map(value=>({value,label:value,revision:0}));
export function categoryLabel(categories:LibraryCategory[],value?:string){return value?(categories.find(c=>c.value===value)?.label??value):'未分类';}
export async function listLibraryCategories(encountered:string[]=[]):Promise<LibraryCategory[]>{
 const db=await openModelAssetDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(['categories','items']),r=tx.objectStore('categories').getAll(),items=tx.objectStore('items').getAll();tx.oncomplete=()=>{db.close();const rows=new Map(defaultLibraryCategories().map(c=>[c.value,c]));for(const c of r.result as LibraryCategory[])rows.set(c.value,c);for(const value of [...encountered,...items.result.map((a:{category:string})=>a.category)])if(validCategory(value)&&!rows.has(value))rows.set(value,{value,label:value,revision:0});resolve([...rows.values()]);};tx.onabort=()=>{db.close();reject(Error('分类读取失败'));};});
}
/** Stable values keep old versions and imported category strings intact. Renames only change labels. */
export async function saveLibraryCategory(label:string,current?:LibraryCategory):Promise<LibraryCategory>{
 if(typeof label!=='string'||(current&&(!validCategory(current.value)||!Number.isSafeInteger(current.revision)||current.revision<0)))throw Error('分类信息无效');
 label=label.trim();if(!validCategory(label)||label==='全部')throw Error('请输入 1–80 字的分类名称，不能使用“全部”');
 const db=await openModelAssetDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(['categories','items'],'readwrite'),store=tx.objectStore('categories'),r=store.getAll(),items=tx.objectStore('items').getAll();let error='',result:LibraryCategory;
 items.onsuccess=()=>{const rows=new Map(defaultLibraryCategories().map(c=>[c.value,c]));for(const c of r.result as LibraryCategory[])rows.set(c.value,c);for(const a of items.result)if(!rows.has(a.category))rows.set(a.category,{value:a.category,label:a.category,revision:0});
 if([...rows.values()].some(c=>c.value!==current?.value&&(c.label===label||(!current&&c.value===label)))){error='该分类已存在';tx.abort();return;}
 if(current&&(rows.get(current.value)?.revision??0)!==current.revision){error='分类已在其他页面更新，请重新打开分类管理';tx.abort();return;}
 result={value:current?.value??label,label,revision:(current?.revision??0)+1};store.put(result);};
 tx.oncomplete=()=>{db.close();if(typeof window!=='undefined')window.dispatchEvent(new Event('chat3d:categories'));resolve(result);};tx.onabort=()=>{db.close();reject(Error(error||'分类保存失败，原有分类未改动'));};tx.onerror=()=>{};
 });
}
