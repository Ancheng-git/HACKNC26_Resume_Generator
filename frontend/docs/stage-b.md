# MineJob · Stage B continuous introduction

Date: 2026-10-10. Historical branch: `codex/minestory-stage-a`; Stage A was preserved.

## Implemented at this stage

- A close opening view of the resting character, retaining Click to start and simple navigation.
- Eyes open, head lifts, character stands and follows authored waypoints with joint animation.
- A fixed camera heading with smooth target/zoom following; no free camera or animation library.
- A guest confirmation sign at the doorway, without registration or account APIs.
- Entry opens the door, then hides roof/front/right walls to reveal the interior after the character crosses the threshold.
- Ordered states prevent duplicate starts or animation loops. Skip stops at the doorway; direct entry immediately reveals the interior.
- Reduced motion pauses ambient animation and completes transitions immediately, including preference changes. Ambient pause does not block user-triggered travel.
- Navigating between scene/forms preserves progress, materials and drafts. Hidden pages pause time; reload clears page memory.

## Verification

Windows Codex in-app browser; desktop approximately 1366×768 and simulated mobile 390×843 CSS viewports. Screenshots trim only browser-generated exterior margins.

Normal start reached the doorway with visible stand/walk/camera animation. Double-clicks and repeated entry actions produced one transition. Skip showed the guest sign; direct entry revealed the interior. Mobile entry and form navigation worked without obstructing the character. A temporary draft survived scene/form navigation and was cleared after checking.

No scene console errors. Reduced-motion states were unit-tested without changing operating-system preferences.

- `node tests/workspace.test.mjs` passed: upload fields/limits/readiness, applications, generation, polling/download URLs and scene round trips.
- `node tests/journey.test.mjs` passed: ordering, route bounds, doorway wait, duplicate guards, skip/direct entry and reduced motion.
- `npm run build` and `git diff --check` passed.

No backend/API changes or real personal uploads/generation occurred. End-to-end validation still required the running backend.

## Screenshots

![Introduction](screenshots/stage-b-intro.jpg)
![Walking](screenshots/stage-b-walking.jpg)
![Doorway](screenshots/stage-b-door.jpg)
![Interior](screenshots/stage-b-interior.jpg)
![Mobile doorway](screenshots/stage-b-mobile-door.jpg)
![Mobile interior](screenshots/stage-b-mobile-interior.jpg)

Free movement, collision, business-model interactions, accounts and persistence were outside this historical stage. Upload/application access remained through existing forms; transparency/instancing optimization remained pending. No push, merge or deployment occurred at that stage.
