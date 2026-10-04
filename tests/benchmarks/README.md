# Complete-scene regression

## Offline replay

Run `npm run test:full-scenes` or the full `npm test` suite.

The pinned compressed fixtures contain historical full machining-workshop, warehouse and assembly-line scenes, rather than toy geometry. `replay-fixtures.json` records each source version, node count and SHA-256 of the original exported project. Fixtures contain geometry/materials only; they contain no model credentials or conversation history.

The replay verifies:
- Import validation and project serialization round-trip without changing node data.
- Every component can be extracted into an editable asset and instantiated with a pinned version, without mutating the source scene.
- The complete scene can produce a software geometry image with bounded resolution fallback.
- Current geometry/occupancy findings remain visible in the report.

Set `REPLAY_REPORT_PATH` to write a JSON report. Results dated 2026-10-03 are included alongside the manifest. Local elapsed times describe replay only, not model generation speed.

## What replay does not prove

A green test does not certify visual quality, human posture, actual collision freedom, PBR materials or functional correctness. The historical fixtures remain unreviewed. The latest replay reported 5, 15 and 8 data/spatial findings respectively; candidates are not automatically confirmed defects.

No model API request is issued by replay. It cannot establish Token savings or the quality of a newly generated scene.

## New-generation comparisons

Use the unchanged prompts in `scenarios.json` and record model, parameters, initial scene hash, rendering environment, application version, wall-clock duration, actual reported usage, interruptions, missing requirements and visual findings. Only compare like-for-like completed runs. Do not score fewer generated objects, an interrupted task, partial draft or unverified quality as a cost improvement. Preserve provider usage omissions and in-flight cancellation limits explicitly.

The 2026-10-03 v62 assembly baseline ended on a rendering-budget error. The v65 attempt ended with only a floor. The v66 recovery used an expanded recovery prompt and was stopped within the agreed time window with unreviewed work remaining. Those three results do not establish a fair performance win.
