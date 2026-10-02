# Industrial equipment components

This release adds editable generic equipment rather than using image-only assets.

- `smt_mounter`: panel seams, tinted observation windows, internal gantry/head, PCB rails, feeder rack/reels and supports, HMI, emergency stop, tower light, adjustable feet.
- `pcb_conveyor`: separate rails, narrow belts, aluminium supports, control enclosure, sensor and adjustment wheel.
- Dimensions are schematic design parameters in metres; positive Z is the front and X is board transport direction. Default mounter width/depth/height are 1.6/1.5/1.65 m excluding protrusions.
- Public industrial scale reference: https://global.yamaha-motor.com/business/smt/mounter/ysm20r/spec/ . These components are original generic designs, not YSM20R geometry, brand assets, certified dimensions, or production-ready CAD.
- `createTemplate` is one atomic command and expands to editable primitive nodes sharing an assembly identifier. `translateAssembly` moves the entire assembly by a delta using any member ID. This does not introduce nested transform hierarchies.
- Box bevels can be specified in metres. Viewport and GLB export use the same geometry implementation and PBR materials.
- Agent context summarizes assemblies until `read_scene` is called with an assembly ID. This avoids resending every detail after each edit.
- Empty scenes have a model-free component preview button. It does not call the gateway and requires normal preview confirmation before committing.

Validation: automated geometry, parser, assembly move, undo/redo, project roundtrip, material export and model-free preview checks. Exported GLB rendered in Blender for geometry inspection; this is not proof of identical browser lighting or live-model generation quality. Full factory asset catalog, arbitrary reference reconstruction, reflow ovens/printers, and automatic full-factory completion remain outside this release.

## Reference-standard workshop integration (v10)

`createTemplate` now accepts `smt_workshop` on empty scenes. Parameters: `lines` 1 or 2; `people`, `materialZone`, `qualityZone` 0 or 1. This uses the same original procedural design as the independently delivered SMT sandbox. The adapter flattens exact world transforms and material assignments to editable Scene DSL primitives, grouped by assembly, with 1390 nodes in the default scene (including labels). It is not an embedded external page or an image backdrop. Existing nonempty scenes reject a second full-workshop insertion to avoid overlapping work.

The generator prompt uses this component for a matching whole-SMT-workshop request, then normal review/edit commands. It can create one or two lines, omit optional zones, inspect part IDs and move whole assemblies. The model-free preview provides a direct way to inspect the standard without gateway costs. All creation remains a single confirmable undoable transaction. The object tree collapses assemblies, supports search and whole-assembly selection; group properties provide incremental movement.

Materials, palette, studio background, lights and presentation/overhead camera controls are aligned with the standalone visual standard. Document labels use local canvas textures shared by renderer/exporter. The workshop represents a static editable layout: moving PCB/AGV demo animation and the standalone presentation-page navigation have not been imported. Fixed six-round/five-minute Pi budgets remain in this release. Live gateway, full browser interaction and label-texture GLB visual checks remain unverified; tests cover source-to-DSL matrix/material parity, bounded geometry, edit/undo, serialization, UI grouping and mocked Pi execution.

## v11: reliable starting scene for the reported request

For an explicit request to create an unspecified whole workshop diorama in an empty scene, without reference images, explicit dimensions/line counts, exclusions or a different named industry, the harness now constructs the complete editable SMT baseline locally before the provider answers. The assumption (SMT example, 30×20m, two lines) is recorded and included in the submission summary. The model receives real assembly context and handles changes/review rather than choosing whether to use the workshop component at all. Cancellation or provider failure retains this baseline as an unfinished draft. This is preset-backed generation, not evidence of arbitrary industrial-layout generation or live gateway quality.

Grid is hidden by default and can be toggled. Perspective fitting now tests all eight bounding-box corners in camera axes, reducing excessive empty space while preserving portrait/landscape/overhead containment. Source tests specifically exercise the user's generic Chinese request through ChatPanel before any provider response; provider content remains mocked. Fixed iteration/time limits remain unchanged.

## v12: no preset generation

The user rejected preset-backed generation. The v11 automatic initializer has been removed, all template preview entry points removed, and `createTemplate` removed from the AI command allowlist and model instructions. Old documents and internal legacy fixtures still load; no user scene is deleted. Full workshop/equipment builders remain internal compatibility/test code, not exposed as generation commands.

New general operations replace that approach: `createAssembly` accepts arbitrary model-defined primitive parts, transforms and bounded linear repetition; `duplicateAssembly` copies any existing user-defined assembly. There are no embedded equipment shapes or industry defaults in this builder. Creation/duplication use stable IDs, atomic history, snapshot persistence and node-count limits. The new tests specifically reject attempts to generate every former template ID and check that a machining request has no scene side effects before model output.

A prompt construction defect was also found: removal of the old single-JSON output section swallowed all intervening capability headings until the command heading. This removed the earlier template guides, and would have hidden new general assembly instructions. The removal now stops at the next heading; a test verifies that assembly/array instructions reach the actual Pi request context.

This correction and the generic composition tools do not establish live-model visual quality. Direct-code-equivalent generation, richer shapes and reliable full-scene iteration remain ongoing work. Existing six-round/five-minute limits are unchanged.


## Current generation and editing behavior (2026-10-01)

The historical preset sections above are superseded. The model generates free assemblies, and does not insert equipment or workshop templates automatically. Productive tasks are not capped at six turns or five total minutes. No-activity, repeated-error and no-progress guards preserve successful drafts.

The current editor supports generic frame, tube, capsule and trapezoid primitives; explicit material/appearance editing; selected-object scope protection; placement locks; reversible property edits; and before/after preview comparison. Complete new scenes require a design brief with flow, layout, equipment and inspection criteria. A representative new assembly must receive a focused visual review before duplication in these scenes.

Composition plans add zones, links, supporting elements, palette and presentation. Assemblies can declare `sceneRole`, `planKey` and `zone`; these are metadata, not proof of physical or process correctness. `inspect_scene` compares declared components against the plan and reports conservative bounding-box overlap candidates, unusual standing-person heights, and high-metalness wall/floor materials. It does not certify collision-free geometry, connected conveyors, engineering compliance, or visual quality. New whole scenes must inspect the latest revision before submitting. Existing scenes may receive classifications with `setAssemblyMetadata`.

Role-based defaults apply only when a part omits its material. Explicit materials remain authoritative. The viewport offers reversible light/slate backdrops; this does not recolor model objects.

Validation uses automated domain/component tests with mocked model transport. Browser visual QA, actual provider quality/cost comparison, and native installer builds still require their respective environments. Run `npm test` and `npm run build` for the automated suite.

### Local equipment editing and resource reuse

`appendAssemblyParts` adds parts to an existing component; `replaceAssemblyParts` replaces only explicitly listed member IDs. Replacing the anchor preserves its addressable ID. Both operations preserve component metadata and support atomic undo/redo, including original node order. Origins are world coordinates; part transforms are relative to the supplied origin.

`transformAssembly` rotates a complete component and applies uniform scaling around its bottom-centre bounds by default, or an explicit world pivot. The property panel exposes rotation and uniform scale for whole-component selection and for individual parts; single-part edits never silently expand to the entire component. Nonuniform assembly scaling is not supported.

The selected-scope option can permit new parts within fully selected components. It does not permit new unrelated equipment, edits to unselected objects, or changes to shared materials that affect unselected objects. Original selection boundaries remain frozen throughout a run; newly appended parts can be refined in later turns. Placement locks still protect existing positions and orientations.

The renderer reconciles meshes by stable ID and reuses geometry/material resources for unchanged objects, disposing resources after their last visible user disappears. Agent context summarizes fully selected assemblies and expands details on demand. These are implementation improvements, not measured browser FPS or live-token savings.

Real-model generation, visual acceptance and elapsed-time/token comparisons are assigned to the user. Automated checks remain development safeguards and must not be presented as that acceptance.

### Workbench presentation (MonoCode-inspired)

The editor uses compact neutral-dark panes with a central 3D scene, a session rail and chat/task tabs. Session pinning is browser-local metadata, and the existing storage format remains compatible. Date grouping and draft/review filters summarize actual saved state. The task view shows the latest recorded execution and the conversation's existing batch outcomes; it does not add background execution, task scheduling or multi-agent orchestration.

Switching between chat and task tabs, or entering scene-focus mode, keeps the chat component mounted. Drafts and active generation are preserved. Keyboard tab navigation and Escape-to-exit focus mode are supported. Wide screens dock the inspector beside the scene; narrower screens retain an overlay. CSS changes do not alter scene geometry or model materials. Developer interaction checks use jsdom and a fixture viewport, not browser visual verification.

### Planning and visual-review recovery

Plans support up to24 steps and24 structural features per equipment category rather than the previous6. Oversized plans receive bounded corrective feedback; requirements are not silently truncated. First valid planning is progress, while repeated planning alone cannot reset the no-progress guard indefinitely. Failure messages retain the actual tool-validation cause instead of blaming model compatibility without evidence.

Capture calls now expose explicit scene/assembly scope. Logs report actual scope and revision. New visual-review progress is keyed by revision, scope and view, so a fresh full-scene/top review after a close-up is counted. Repeated review of the same key is still not progress. A blocked submission reports the required current revision and exact full-scene capture/review sequence. This fixes observed validation/progress-accounting defects; it does not certify that every model/provider can always recover or complete an arbitrary scene.

### Conversation scope UI update

The selected-only and selected-assembly-additions checkboxes have been removed. Highlighted selection is now reference context, not an automatic edit boundary. Both Pi and compatibility prompts condition their actual restrictions on an explicit scope, avoiding the previous contradictory unconditional prohibition of edits to unselected objects. Unambiguous explicit selected-object wording can still freeze a guarded local scope; other natural-language constraints remain part of the request and preview review. The existing position/orientation lock remains available. Previously pending batches retain their original recorded guards.
