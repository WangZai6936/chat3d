# Library and execution usability update

2026-10-07. Publication remains paused by the user.

## Changes
- Two-level category sidebar with aggregate parent counts, cross-category name/description/path search, and catalog-only atomic multi-asset category moves. New projects inherit the selected category. Existing IDs and immutable model versions remain unchanged.
- Scene categories use a separate IndexedDB store (database version 4). Existing encountered scene category names keep legacy display labels. Category selectors display parent/child paths across library, save and workbench asset selection. Save dialogs support creating a child category and selecting it immediately.
- Category backups preserve hierarchy and separate scene classifications; malformed trees are rejected. Concurrent stale asset moves abort without partial writes.
- Running chat shows a square stop control. Sending text queues it above the input; queued messages support direct removal, undo and steering. Separate keyed action buttons prevent a rapid second send click from accidentally stopping the run after the first clears the input. Queued text remains after cancellation.
- Import/export menu uses concise action labels and separators; detailed format caveats remain in tooltips.
- Diagnostics and workspace backups use a fixed-purpose native JSON save command on desktop, writing unique files under Downloads/Chat3D without overwriting existing files. Browser downloads attach their link to the document and report initiation, not confirmed saving. Diagnostics retain allowlisted metadata only, with an expandable copyable fallback and explicit errors. Workspace backup may contain sensitive user-written conversation text and is not represented as a sanitized conversation export.

## Verification boundaries
899 regression checks, TypeScript and frontend/server builds passed before the final legacy scene-label compatibility adjustment. That adjustment adds a case within the category suite; final full verification is recorded below after completion. Model calls and native bridge behavior in tests are mocked. The current environment has no Cargo executable, so the native Rust command and real Windows file saving remain uncompiled/unverified here. No real browser screenshot or Windows UI acceptance, actual local conversation inspection, push or deployment is claimed.

Final check: all 899 regression checks and TypeScript/frontend/server builds completed with exit 0 against the final scene-label-compatible code. Native Rust/Windows verification remains pending as above.
