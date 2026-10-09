# Shared thumbnail framing

2026-10-07

User screenshots showed 4:3 images letterboxed in 1.9:1 home cards and slightly mismatched library frames. Added a final shared thumbnail stylesheet so home, library, scene/draft cards and detail previews use the renderer's 4:3 aspect ratio. Compact list images use 112×84. Cover and centered alignment fill the image area; featured-choice image padding is removed. The live modeling viewport is unaffected. Non-4:3 legacy images may be cropped to fill rather than letterboxed. Images already containing baked-in borders are not rewritten.

Verification: four focused DOM/CSS checks, 889 full regression PASS results, TypeScript, frontend and server builds all completed successfully. No real browser screenshot, Windows visual acceptance, or publication is claimed. Changes remain local while the user's publication pause remains in effect.
