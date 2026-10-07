import type {ModelAssetSummary} from './modelAssets';
import {categoryLabel,type LibraryCategory} from './libraryCategories';
export function searchLibraryAssets(rows:ModelAssetSummary[],categories:LibraryCategory[],query=''){
 const text=query.trim().toLocaleLowerCase();
 return rows.map(r=>({...r,categoryLabel:categoryLabel(categories,r.category)})).filter(r=>[r.name,r.category,r.categoryLabel,r.description??'',r.purpose??''].join(' ').toLocaleLowerCase().includes(text));
}
