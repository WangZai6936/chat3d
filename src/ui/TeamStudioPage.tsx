import {Button} from '@radix-ui/themes';
import {CubeIcon,LayersIcon,Share1Icon} from '@radix-ui/react-icons';
import {useState} from 'react';
import {TeamLibraryPane} from './TeamLibraryPane';

export function TeamStudioPage({onCopied}:{onCopied?:()=>void}){
 const [kind,setKind]=useState<'asset'|'scene'>('asset');
 return <main className="resource-page team-studio-page" aria-label="团队共享">
 <header className="resource-heading"><div><span className="resource-eyebrow">公司共享</span><h1>团队库</h1><p>浏览、预览、复制同事已发布的资产与场景。发布与重度编辑仍在本地资产库 / 场景库或工作台完成。</p></div><Share1Icon aria-hidden/></header>
 <div className="resource-toolbar team-studio-toolbar"><div className="resource-segments" role="group" aria-label="团队库类型"><Button variant="soft" color="gray" aria-pressed={kind==='asset'} onClick={()=>setKind('asset')}><CubeIcon/>团队资产</Button><Button variant="soft" color="gray" aria-pressed={kind==='scene'} onClick={()=>setKind('scene')}><LayersIcon/>团队场景</Button></div></div>
 <section className="team-studio-body"><TeamLibraryPane key={kind} kind={kind} onCopied={onCopied}/></section>
 <footer className="resource-footer team-studio-footer"><span>团队内容保存在公司服务器；本机 IndexedDB 仅保存你的副本与草稿。</span></footer>
 </main>;
}
