# Controlled bending of existing meshes

`bend_existing_mesh` adds a bounded deformation path for continuous meshes that
cannot be articulated by rigid part rotations alone. It requires an evidenced
world-space joint pivot, rotation axis, downstream direction and blend width.
It does not infer a skeleton, fit joints automatically, or certify an action.

The operation rotates existing vertices with smoothstep weights across the
specified joint region. It preserves node IDs, vertex count, triangle indices,
UVs, materials and all other node properties; it recomputes vertex normals.
Explicit downstream nodes undergo the same full rigid rotation. Fixed-side
vertices remain byte-for-byte unchanged. Commands are applied through existing
scope, validation, checkpoint and undo paths. General geometry replacement is
still prohibited during preservation-mode editing: the only exception compares
against geometry derived internally by this bounded deformation function.

Safety checks reject invalid axes, absent fixed/moving/transition regions,
foreign or duplicated follower IDs, overlarge meshes, angles above 90 degrees,
triangle collapse and excessive local edge distortion. These bounds are not a
proof against self-intersection or volume change. Large bends should use proper
skinning and a calibrated rig. Geometry changes invalidate existing rig hashes.

## Verification

Five focused checks cover topology/UV preservation, fixed-side invariance,
downstream motion, invalid calibration and distortion, protection of unrelated
appearance, and the actual modeling-agent tool path with a mocked model.

A disposable copy of a supplied 853-node scene was tested on its original
629-vertex continuous sleeve with a 15-degree bend. Calibration was derived
from the known generated tube ring structure, not assumed for arbitrary meshes.
All indices/UVs and the source project remained unchanged. Rendered before/after
perspective and side geometry images were inspected. This test exercises mesh
continuity and hand following; it is not a completed packing action or contact
acceptance. The actual model service was not called.

Software rasterization preserves triangle geometry and occlusion but lacks PBR,
textures and shadows. Windows/WebGL rendering and native save integration still
need their respective environments. Never report these as verified from a CPU
geometry image or from mocked model tests.
