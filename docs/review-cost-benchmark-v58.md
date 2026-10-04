# v58: general quality, request cost and repeatable evaluation

## Implemented
1. Automatic capture agenda for changed objects: front/back closeups (up to two targets per page), perspective/top whole-scene evidence, and spatially relevant neighbor assemblies. Captures precede review by a model turn; partial capture failure does not certify evidence. Existing unavailable-renderer behavior remains honest and bounded.
2. Profile extrusions support optional `edgeRadius`, using inward bevels while retaining the outer dimensions, total thickness and genuine holes. Radius constrained by thickness and contour clearance; default zero preserves old geometry. This is not unrestricted CAD filleting.
3. Numeric per-round request footprint in task records and sanitized diagnostics. Separates system instructions, tools, user text, assistant history, tool results and image payload. Characters are not tokens. Actual provider token usage remains separately reported. Optional animation/surface tool definitions load on request or explicit task intent. Obsolete initial scene text is omitted after successful edits; user instructions and edit constraints stay intact.
4. Declared world-volume clearance inspection with actual node IDs and explicit exclusions, for aisles/operation/maintenance regions. Conservative AABB candidates only, no safety certification or routing guarantee. Enclosing safety assemblies without part overlap receive distinct relation metadata.
5. Frozen complete-workshop, warehouse and assembly-line prompts plus a benchmark comparator. Rejects differing prompts, initial scene, model, settings, renderer, parallel mode, incomplete runs or incomplete usage. Unknown/failed visual quality cannot become a quality win because a run is faster.

## Verification boundaries
- Unit/integration tests use mock model responses and render injections. Real model calls and real pixels are separate acceptance stages.
- Static replay of the same 763-part workshop request: serialized first-context characters 34,924 → 30,947; tool schemas 16,339 → 12,051. This is a deterministic request-payload measurement, not actual token/billing/time reduction.
- Fixed benchmark scenarios define comparable future runs; merely creating the suite does not mean those full scenarios were generated or passed.
- Cloud browser WebGL has been unavailable. No persistent rendering service is installed by this change; an unavailable renderer cannot produce a visual pass.

Run: `npm test`, `npm run build`, `node tests/worker-proxy.mjs`.
Compare completed compatible result records: `node scripts/compare-benchmarks.mjs baseline.json candidate.json`.

## Hand interaction follow-up (v59)

Added a general five-digit procedural hand with relaxed, pointing, power and pinch poses, explicit wrist/forward/dorsal coordinates and grip diameter. The `create_hand_pose` tool replaces only explicitly named hand parts, retains assembly membership and rejects external connection references. This is not an IK or collision solver.

Newly loaded worker assets use this hand generator; scanner and tape tools have separate grip handles. Existing scenes are not silently replaced. Person connection acceptance now additionally requires two current-version hand/tool closeups. The automatic review agenda includes those crops. Merely coincident anchors or a full-body image cannot meet this prerequisite.

The 763-node workshop was reused for an explicit local geometry repair and offline Blender closeups. Non-person nodes were checked unchanged. This is direct geometry repair, not a model-generated efficiency benchmark, and offline images do not certify the browser's automatic visual repair loop. Cloth elbow artifacts and tool/work-surface action suitability still need separate inspection; no complete quality acceptance is claimed.
