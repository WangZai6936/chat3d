import {useEditorStore, type EditorState, type EditorStore} from './store';

// Only conversation-owned fields travel through the active editor projection.
// Credentials/preferences and the shared viewport's readiness never travel with it.
export function conversationState(s: EditorState) {
  return {doc:s.doc,past:s.past,future:s.future,dirty:s.dirty,autosaveError:s.autosaveError,
    composerText:s.composerText,composerImages:s.composerImages,lastRun:s.lastRun,
    selection:s.selection,messages:s.messages,aiStatus:s.aiStatus,pendingBatch:s.pendingBatch,
    pendingResult:s.pendingResult,previewDoc:s.previewDoc,aiError:s.aiError};
}
let active:EditorStore|null=null, unsubscribe:(()=>void)|undefined, projecting=false;
export function activeConversationStore():EditorStore {return active??useEditorStore;}
export function bindConversationStore(store:EditorStore) {
  unsubscribe?.();active=store;
  const project=()=>{projecting=true;try{useEditorStore.setState(conversationState(store.getState()));}finally{projecting=false;}};
  project();unsubscribe=store.subscribe(project);
}
useEditorStore.subscribe((state,previous)=>{
  if(!active||projecting)return;
  const next=conversationState(state),prev=conversationState(previous);
  if((Object.keys(next) as (keyof typeof next)[]).some(key=>next[key]!==prev[key]))active.setState(next);
});
