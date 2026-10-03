# Optional local Blender inspection renderer

This renderer is part of chat3d, not the Blender Agent Studio community plugin. It renders self-contained GLB geometry using the installed Blender executable; it never accepts Python, shell commands, user-selected paths, or external asset URLs.

Status: local testing adapter. It is disabled by default and is not a production-hosting solution. The deployed Sites Worker explicitly reports it unavailable because that runtime cannot launch Blender processes. Community skill integration and permanent execution hosting remain separate work.

## Local run

Install Blender from its official source. Build chat3d normally. On a loopback-only trusted computer, set CHAT3D_BLENDER_ENABLED=1 and optionally BLENDER_EXECUTABLE to its actual executable, then use npm start. Leave HOST at its default 127.0.0.1. The browser discovers /api/blender/status. If WebGL cannot supply an inspection image, it can use this renderer.

Do not expose this local adapter directly to the Internet or forward it through an unauthenticated reverse proxy. Server deployment requires owner-authenticated access, quotas, process/container isolation, and a reviewed network boundary before activation. An Origin check is not authentication.

## Bounds

- 20 MB self-contained GLB input; ordinary geometry and embedded PNG/JPEG only
- At most three distinct requested views and one active Blender process
- 90 second process timeout; disconnect cancels the child process
- Blender factory startup and auto-execution disabled
- Temporary input/output directory owned by the job and removed afterward
- No scene mutation or arbitrary Python from the model
- Pictures are evidence for review, not automatic visual acceptance

The execution adapter does not currently implement Blender modeling modifiers or community skill execution. Those require a separately reviewed and authorized execution interface.
