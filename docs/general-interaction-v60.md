# General interaction and geometry review

The update adds a two-link shoulder/elbow/wrist solver, explicit target-based press/grasp/reach hand placement, and a continuous swept sleeve. It rejects unreachable targets and requires explicit replacement IDs. It is not full-body IK, physics, carrying automation or a collision solver. Support is explicitly unsupported rather than silently approximated.

CPU software capture provides bounded z-buffered triangle projections when WebGL is unavailable. It does not implement PBR, textures, shadows, accurate transparency or animation samples. Software captures therefore cannot pass the material criterion. Geometry images are evidence only; local repair still needs a later model turn and a new-revision check.

Workcell declarations connect real station/operator/material IDs with task-specific requirements and access bounds. Empty storage or autonomous cells can explicitly opt out. Missing declarations are not inferred as completed work, and zero warnings do not certify process correctness.

Interaction tool definitions are loaded only when requested or explicitly enabled. Scene-edit compaction now recognizes hand/arm mutations; question-only mode blocks those mutations.

A full 733-node machining scene with 264,576 triangles was CPU-rendered offline. This verifies renderer throughput on one scene, not LLM generation performance. Complete same-condition machining/warehouse/assembly generation comparisons remain a separate acceptance requirement; no global Token savings or overall visual completion is claimed.

## v61–v62 follow-up

- Diagnostic captures can isolate explicitly selected nodes without changing the source scene. These images do not count toward acceptance evidence. Contextual captures remain mandatory for spatial conclusions.
- Part queries include small bilingual term aliases and bounded real-name suggestions on no match. Overview material payloads are limited to displayed anchors; full component and surface queries retain original material data.
- Support now uses an explicit palm surface, flat hand pose, and opposing object surface normal. Bimanual static carrying solves left/right reach before one atomic replacement. Neither capability implements whole-body balance, load limits, automatic object motion, or collision certification.
- Topology inspection counts welded boundary/non-manifold edges, winding inconsistencies, and degenerate/duplicate triangles. Intentional openings are not automatically failures. Topological closure is not proof of wall thickness, self-intersection freedom or visual quality.
- Declared horizontal access routes check oriented corridor segments across a continuous centerline. This is not automatic pathfinding, vehicle turn-radius validation, or safety certification.
- Empty optional capture component IDs normalize to a whole-scene scope. A regression reproduces and prevents repeated submission failures caused by an empty ID.

On the same exported 763-node workshop, overview JSON falls from 29,041 to 11,712 characters, with 22 anchors retained and 19 rather than 98 detailed material records in the overview. This is a deterministic payload comparison, not measured Token or generation-time improvement.

The v61 live test exercised diagnosis → one hand replacement → contextual recapture, but the remaining shape/contact evidence did not pass; it used 502,274 reported Tokens and is not an efficiency success. Cross-scene generation benchmarks remain outstanding.

## v63 review-loop correction

The completed warehouse comparison did not establish an efficiency win: v61 stopped for lack of progress at 49 model rounds and 2,416,641 reported Tokens; v62 submitted a quality-pending draft at 62 rounds and 2,976,589 Tokens (+23.2%). Timeline durations sum to 1,216.8 s and 1,090.3 s respectively; these are rounded execution sums, not precise wall-clock measurements. Different terminal states and pending visual quality prevent a successful quality/performance benchmark classification.

Multi-component image packets now remain until all sibling scopes have been audited at the same revision. A past revision's audit cannot discard a new capture. Batched detail review validates all entries before recording any, returns bounded model-facing pending summaries, and retains full records in the UI. Repeated identical audits use the existing version-aware check cache. Capture evidence, real node references, and material limitations are unchanged. New tests verify atomic rollback and preservation of unaudited/current-version pictures; no real Token savings are claimed for this follow-up until measured.

## v64 target-framed evidence

Automatic closeups frame the actual target instead of expanding the camera bounds to include large neighbours; the complete scene still renders and can occlude the target. Capture agendas provide up to 24 real part references with explicit remainder counts, so a model can cite visible evidence without repeatedly reading full component data. References do not certify correctness.

For an obstructed target, `inspect_view_visibility` compares six low-resolution, depth-tested directions with isolated projections to estimate visible opaque area and recommend two directions. It does not change the scene, certify semantic detail or handle transparent surfaces exactly. All-transparent/zero-area targets receive no recommendation. On the exported 561-part warehouse, a personnel target took about 2.02 seconds for the local visibility pass; top and perspective views were visibly less obstructed than the fixed front view. This is local rendering throughput, not an LLM Token or end-to-end quality benchmark.

## v65 bounded software capture recovery

The full assembly-line v62 baseline stopped after a software pixel-budget overflow (452 nodes, 57 rounds, 2,117,622 reported Tokens). Software capture now retries only that specific budget error at 320×240, then 160×120; it retains the full scene, keeps the same triangle and pixel limits, responds to cancellation, and does not retry unrelated errors. Downgraded captures are labelled as lower-resolution evidence, and unreadable details remain unverified. Unit tests cover recovery, three-attempt exhaustion, non-budget errors and cancellation. This addresses a rendering failure; it is not a quality or Token-success claim.

## v66 incremental evidence and recoverable command errors

Unchanged subjects can retain validated intrinsic evidence with an explicit source revision. Scene changes invalidate contact/context conclusions; target geometry, placement, identity or materials changes discard its review, and asset/animation changes invalidate reuse globally. Only still-valid engine-originated records are carried, and unknown remains unknown. Partial audit updates are allowed only when a complete reusable record exists; otherwise all six checks remain required.

Failed edit batches can be corrected with at most eight field replacements and two retries, only at the same scene revision and with the same task instructions. The corrected complete batch is validated and committed atomically. Invalid paths, prototype keys, stale scenes/tasks and exhausted retries fail closed. Array insertion/deletion is unavailable. Geometry and assembly errors now identify individual fields/parts instead of silently losing their reason. Tests cover one-field recovery without partial writes and conservative review invalidation.

The v65 full assembly candidate produced only a floor after repeated parameter validation failures. Its 326,764 Tokens is not an efficiency success compared with the quality-pending v62 baseline. A separate bounded continuation may test recovery, but must not be reported as the same fixed-prompt completed benchmark.
