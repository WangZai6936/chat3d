# Large-workspace incremental persistence

The recovered machining-workshop fixture contains 634 nodes and about 15.46 million JSON characters. The previous persistence path read and cloned the entire workspace on every save, including unchanged scene geometry, undo history and other sessions. v55 reduced progress-save frequency but retained this cost.

v56 stores a small revision manifest plus individual session snapshot fields. Progress-only writes preserve geometry/history references and write only changed activity/messages. Geometry edits, checkpoints and the manifest are committed in one IndexedDB transaction. The existing revision guard remains. A failed transaction does not advance the in-memory cache. Legacy workspace data is read and migrated at the next successful atomic save. Database version 2 prevents an older app version from reopening and overwriting the new schema. No credentials are stored and no sessions are deleted.

## Local evidence (2026-10-03)

Node + fake-indexeddb benchmark on one recovered 634-node workshop session, five repeated activity-only saves:
- Prior whole-envelope transaction: 383, 311, 317, 311, 342 ms.
- Incremental transaction: 0.50, 0.46, 0.47, 0.66, 0.34 ms.

This is a persistence microbenchmark, not browser performance, generation speed, model quality or Token consumption. It establishes a removed expensive path, not the sole cause of the observed browser attach/read timeouts.

Regression coverage: old-schema migration, undefined snapshot fields, unchanged geometry omission, joint geometry/checkpoint saves, stale-tab rejection, old-version rejection and rollback on uncloneable data. Existing workspace switching, recovery, backup and checkpoint tests also pass. End-to-end workshop validation remains separate.
