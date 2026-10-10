# MineStory

MineStory opens with a real Three.js eco workshop scene: a block island, trees, an original adventurer, a glass cabin, solar panels, a pond and garden beds. Stage B adds a continuous introduction: Click to start, wake and stand, follow the path, enter as a guest, and reveal the cabin interior. Skip goes to the doorway; direct entry opens the interior immediately. Reduced motion skips character and camera travel and defaults ambient motion to paused. There is no frontend framework or database. The frontend connects to FastAPI at http://127.0.0.1:8000; see the integration section below. Selected files, background IDs and applications are held in page memory and cleared on reload.

Stage C makes the interior usable: click the **资料箱** to upload through the existing form, **工作台** for applications and independent drafts, **公告板** for external green career resources, **熔炉** for backend task states, and **铁砧** for the unavailable model settings notice. The same forms open in a native dialog over the scene. Esc or Return to interior closes it and restores object focus. Upload success closes the chest; errors keep the form editable. No account or API Key is collected.

The header's **Your materials** and **Applications** links also retain the original standalone pages. Routes and dialogs share one document and retain drafts and uploaded background IDs. If WebGL or scene loading fails, these ordinary HTML links and forms remain available. Direct fallback: `http://localhost:5173/#profile`.

See [Stage C verification](docs/stage-c.md) for current scope, screenshots and the distinction between simulated QA and real backend integration; [Stage B](docs/stage-b.md) covers the continuous introduction and [Stage A](docs/stage-a.md) records scene asset sources. Free movement and accounts are not implemented.

## Windows setup in Cursor

1. Install [Node.js LTS](https://nodejs.org/) if `node --version` does not work in PowerShell. Node 18.17 or later is required.
2. In Cursor, choose **File → Open Folder** and select this repository's `frontend` folder.
3. Open Cursor's terminal (**Terminal → New Terminal**) and run:

   ```powershell
   npm ci
   npm run dev
   ```

4. Open **http://localhost:5173** in your browser. Press **Ctrl+C** in the terminal to stop the server. Edit files under `src/`; refresh the browser to see changes. The server does not provide hot reload.

`npm ci` installs the pinned Three.js 0.180.0 dependency. Dev and build copy its browser modules and MIT license into ignored `src/vendor/`. No remote CDN is needed at runtime.

## Production build and local preview

```powershell
npm run build
npm run preview
```

The build first prepares local Three.js modules, then copies `src/` into `dist/`. Preview serves the built site at **http://localhost:5173**. Stop the development server before starting preview because both use the same port. To use another port in PowerShell, run `$env:PORT=5174; npm run dev`.

## Project layout

- `src/index.html` — page structure and English copy
- `src/eco-scene.js` — procedural Three.js geometry, physical glass/water, lights and one render loop
- `src/eco-scene.css` — scene overlays and responsive glass controls
- `src/journey.js` — ordered animation states, authored route, skip/direct entry and reduced motion
- `src/workshop.js` — scene dialogs, existing form relocation, focus return and task status panel
- `src/vendor/` — generated local Three.js runtime, ignored by Git
- `src/styles.css` — voxel and Aero styling, responsive layout, motion
- `src/script.js` — local onboarding interactions
- `src/assets/minestory-world.png` — retained only for the original upload page, not the 3D scene
- `src/assets/clouds.png` — drifting cloud overlay
- `src/assets/oak-planks.jpg`, `src/assets/wood-post.png` — wooden sign materials
- `src/assets/chest-closed.png`, `src/assets/chest-open.png` — experience chest states
- `tools/dev-server.mjs` — localhost server using Node's built-in modules
- `tools/build.mjs`, `tools/vendor.mjs` — production copy and local dependency preparation
- `dist/` — generated build output; not the editable source

## ChatGPT/Sites-specific parts

The original checkout has `.openai/hosting.json`, which names the private hosted Site and tells Sites to publish the `dist/` folder. **It is not used for localhost development or a production build**, and the downloadable ZIP omits it to prevent accidentally targeting the hosted Site. No ChatGPT login, Sites account, secret, or external API is needed locally. The local substitute for Sites hosting is the included Node localhost server.

The page loads Google Fonts when online. If offline, it uses local `monospace` and `Arial` fallbacks; all other visual assets are local. Personal documents and photos are sent to the backend when Save to chest is clicked.

## Backend integration

Run the frontend here on port 5173 and the cloned backend on port 8000. Configure the backend CORS allowlist (`RESUME_FRONTEND_ORIGINS`) to include the exact frontend origin, e.g. `http://localhost:5173`. Follow the backend README for its dependencies and generation runtime.

- `src/api.js` defines `API_BASE` (default `http://127.0.0.1:8000`).
- Save to chest sends multipart `POST /api/backgrounds`: `resume`, zero to five repeated `background_files`, and `photo`. No manual Content-Type header is set.
- Documents: PDF/DOCX/DOC, at most 10 MB each; photo: JPG/PNG, at most 5 MB; total file content at most 30 MB. Backend remains authoritative for request limits, PDF page count and readable content.
- Generation requires `ready_for_generation: true` and `background_id`. Upload warnings are shown.
- The combined Title field maps to backend `company`; Description maps to `job_description`. `POST /api/generations` also includes `background_id`. The supplied backend contract does **not** use `title`/`description` as JSON keys.
- Status is polled via `GET /api/generations/{id}` every two seconds after the previous response. Terminal states stop polling. Returned file URLs are used for the three download tabs; inline Word preview is not implemented.
- Backend restart invalidates both background and task IDs. Re-upload personal materials after restart. The frontend has no account or persistent history.

Check the frontend request workflow without running the backend:

```powershell
node tests/workspace.test.mjs
node tests/journey.test.mjs
```

Real upload parsing and AI generation still require end-to-end testing with the backend running.

For explicitly simulated browser QA, build and run `node tests/mock-preview.mjs`, then open `http://localhost:5175`. This separate local fixture serves a copy with a SIMULATED banner and stub upload/task/download responses; it never changes the production API base or contacts port 8000. It creates non-personal test files in ignored `tests/.fixtures/`. A title containing `fail` produces a simulated failure. Stop this fixture when done.

## Stage D

Indoor WASD / arrow movement, collision, click-to-approach interaction and following camera are implemented on the existing scene. See [Stage D browser QA and performance conditions](docs/stage-d.md). Scene options apply without reloading. Run `node --test tests/*.test.mjs` and `npm run build` from `frontend/`.

## English UI and island exploration

The current scene has English controls and frontend translations of backend errors, a shorter opening walk at the original speed, and two-way doorway travel. WASD, arrow keys and ground clicks work on the existing island, with shoreline, water, tree and building collision. Forms pause movement; closing restores focus and clears held keys. Materials, drafts and task polling survive doorway travel while the page stays open. See [browser verification and remaining limits](docs/stage-e.md).
