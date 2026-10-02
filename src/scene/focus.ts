let focus:((ids:string[])=>void)|null=null;
export function registerSceneFocus(handler:(ids:string[])=>void){focus=handler;return ()=>{if(focus===handler)focus=null;};}
export function focusSceneObjects(ids:string[]){if(!focus||!ids.length)return false;focus(ids);return true;}
