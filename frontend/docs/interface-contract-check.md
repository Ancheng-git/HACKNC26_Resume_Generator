# Frontend API contract review

2026-10-10. Historical review against the supplied `background-upload-integration-zh.md` and `first_3_interfaces.txt`. The requested scope was the frontend request contract, without real backend integration.

## Findings

- `API_BASE` is centralized in `src/api.js`, defaulting to `http://127.0.0.1:8000`.
- Upload: multipart `POST /api/backgrounds` uses `resume`, up to five repeated `background_files`, and `photo`, with no manual Content-Type. HTTP 201 stores `background_id`; generation requires `ready_for_generation`, and warnings are shown. The backend can save a package without a photo, while the UI requires one.
- Generate: `POST /api/generations` sends `company`, `job_description` and `background_id`. The upload extension adds the last field to the earlier two-field contract. Title/JD limits are 120/50,000. HTTP 202 means accepted; use the returned ID and do not automatically resubmit.
- Status: query immediately, then approximately two seconds after each response. Stop at terminal states. Closing or switching panels preserves task polling. Page exit cleans timers and abort signals; stale responses cannot overwrite newer tasks. Unavailable status can be retried without another generation POST.
- Download: use each returned `files[type].url` on the backend origin. Check response.ok before Blob download; retain the returned name, separate type-specific feedback and retries, and release object URLs. Failed tasks have no downloads.
- Display real ATS scores and warnings. A successful low-score response remains successful. Render messages and user content as text, without fabricated progress.

## Changes verified

`src/index.html` and `src/workspace.js` corrected the title limit from 280 to 120, added the 50,000-character JD limit, returned ATS feedback, submission locking, polling abort/cleanup and stale-response protection.

`src/api.js` and `src/workspace.js` added download response checks, original filenames, feedback and URL cleanup while retaining all three download types. Materials and API paths/field names were unchanged.

`tests/workspace.test.mjs` checks length limits, low-score success, warnings, download success/404/409, filename/URL cleanup, request 409/422, status 404 and stale responses, alongside uploads, independent drafts, scene dialogs and polling.

## Verification scope

`node --test tests/*.test.mjs` and `npm run build` passed with mocked DOM/fetch. No model was called. Port 8000 was not running during that historical review; this did not establish real upload parsing or AI generation.

Start the frontend from `frontend/` with `npm run dev`. Real integration needs the backend allowlist to contain the exact frontend origin; localhost and 127.0.0.1 are different origins.
