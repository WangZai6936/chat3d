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
