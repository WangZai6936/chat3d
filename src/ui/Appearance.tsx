import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {Theme,Button,DropdownMenu,Select} from '@radix-ui/themes';
import {SunIcon,MoonIcon,DesktopIcon} from '@radix-ui/react-icons';
export type AppearanceMode='light'|'dark'|'system';
export const APPEARANCE_KEY='chat3d.appearance.v1';
export const parseAppearance=(value:unknown):AppearanceMode=>value==='dark'||value==='system'?value:'light';
const labels={light:'浅色',dark:'深色',system:'跟随系统'};
const AppearanceContext=createContext({mode:'light' as AppearanceMode,resolved:'light' as 'light'|'dark',setMode:(_mode:AppearanceMode)=>{},storageError:false});
export const useAppearance=()=>useContext(AppearanceContext);
export function AppearanceProvider({children}:{children:ReactNode}){
 const [mode,setModeState]=useState<AppearanceMode>(()=>{try{return parseAppearance(localStorage.getItem(APPEARANCE_KEY));}catch{return 'light';}});
 const [systemDark,setSystemDark]=useState(()=>typeof window.matchMedia==='function'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
 const [storageError,setStorageError]=useState(false);
 const resolved=mode==='system'?(systemDark?'dark':'light'):mode;
 useEffect(()=>{if(typeof window.matchMedia!=='function')return;const media=window.matchMedia('(prefers-color-scheme: dark)');const changed=()=>setSystemDark(media.matches);changed();media.addEventListener('change',changed);return()=>media.removeEventListener('change',changed);},[]);
 useEffect(()=>{document.documentElement.dataset.appearance=resolved;document.documentElement.style.colorScheme=resolved;},[resolved]);
 useEffect(()=>{const changed=(event:StorageEvent)=>{if(event.key===APPEARANCE_KEY||event.key===null){setModeState(parseAppearance(event.newValue));setStorageError(false);}};window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed);},[]);
 const setMode=(value:AppearanceMode)=>{setModeState(value);try{localStorage.setItem(APPEARANCE_KEY,value);setStorageError(false);}catch{setStorageError(true);}};
 return <AppearanceContext.Provider value={{mode,resolved,setMode,storageError}}><Theme appearance={resolved} accentColor="blue" grayColor="gray" radius="medium" scaling="100%">{children}</Theme></AppearanceContext.Provider>;
}
export function AppearanceMenu(){const {mode,resolved,setMode}=useAppearance();const Icon=mode==='system'?DesktopIcon:resolved==='dark'?MoonIcon:SunIcon;return <DropdownMenu.Root><DropdownMenu.Trigger><Button variant="ghost" color="gray" className="appearance-menu" aria-label={`切换外观，当前${labels[mode]}`} title={`外观：${labels[mode]}`}><Icon/><span>{labels[mode]}</span></Button></DropdownMenu.Trigger><DropdownMenu.Content><DropdownMenu.Label>应用外观</DropdownMenu.Label><DropdownMenu.RadioGroup value={mode} onValueChange={v=>setMode(parseAppearance(v))}>{Object.entries(labels).map(([value,label])=><DropdownMenu.RadioItem key={value} value={value}>{label}</DropdownMenu.RadioItem>)}</DropdownMenu.RadioGroup></DropdownMenu.Content></DropdownMenu.Root>;}
export function AppearanceSettings(){const {mode,setMode,storageError}=useAppearance();return <><Select.Root value={mode} onValueChange={v=>setMode(parseAppearance(v))}><Select.Trigger aria-label="应用外观"/><Select.Content>{Object.entries(labels).map(([value,label])=><Select.Item key={value} value={value}>{label}</Select.Item>)}</Select.Content></Select.Root>{storageError&&<p role="status">已切换外观，但浏览器未允许保存偏好；刷新后可能恢复默认。</p>}</>;}
