# MineStory

MineStory is a static, interactive landing page. Its source is in `src/`: HTML, CSS, JavaScript, and the voxel world image. There is no frontend framework, database, or build dependency. The frontend connects to FastAPI at http://127.0.0.1:8000; see the integration section below. Selected files, background IDs and applications are held in page memory and cleared on reload.

## Windows setup in Cursor

1. Install [Node.js LTS](https://nodejs.org/) if `node --version` does not work in PowerShell. Node 18.17 or later is required.
2. In Cursor, choose **File → Open Folder** and select the `minestory` folder.
3. Open Cursor's terminal (**Terminal → New Terminal**) and run:

   ```powershell
   npm ci
   npm run dev
   ```

4. Open **http://localhost:5173** in your browser. Press **Ctrl+C** in the terminal to stop the server. Edit files under `src/`; refresh the browser to see changes. The server does not provide hot reload.

`npm ci` installs no third-party packages; it verifies the included lockfile and prepares the standard npm workflow.

## Production build and local preview

```powershell
npm run build
npm run preview
```

The build copies `src/` into `dist/`. Preview opens the built site at **http://localhost:5173**. Stop the development server before starting preview because both use the same port. To use another port in PowerShell, run `$env:PORT=5174; npm run dev`.

## Project layout

- `src/index.html` — page structure and English copy
- `src/styles.css` — voxel and Aero styling, responsive layout, motion
- `src/script.js` — local onboarding interactions
- `src/assets/minestory-world.png` — generated hero landscape with MineStory letters and adventurer
- `src/assets/clouds.png` — drifting cloud overlay
- `src/assets/oak-planks.jpg`, `src/assets/wood-post.png` — wooden sign materials
- `src/assets/chest-closed.png`, `src/assets/chest-open.png` — experience chest states
- `tools/dev-server.mjs` — localhost server using Node's built-in modules
- `tools/build.mjs` — dependency-free production copy
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
```

Real upload parsing and AI generation still require end-to-end testing with the backend running.
