# Conversation-generated motion

Animation is a program attached to the editable scene, not a preset workshop. Ask the model to animate existing objects, or create independent moving parts and animate them in the same command batch. Model output is validated data: it cannot run JavaScript, fetch URLs or read files.

## Interaction

1. Describe the motion, route, dwell times and relationships. For whole-line motion, select the whole intended set or turn off selected-only scope; the agent cannot silently widen scope.
2. The agent identifies actual part IDs and creates animation tracks, then samples and visually reviews the result. Ambiguous object/route intent may still require clarification.
3. Play the pending preview with play/pause, reset,0.25–4× speed and timeline scrub. Confirm to save it as one undoable edit, or discard it.
4. Continue conversationally: slower, longer station dwell, reverse direction, change sequence, or remove motion. No manual action-library setup is required.

Playback is local deterministic math with no per-frame model/token calls. It never writes animated poses into base scene transforms. Geometry edits, session changes and generation reset/pause playback to prevent stale-state editing. Project JSON, autosave and sessions preserve animation programs. GLB currently exports static geometry only; it does not contain these animation tracks.

## Generic supported channels

- `position`: world-space offset from each target's original position, keyframed vector values
- `rotation`: angle in degrees around an explicit world-space axis and pivot, relative to base transform
- `scale`: positive vector multipliers on the base scale
- `visibility`: stepped boolean keyframes
- `follow`: follow the source object's transform delta from start to end, preserving initial world placement and retaining the release offset afterward. No binding cycles or more than16 dependency levels

Several tracks run in parallel. Timing plus repeated values expresses sequence, hold and reciprocation; the program can loop. Each target has at most one track per channel. To animate a whole assembly rigidly, target all its member IDs, not only the anchor. Position and rotation can combine; rotation is applied about the pivot before world translation offsets, then follow transform is applied. Following non-rigid scaling is not a physical attachment solver.

## New motion without new application code

Position/scale vectors and rotation angles can use bounded expression ASTs instead of keyframes. Leaves are numbers, `t` (seconds) and `pi`. Operators: add, sub, mul, div, mod, sin, cos, abs, min, max, clamp, gt, lt and if. Expression evaluation has no JavaScript/string execution, recursion beyond depth8, external access, user-defined loops or dynamic imports. Limits:64 nodes per expression,128 tracks,128 keyframes per track,2048 total target bindings, duration up to3600 seconds. Invalid/overflowing runtime values stop playback and restore base poses; they do not corrupt the document.

This supports generated circles, spirals, oscillation and conditional timing without scene-specific templates. It does not provide arbitrary untrusted script plugins, rigid-body physics, collision avoidance, conveyor-contact mechanics, inverse kinematics, skinning/mocap, cloth/liquid deformation or real production simulation. The model must disclose unsupported effects rather than claiming them delivered.

## Verification boundaries

The AI `preview_animation` tool evaluates distinct timeline samples and captures up to three rendered frames. It requires a subsequent visual review before an animation-changing preview is submitted. This is sampled checking, not proof that every intermediate frame is collision-free or visually correct. Repeated-frame false no-progress behavior remains guarded by the revised scope/view-aware review accounting.

Automated tests cover deterministic paths/holds, rotations, scale/visibility, expression bounds, follow/release, invalid references/cycles, scope including dependent followers, project roundtrip, undo/redo, CPU mesh updates/reset, UI controls and mocked agent preview/submit flow. Browser visual QA, live-provider generation quality and native-binary validation are separate and are not represented by these tests.
