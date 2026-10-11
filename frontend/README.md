# MineJob frontend

An explorable Three.js island and workshop, built with plain JavaScript. The materials chest opens the upload form, the workbench manages application drafts and results, the noticeboard searches jobs, and the furnace shows generation status. The anvil is decorative. A floor lamp stands between the bed and workbench.

## Development

Use Node.js 18.17 or later. From this directory:

```bash
npm ci
npm run dev
```

Open **http://localhost:5173**. Edit `src/` and refresh the browser; the server has no hot reload. Stop it with Ctrl+C. Follow the [root README](../README.md) to install and run the backend on port 8000.

```bash
node --test tests/*.test.mjs
npm run build
npm run preview
```

Preview serves `dist/` on port 5173, so stop development before starting preview. To change ports on macOS/Linux, use `PORT=5174 npm run dev`; in PowerShell, use `$env:PORT=5174; npm run dev`. Add the matching frontend origin to the backend's `RESUME_FRONTEND_ORIGINS`.

## Scene and audio

WASD and arrows move the character; Shift runs and Ctrl crouches. Click the ground to walk, or an object to approach it. E/Enter interacts with nearby objects, and Esc cancels travel or closes a dialog. The doorway connects the interior and island without clearing materials or drafts.

The upper-right menu controls graphics, reduced motion, view range, screenshots and sound. Background music starts after a user gesture and loops at low volume. Sound controls both music and effects; hidden tabs pause audio. The BGM is the user-supplied Minecraft track in `src/assets/audio/background.mp3`; the interaction effects are original local WAV files.

Skip intro stops at the doorway; direct entry opens the interior immediately. Reduced motion skips automatic travel. `?motion=reduce`, `?quality=low` and `?view=2d` select reduced motion, lower graphics cost and the form fallback. Forms remain accessible when WebGL is unavailable.

## Backend contract

- `src/api.js` defines `API_BASE`, defaulting to `http://127.0.0.1:8000`.
- Save to chest sends multipart `POST /api/backgrounds` with `resume`, up to five repeated `background_files`, and `photo`. The browser supplies the multipart boundary.
- PDF/DOCX/DOC files are limited to 10 MB each; JPG/PNG photos to 5 MB; total file content to 30 MB. The backend enforces request size, parsing and content limits. The UI requires a photo.
- Generate sends `company`, `job_description` and `background_id` to `POST /api/generations`. The materials must be ready and no other task may be active.
- Status polling uses `GET /api/generations/{id}`. Closing a dialog or exploring the island does not stop polling. Successful results expose three real layout previews and DOCX downloads; failures show safe feedback.
- Job search uses `/api/jobs/categories`, `/api/jobs` and `/api/jobs/{id}`. Importing a draft preserves the company, role title and complete JD; only explicit Generate submits a task. The provider key stays in the backend.

Materials, drafts and selected applications live in page memory. Reloading clears them; restarting the backend invalidates upload and task IDs. Uploads and AI generation require the running backend and its local dependencies.

## Main files

| File | Purpose |
| --- | --- |
| `src/index.html` | Page structure, forms and English copy |
| `src/eco-scene.js`, `src/eco-scene.css` | Scene geometry, rendering and overlays |
| `src/room-navigation.js`, `src/journey.js` | Collision, navigation and introduction |
| `src/workshop.js`, `src/workspace.js` | Dialogs, drafts, generation and document results |
| `src/noticeboard.js`, `src/api.js` | Job search and HTTP requests |
| `src/scene-audio.js`, `src/assets/audio/` | Music, interaction effects and mute control |
| `tools/` | Local server, build and dependency preparation |

Dev/build copy pinned Three.js modules and their MIT license into ignored `src/vendor/`. Google Fonts use Arial/monospace fallbacks when offline. Original image assets remain for the form view; the 3D world uses procedural geometry and textures.

## Simulated QA

After a build, `node tests/mock-preview.mjs` starts a separate fixture on port 5175 with a SIMULATED banner. Its synthetic uploads, tasks and downloads do not contact the production backend; a title containing `fail` simulates failure. Fixtures are generated in ignored `tests/.fixtures/`. Simulated checks do not establish real document parsing or AI output quality.

The [contract review](docs/interface-contract-check.md) and [Stage A](docs/stage-a.md), [B](docs/stage-b.md), [C](docs/stage-c.md), [D](docs/stage-d.md), [E](docs/stage-e.md) notes record earlier verification and screenshots; their stated limitations describe those historical stages.
