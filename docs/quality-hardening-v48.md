# Quality hardening, 2026-10-03

Scope: proceed with quality, review/repair, materials/contact and efficiency. Community plugin installation and persistent Blender modeling service remain excluded by the user.

## Implemented

- Reopen six-criterion detail checks after changes to geometry, placement, scale, visibility, part removal, surface maps or contact declarations. Moving a contact target also reopens the source object's check. Pure rename and simple recolour retain the lightweight existing visual-review policy.
- Validate declared anchor points against actual transformed mesh triangles with a bounded budget. Off-surface anchors and separated connections cannot be certified as passing; budget exhaustion reports unknown. This does not solve whole-mesh collision, pose or engineering correctness.
- Atomically apply up to 32 explicit surface edits, with an optional explicit projection for missing UVs. Existing UVs are preserved. One invalid operation rolls back the batch.
- Add box projection and UV-degeneracy diagnostics. A materially collapsed textured UV layout cannot pass the material criterion. Basic projections can still have visible seams or distortion.
- Repair loft UV seam duplication and cap mapping; preserve smooth side normals and independent cap normals.
- Prepare missing UVs in supplied worker meshes and two VMC parts. Repair the four worker assets' visible trouser/boot gaps. Existing user-created scenes are not silently replaced.
- Actual offline multiview review found a blank generic VMC rear panel. Added functional service doors, gaskets, hinges, latches, louvers and screws. These are generic design details, not an asserted manufacturer's construction.
- Avoid repeating full previous detail reports in each audit response. Material surface signatures are computed once per material, and component lookup no longer repeats a full scene scan per part.

## Verification types

- Automated agent-loop test: failed detail check -> repair -> reject stale evidence -> capture fresh front/back images -> next-turn review. It uses injected model responses and capture results, so it validates control flow, not perception.
- Actual Blender renders: VMC, production worker and a non-industrial curved table-lamp fixture, from application-exported GLBs. Front/rear or front/side inspected. These fixtures are deterministic and are NOT live AI-generation quality benchmarks.
- Physical findings: worker ankle gap and blank VMC service panel found and repaired; fresh images checked after repair.
- Remaining visual limitations: workers are still simplified/stylised; smooth posture and likeness are not validated. UV presence is not proof of good texel density or seam placement. Render lighting/noise differs from the live browser.
- No new provider speed claim. New batching/context reductions need additional controlled live runs before quoting savings.
- No community plugin installation, new Blender service or changes to the public runtime boundary.

## Acceptance boundary

Tests and assets establish working capabilities and specific repairs. They do not certify arbitrary future scenes or models as high quality. Every newly generated or structurally edited result still requires its own real visual evidence, and model self-review remains separate from user acceptance.
