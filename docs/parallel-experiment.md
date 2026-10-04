# Isolated component experiment

Default: OFF. Enable in Model configuration -> Advanced -> Experimental independent component parallel modeling. Compatibility/single-pass mode does not use it.

- At most two workers run at once; one call accepts two to four distinct static component tasks.
- Workers receive their own brief, shared style constraints, base material palette and available reference images. They do not receive the parent scene or conversation history and cannot delegate recursively.
- Existing catalogue placement and simple edits should remain batched single-agent work. Parallelism is for genuinely independent, substantial customization.
- Child documents are isolated. Successful data drafts are validated and merged through a single parent transaction with fresh node, material and internal connection identifiers. Failed or unsubmitted drafts are not merged. The parent must complete missing work and perform the ordinary scene-wide/detail checks.
- Stop cancels running and queued jobs. Steering invalidates the old job generation and prevents its late results being merged.
- Parent + child reported input/output/cache tokens are included in the main total. Child rounds, tools, elapsed time and reported usage appear in task records. Failed/cancelled or unreported requests conservatively mark usage as a known lower bound.
- Data-ready or merged does not mean visually accepted. Existing quality gates remain active.

## Verification

Automated checks cover concurrency, isolation, no nested delegation, unique IDs/materials/connections, atomic merge, partial failures, cancellation, default-off/scoped availability, aggregate usage and settings persistence. Tests inject model replies and therefore do not establish real performance or visual quality.

Real comparison must hold prompt, provider/model, starting scene and asset version constant, count all agents, and compare overall wall time and final geometry/material/layout quality. Gateway throttling and additional worker context can increase cost or time. Keep this feature optional until those results justify adoption.
