import {createModuleRegistry} from './registry';
import {ViewportPanel} from '../ui/ViewportPanel';
import {ObjectTree} from '../ui/ObjectTree';
import {PropertiesPanel} from '../ui/PropertiesPanel';
export const workbenchModules=createModuleRegistry();
workbenchModules.register({id:'modeling',title:'三维建模',version:1,Viewport:ViewportPanel,Objects:ObjectTree,Properties:PropertiesPanel,documentFormat:'chat3d-project'});
export const modelingModule=workbenchModules.get('modeling');
