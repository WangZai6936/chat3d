import {useEffect} from 'react';
import {updateSignals} from '../domain/appUpdate';
import {setAppUpdateContext} from '../domain/appUpdateClient';
import {useEditorStore} from '../store';
import {useWorkspaceStore} from '../workspace';

export function usePublishUpdateContext() {
  const sessions = useWorkspaceStore(s => s.sessions);
  const activeId = useWorkspaceStore(s => s.activeId);
  const status = useEditorStore(s => s.aiStatus);
  const dirty = useEditorStore(s => s.dirty);
  const signals = updateSignals(sessions.map(session => ({id: session.id, deleted: !!session.deletedAt, pending: !!(session.snapshot.pendingBatch && session.snapshot.pendingResult), wasRunning: !!session.snapshot.wasRunning, dirty: !!session.snapshot.dirty})), {id: activeId, status, dirty});
  useEffect(() => { setAppUpdateContext(signals); }, [signals.busy, signals.dirty]);
}