# v57: general spatial review and context efficiency

## Changes
- Cross-assembly world-space occupancy screening for all non-floor/non-building objects, not a workshop-specific name list.
- Person torso/pelvis envelope checks in addition to hand contact checks. Hollow containers may still reserve occupied space. Returns actual group IDs, overlap extent and up to four part-pair candidates per group pair.
- 200 group / 40,000 part-pair budget, explicit truncation and coverage. No automatic collision pass, auto-movement, or physics certification. Same-assembly joins excluded. Deliberate seating, enclosing partitions and support relationships remain visual-review candidates.
- Model placement queries omit UV/material details by default. Surface queries explicitly request those fields; direct domain API retains prior default for compatibility.
- Large, already successful latest edit arguments are reduced in the model-request history only. Call/result IDs and authoritative results are preserved; failed and pending calls remain unchanged; stored transcript, actual scene and undo are untouched.

## Verified regression
The fixture `tests/fixtures/workshop-v56-bounds.json` derives bounds from all 763 actual v56 nodes, preserving world transforms. Roles were checked against the exported scene metadata. It reproduces the warehouse worker occupying the raw-material bin and detects another QC/desk candidate. It is not a replacement generated model or a claim that every candidate is a real collision.

Nine added tests cover person/container overlap, generic nonindustrial objects, support contact, same assembly, hidden geometry, limited coverage, actual complete workshop, movement invalidation, query fields and successful-history compaction (two checks are grouped in the test runner).

Synthetic history payload: 110,326 to 752 serialized characters for a 129-operation acknowledged call fixture. This is not measured model Token use or a generation speed claim. Live model behavior needs separate verification.

## Limits
AABB tests are conservative: hollow shells and enclosing barriers can yield false positives. Small or rotated thin geometry can still require exact narrow-phase inspection. Floor/building envelopes are intentionally omitted; access-route clearance and full physical simulation are not implemented. No visual quality acceptance is automatic.
