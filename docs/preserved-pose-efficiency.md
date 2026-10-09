# Preserve asset shape and reduce avoidable agent work

2026-10-07. User authorized fixing all diagnosed issues. Root implemented these changes; publication remains paused.

## Implemented
- `pose_existing_parts` applies sequential world-space rigid joint rotations to existing separate nodes, preserving geometry, materials, scale and IDs. Invalid axes, foreign targets and unsupported hierarchical coordinates reject atomically. It is not automatic rigging or mesh skinning.
- Pose/preserve-shape intent activates transaction-level asset protection against deletion, geometry replacement, rescaling, hiding, material edits, identity changes and same-assembly overlay parts. Brief continuation uses recent intent. Explicit new rebuild requests are distinguished from pose-only edits. Legacy procedural arm-pose tools cannot silently rebuild imported asset hands/sleeves.
- Pose submission requires actual transform change; for hand/arm goals, metadata-only edits and uniform whole-asset relocation cannot stand in for articulation. Geometric change alone still does not certify visual quality, contact or collision.
- Batched part lookup returns multiple query memberships with a deduplicated part table. Preparation progress requires genuinely new part IDs for the current visual state, with a bounded allowance; changed search wording or empty results cannot sustain an idle loop. Existing multi-component read regression remains intact.
- Metadata-only renaming does not count as modeling progress; reworded criteria without objective status/evidence-state changes do not count as new audit progress.
- Pose requests exclude unrelated construction tool schemas while retaining editing, evidence, review and submission tools. Old same-revision/scope/view images are pruned only when superseded by newer equivalent captures. User reference images and distinct unreviewed views are retained.

## Verification
Final full suite: 911 PASS; TypeScript, frontend and server builds exit 0. Twelve new checks cover preservation, bypass rejection, rigid articulation vs whole-object movement, incomplete submission, multi-query lookup, stalled empty-query loops, image retention and request schema reduction.

Synthetic metrics only: tool schema 25,839 -> 9,125 characters (37 -> 21 exposed tools); duplicate-image fixture 220,705 -> 160,658 serialized characters. These are not real upstream latency or cost measurements.

## Remaining validation and limits
The supplied diagnostic archive intentionally omits full geometry, so it cannot replay the actual packing-person scene. Requested original project JSON (and pre-edit version if available) for visual and performance comparison. No real model API call, paid token use, Windows install or GPU acceptance was performed. The previous native support-export command remains uncompiled here because Cargo is unavailable. Already altered user models are not silently restored. Indivisible unrigged meshes cannot be bent without changing geometry; unsupported articulation must be disclosed rather than replaced with a differently shaped mesh.

## Mixed legacy assemblies (2026-10-07)

A supplied revision-149 project exposed a compatibility bug: some imported
assemblies contain both asset-provenance nodes and generated nodes from earlier
edits. The preservation guard incorrectly treated the already-existing generated
nodes as newly added overlays, rejecting even a no-op check.

Protection now covers every existing node in an assembly that contains an asset
node. Existing generated geometry, materials and identity remain protected;
new overlays are still rejected. Relative-pose detection includes these existing
parts too. Two synthetic regression cases cover no-op acceptance, articulation,
and rejection of deletion, replacement and overlays.

Read-only checks against the supplied project passed parsing and serialization
roundtrip (853 nodes). A disposable in-memory one-degree hand rotation changed
only the requested node transform, preserving geometry and the original input.
The local context returned all 52 packer parts. This is a structural check, not
an anatomically calibrated pose, visual acceptance, or model-service benchmark.
The project contains no saved pose rigs; continuous sleeve meshes do not provide
independent elbow segments. Neither the project nor its geometry is committed.
