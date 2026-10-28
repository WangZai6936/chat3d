# Large-workspace incremental persistence

The recovered machining-workshop fixture contains 634 nodes and about 15.46 million JSON characters. The previous persistence path read and cloned the entire workspace on every save, including unchanged scene geometry, undo history and other sessions. v55 reduced progress-save frequency but retained this cost.

v56 stores a small revision manifest plus individual session snapshot fields. Progress-only writes preserve geometry/history references and write only changed activity/messages. Geometry edits, checkpoints and the manifest are committed in one IndexedDB transaction. Undo stacks (`past`/`future`) stay in memory for the open tab only; durable storage matches portable backups and omits them so large industrial scenes do not duplicate up to 64MB of history in IndexedDB. When quota is exceeded, saves retry without reference images and then without recycle-bin payloads before surfacing a blocking error. The existing revision guard remains. A failed transaction does not advance the in-memory cache. Legacy workspace data is read and migrated at the next successful atomic save. Database version 2 prevents an older app version from reopening and overwriting the new schema. No credentials are stored and no sessions are deleted.

Each successful save now scans only record keys and removes session fields absent from the new manifest, including orphans left by earlier versions. Reclamation shares the manifest/field write transaction and revision guard: an abort restores both the old records and manifest, and does not advance the identity cache. Soft-deleted sessions still listed in the manifest remain fully restorable; this is not a permanent-delete operation on the recycle bin.

## Local evidence (2026-10-03)

Node + fake-indexeddb benchmark on one recovered 634-node workshop session, five repeated activity-only saves:
- Prior whole-envelope transaction: 383, 311, 317, 311, 342 ms.
- Incremental transaction: 0.50, 0.46, 0.47, 0.66, 0.34 ms.

This is a persistence microbenchmark, not browser performance, generation speed, model quality or Token consumption. It establishes a removed expensive path, not the sole cause of the observed browser attach/read timeouts.

Regression coverage: old-schema migration, undefined snapshot fields, unchanged geometry omission, joint geometry/checkpoint saves, session/field and historical-orphan reclamation, recycle-bin preservation, stale-tab rejection, old-version rejection, rollback after reclamation, and retrying unchanged object identities after an aborted transaction. Browser rendering and model generation quality remain separate from these IndexedDB checks.
