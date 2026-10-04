# General quality upgrade v53

## Scope
This change is category-independent. No checks or geometry choose behavior based on a benchmark model's name. Existing asset catalogs remain optional rather than acceptance substitutes.

- Simple concave/convex XY extrusion with up to eight disjoint through-holes. Rings may have either winding. Invalid crossings, touching boundaries, nesting, repeated vertices and abusive budgets are rejected before atomic scene edits.
- Optional quadratic contour rounding with conservative clearance limit; this is a two-dimensional outline treatment, not exact circular fillets or a CAD solid boolean engine. Thickness-direction edges remain sharp.
- One `inspect_model_quality` tool aggregates scene/geometry clues, declared requirements, registered connections/contact surfaces and affected targets with proposed views. Actual image evidence is still required by the existing visual gates. No generated packet marks a model accepted.
- Run-local repeated checks reuse prior evidence only when revision, arguments, requirement state, steering text, design, detail reviews and rendering availability are unchanged. Cache is bounded, and thrown failures are not recorded. No claim of a measured Token saving until a live comparison.
- Exact duplicate primitive geometry/transforms are warned about independently of names; imported mesh arrays are intentionally excluded from this cheap test.
- Prompt strategy starts with silhouette/proportions and structural relationships, then functional details and materials; preserve unaffected content, use continuous geometry where appropriate, avoid parts-count quotas and decoration as quality proxies.

## Limits
WebGL remains unavailable in the test cloud browser. Offline exported geometry renders can verify actual appearance, but do not establish an integrated automatic visual-review pass. Organic topology, detailed human anatomy, general CAD booleans and manufacturing correctness remain outside these additions. Polygon holes and contour rounding improve representational capacity; they do not guarantee a model chooses the right construction.

## Verification
Run the complete npm test suite and build; focused tests cover concavity, real empty holes in both winding directions, malformed contours, safe rounding, project persistence, cache invalidation and the actual agent tool integration using mocked model responses. Then use previously unused categories for live generation and inspect actual exported geometry without manual repair. Keep live results separate from mocked regression results.

## Live held-out sample and follow-up v54
A new three-category request (wooden chair, architectural divider, ceramic vase with three leafy stems) generated 18 parts in 317 seconds, 14 model rounds, 15 tool calls and 255,375 Token. The model used the new unified quality tool and genuine perforated profiles. This is not an old/new efficiency A/B, so no speed or Token improvement is claimed. Actual exports were rendered without geometry repair; procedural normal/roughness pixels were rebuilt from the same application generator for offline Blender review. Chair and divider openings are genuine. Vase silhouette and leaves remain visibly simplified; the result does not establish universal high detail.

Live failures revealed natural-language shared trailing units (e.g. width/depth/height with a single final unit) were rejected. The follow-up parser accepts only contiguous labelled dimensions sharing an explicit trailing unit and approximate labels, never borrows units across sentences or unrelated counts, and reports the failing field. Existing evidence and axis checks remain mandatory.

An optional shape-preserving smooth radial profile interpolation was added for continuous revolved objects; legacy profiles are unchanged without smooth=true. Interpolated radii stay within adjacent controls and retain wall clearance. This addition is unit tested, not credited as an automatic repair of the already-generated sample.
