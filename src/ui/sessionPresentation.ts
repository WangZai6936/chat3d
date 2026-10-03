import type {WorkspaceSession} from '../workspace';
export type SessionState='running'|'review'|'draft'|'ready'|'empty';
export function sessionState(session:WorkspaceSession,liveStatus?:string):SessionState {
 if(liveStatus&&['capturing','context','generating','validating','applying'].includes(liveStatus))return 'running';
 if(session.snapshot.pendingBatch)return 'review';
 if(session.snapshot.composerText.trim()||session.snapshot.composerImages.length)return 'draft';
 if(session.snapshot.doc.nodes.length||session.snapshot.messages.length)return 'ready';
 return 'empty';
}
export const sessionStateLabel:Record<SessionState,string>={running:'进行中',review:'待确认',draft:'有草稿',ready:'可继续',empty:'新会话'};
export function sessionDateGroup(time:number,now=Date.now()):string {
 const today=new Date(now);today.setHours(0,0,0,0);const yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);
 return time>=today.getTime()?'今天':time>=yesterday.getTime()?'昨天':'更早';
}
