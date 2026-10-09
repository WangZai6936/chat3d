import {categoryMatches,type LibraryCategory} from '../domain/libraryCategories';
import './library-category-tree.css';
export function LibraryCategoryTree({categories,values,value,onChange,onManage}:{categories:LibraryCategory[];values:Array<string|undefined>;value:string;onChange:(value:string)=>void;onManage:()=>void}){
 const count=(filter:string)=>values.filter(v=>categoryMatches(categories,v,filter)).length;
 const button=(v:string,label:string,child=false)=><button key={v} type="button" className={child?'is-child':''} aria-label={label} title={`${label} · ${count(v)} 项`} aria-pressed={value===v} onClick={()=>onChange(v)}><span>{label}</span><small>{count(v)}</small></button>;
 return <aside className="library-category-tree" aria-label="分类导航"><header><strong>分类</strong><button type="button" onClick={onManage}>管理</button></header>{button('全部','全部')}{button('未分类','未分类')}{categories.filter(c=>!c.parentValue).map(c=><div key={c.value}>{button(c.value,c.label)}{categories.filter(child=>child.parentValue===c.value).map(child=>button(child.value,child.label,true))}</div>)}</aside>;
}
