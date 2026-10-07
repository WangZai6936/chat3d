# Reusable interaction metadata and local editing

2026-10-07. Root implementation, publication still paused by the user.

## Delivered code
- Optional PoseRig metadata stores named rigid joints and contact/grip points in owning-node local coordinates. Existing projects remain valid without this field. World placement is resolved from current node transforms.
- Metadata is preserved in project and asset JSON. Asset import, whole-assembly duplication and manual array placement remap internal IDs to independent instances. Geometry signatures detect stale anchors after mesh/part changes; stale rigs are not silently reused.
- `define_pose_rig` records explicit joint/anchor data through reversible scene commands. Existing models require an initial evidence-based calibration; this is not automatic skinning or automatic joint discovery.
- `prepare_local_edit` returns target parts, current reusable rig data, neighboring bounding-box candidates and bounded summaries of other components. Truncation is explicit. All full-scene data remains intact, and edit permissions are unchanged.
- `pose_with_rig` applies ordered relative rigid rotations and optional named contact-distance checks as one atomic command plan. Failed distances reject the whole operation. Optional review views are captured in the same tool invocation; interpretation still happens on the next model round under existing review requirements.

## Validation
921 full regression PASS results; TypeScript, frontend and server builds exit 0. Ten new targeted checks cover persistence, rigid articulation, atomic contact rejection, anchor movement, stale data, independent asset instances, clone remapping, local summaries, malformed definitions and the combined agent workflow.
A legacy roundtrip failure caused by adding undefined metadata to nodes without rigs was fixed and the full suite rerun.

## Limits
Tests use mocked model responses and deterministic fixture geometry. A two-tool fixture workflow is not proof that the user's 40-round task will take two calls or any fixed time. Named point distance is not surface-contact, collision, force or visual acceptance. Original full project JSON is still required to reproduce the user's scene; supplied diagnostic files intentionally omit its meshes. No paid model call, Windows/GPU acceptance, native Rust export verification, push or deployment was performed.
