import {useMemo,useState} from 'react';
import {ChevronDownIcon,ChevronRightIcon,FileIcon,MagnifyingGlassIcon,PlusIcon} from '@radix-ui/react-icons';
import {type LibraryCategory} from '../domain/libraryCategories';
import './library-category-tree.css';

export function CategoryFolderIcon({open=false}:{open?:boolean}){
 return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={open?'M3 10V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v1M3 10h18l-2 10H5L3 10Z':'M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z'}/></svg>;
}

/** Shared directory interaction; selecting a folder never changes category records. */
export function CategoryDirectory({categories,values,value,onChange,query='',filters=false,disabled=false,editing=false}:{categories:LibraryCategory[];values?:Array<string|undefined>;value:string;onChange:(value:string)=>void;query?:string;filters?:boolean;disabled?:boolean;editing?:boolean}){
 const [collapsed,setCollapsed]=useState<Set<string>>(()=>new Set());
 const counts=useMemo(()=>{const result=new Map<string,number>();for(const v of values??[]){const key=v||'未分类';result.set(key,(result.get(key)??0)+1);const parent=categories.find(c=>c.value===v)?.parentValue;if(parent)result.set(parent,(result.get(parent)??0)+1);}return result;},[categories,values]);
 const term=query.trim().toLocaleLowerCase(),matches=(c:LibraryCategory)=>c.label.toLocaleLowerCase().includes(term);
 const roots=categories.filter(c=>!c.parentValue).map(parent=>({parent,children:categories.filter(c=>c.parentValue===parent.value)})).filter(({parent,children})=>!term||matches(parent)||children.some(matches));
 function select(v:string,label:string,child=false){const count=v==='全部'?values?.length:counts.get(v)??0;return <button type="button" className={`category-directory-select${child?' is-child':''}`} disabled={disabled} aria-label={editing?`重命名分类 ${label}`:label} title={values?`${label} · ${count} 项资源`:label} aria-pressed={value===v} onClick={()=>onChange(v)}>{v==='未分类'?<FileIcon aria-hidden="true"/>:<CategoryFolderIcon open={value===v}/>}<span className="category-directory-label">{label}</span>{values&&<small>{count}</small>}</button>;}
 return <div className="category-directory">
  {filters&&<div className="category-directory-filters">{select('全部','全部')}{select('未分类','未分类')}</div>}
  {roots.map(({parent,children})=>{const open=!!term||!collapsed.has(parent.value),visible=term&&!matches(parent)?children.filter(matches):children;return <div className="category-directory-group" key={parent.value}>
   <div className="category-directory-row">{children.length?<button type="button" className="category-directory-toggle" aria-label={`${open?'折叠':'展开'}分类 ${parent.label}`} aria-expanded={open} disabled={disabled||!!term} onClick={()=>setCollapsed(previous=>{const next=new Set(previous);if(next.has(parent.value))next.delete(parent.value);else next.add(parent.value);return next;})}>{open?<ChevronDownIcon/>:<ChevronRightIcon/>}</button>:<span className="category-directory-toggle-spacer"/>}{select(parent.value,parent.label)}{!!children.length&&<span className="category-directory-child-count" title={`${children.length} 个子分类`} aria-label={`${children.length} 个子分类`}>{children.length}</span>}</div>
   {open&&!!visible.length&&<div className="category-directory-children">{visible.map(child=><div key={child.value}>{select(child.value,child.label,true)}</div>)}</div>}
  </div>;})}
  {!roots.length&&<p className="category-directory-empty">{term?'没有匹配的分类':'还没有分类'}</p>}
 </div>;
}

export function LibraryCategoryTree({categories,values,value,onChange,onManage}:{categories:LibraryCategory[];values:Array<string|undefined>;value:string;onChange:(value:string)=>void;onManage:()=>void}){
 const [query,setQuery]=useState('');
 return <aside className="library-category-tree" aria-label="分类导航"><header><strong>分类</strong><div><button type="button" className="category-header-create" aria-label="新建分类" title="新建分类" onClick={onManage}><PlusIcon/></button><button type="button" onClick={onManage}>管理</button></div></header><label className="category-directory-search"><MagnifyingGlassIcon aria-hidden="true"/><input aria-label="搜索分类" placeholder="搜索分类…" value={query} onChange={e=>setQuery(e.target.value)}/></label><CategoryDirectory categories={categories} values={values} value={value} onChange={onChange} query={query} filters/><footer>{categories.length} 个分类 · {values.length} 项资源</footer></aside>;
}
