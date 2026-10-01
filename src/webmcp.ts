import { useEditorStore } from './store';

type Tool = { name: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean }; execute: (input: unknown) => unknown };
const context = (document as Document & { modelContext?: { registerTool: (tool: Tool, options: {signal: AbortSignal}) => void | Promise<void> } }).modelContext;
if (context?.registerTool) {
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  try {
    void Promise.resolve(context.registerTool({
      name: 'read_scene_status',
      description: 'Read the current chat3d scene object count, selected object IDs, and preview status. Does not disclose model credentials or send a model request.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Expected an empty object');
        const state = useEditorStore.getState();
        return { objectCount: (state.previewDoc ?? state.doc).nodes.length, selectedIds: [...state.selection], status: state.aiStatus, dirty: state.dirty };
      },
    }, { signal: lifecycle.signal })).catch(() => {});
  } catch { /* Optional browser API: normal UI remains available. */ }
}
