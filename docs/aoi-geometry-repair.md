# AOI geometry validation and recovery

2026-10-07. This change is local; publication and desktop packaging remain paused at the user's request.

- Assembly validation now reports invalid parts together instead of stopping at the first invalid part. A part's first failing validation is reported with its index; geometry validation may report multiple parameter failures for that part. No partial assembly is created.
- Box bevel failures include current dimensions, radius, and the maximum allowed radius. Geometry is never silently clamped or rescaled.
- Structured correction guidance uses the box `bevelRadius` field. Corrections remain cumulative, scoped to the cached request and scene revision, with the existing two-attempt cap.
- Fewer invalid parts during a cached correction counts as recovery progress. Merely changing text or repeating the same failure does not; overall budgets remain in force.
- Assistant error bubbles are concise. Current raw failure detail is retained in a collapsed section rather than repeated in the bubble. Historical errors retain their own details.

Focused verification: two thin-screen bevel errors are returned together; valid body preserved across two cumulative corrections; all-original tests for scope, stale cache, and correction limit retained. UI test verifies one collapsed raw-detail occurrence and preserved stored error.

Limitations: mocked model transport and DOM tests are not real upstream AOI generation or GPU/Windows visual acceptance. No MES business-binding functionality is included.

Final validation: full regression produced 885 PASS results and proceeded to build; TypeScript, frontend and server builds completed with exit 0 using installed local tools. Existing chunk-size warnings remain. No real model service call or Windows GUI test was performed.
