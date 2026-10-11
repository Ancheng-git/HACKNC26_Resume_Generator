# MineJob local backend

FastAPI connects the browser to the existing local Claude Code workflow and document builders. It supports materials uploads, job search, generation status, verified previews and downloads. Use the [root installation guide](../README.md) to install dependencies and start both servers.

Run from the project root with **one Uvicorn worker and no `--reload`**. Claude Code must be installed and signed in under the same system user. The backend uses the existing login rather than a new model API key. Node dependencies, Python document libraries and LibreOffice are required for generation and validation.

On Windows, run the backend in **WSL2 Ubuntu** and install Python, Node.js, LibreOffice and Claude Code inside that distribution. The current runner uses Unix process groups (`os.killpg`) and directory symlinks; native PowerShell/CMD is not a supported backend setup. Follow the [Windows setup and startup instructions](../README.md#windows-prepare-wsl2). WSL2 deployment has not been verified end to end on a Windows machine.

## Configuration

Copy `.env.example` to the root `.env` on a fresh checkout. Existing environment variables take precedence. Do not put secrets in frontend code or commit `.env`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `RESUME_FRONTEND_ORIGINS` | Empty | Comma-separated exact frontend origins, including scheme, host and port; no path or trailing slash. Neither `*` nor `null` is accepted. |
| `RESUME_CLAUDE` | `claude` | Executable name or absolute path, not a shell command with arguments. |
| `RESUME_TIMEOUT_SECONDS` | `1200` | Maximum seconds for authentication, generation and validation together. |
| `RESUME_SOFFICE` | Automatic detection | Optional absolute path to the LibreOffice executable. |
| `JSEARCH_API_KEY` | Empty | Backend-only RapidAPI JSearch key; omit it to use labelled sample jobs. |
| `JSEARCH_REQUEST_LIMIT` | `180` | Local upstream-attempt limit over a rolling 31-day window; `0` disables new requests. |
| `JSEARCH_TIMEOUT_SECONDS` | `20` | Upstream timeout, clamped to 1–60 seconds; no automatic retries. |

Example origins: `http://localhost:5173,http://127.0.0.1:5173`. These are separate origins. The frontend's `API_BASE` defaults to `http://127.0.0.1:8000`.

## Materials upload

`POST /api/backgrounds` accepts `multipart/form-data` and does not call a model.

| Field | Requirements |
| --- | --- |
| `resume` | Exactly one PDF, DOCX or legacy DOC containing the main resume. |
| `background_files` | Optional repeated field, up to five supporting documents in the same formats. |
| `photo` | At most one JPG/PNG personal photo. The current UI requires it. |

Documents are limited to 10 MB each, photos to 5 MB, and the entire request, including multipart boundaries, to 30 MB. PDFs may contain at most 100 pages. The backend rejects unreadable, encrypted or scanned documents without extractable text, oversized decompressed Word files, macro-enabled Word documents and invalid images. Legacy DOC conversion uses LibreOffice with a 60-second timeout. PDF reading order may change; the original is retained and a warning is returned. There is no OCR or invented content.

A successful HTTP 201 response:

```json
{"background_id":"32-character-id","ready_for_generation":true,"warnings":[]}
```

A package without a photo can be stored, but `ready_for_generation` is false and generation is rejected. Errors use 413 for size, 415 for unsupported formats or request type, and 422 for missing or unreadable material. Malformed multipart requests may return 400.

The browser must let FormData set Content-Type and its boundary. Display warnings and use the returned `background_id` only when the package is ready.

## Generation

`POST /api/generations`, with `Content-Type: application/json`:

```json
{
  "company": "Example Company",
  "job_description": "The complete job description",
  "background_id": "32-character-upload-id"
}
```

Company is 1–120 characters; the JD is 1–50,000. Blank values and extra fields are rejected. HTTP 202 returns `{"id":"task-id","status":"queued"}` immediately. An active task returns 409 rather than entering a queue; invalid inputs return 422. Repeated POSTs are separate submissions.

With `background_id`, only that uploaded package supplies personal material. An unknown ID returns 404; a missing photo returns 422. Omitting the field, or using null, retains the legacy workflow using your own `reference/core-resume.docx`, `reference/background-notes.md` and `reference/photo.jpg`. These private inputs are excluded from Git and must be supplied locally for legacy use. Upload mode reuses public schemas without mixing in the project owner's personal material.

`GET /api/generations/{id}` returns `queued`, `running`, `succeeded` or `failed`, and the actual `stage`; it does not estimate a progress percentage. Successful responses include:

- `files`: `ats_resume`, `professional_resume`, `professional_cover_letter`, each with `name`, `url` and `preview_url`.
- `ats`: the checked composite score and must-have coverage.
- `warnings`: any publication warnings.

Failures return a safe `error` and bounded `failure` feedback: `category`, `summary`, `report_available`, `report_summary`, `checks` and `focus_areas`. Runtime failures direct users to authentication, permissions or dependencies rather than inferring skill gaps. ATS feedback uses the actual checked scores and remaining requirements. It adds no model call and does not return raw logs or full personal files.

## Downloads and previews

`GET /api/generations/{id}/files/{kind}` serves a verified DOCX attachment. `GET /api/generations/{id}/previews/{kind}` serves its verified PNG preview. `kind` is one of the three document types above. Only successful tasks may publish files; other states return 409. Missing, changed or out-of-directory files return 404, and invalid types return 422. Use returned URLs rather than filesystem paths.

All three documents must pass rendered single-page and text-integrity checks. The ATS resume must also pass its fixed-format checks and preserve the same selected resume content as the professional version. Keyword targets are composite score >= 80 and must-have coverage >= 90%. Below-threshold publication requires three actual source-grounded review/recheck passes and an honest remaining-gap report; format violations cannot use that exception. Scores and warnings remain visible. Claude's recorded visual review is checked against final hashes and preview artifacts, but it is not an independent guarantee of visual judgment or source truth.

## Noticeboard / JSearch

Subscribe to RapidAPI JSearch and set `JSEARCH_API_KEY` in the backend root `.env` for live jobs. No key is needed for the labelled sample mode.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/jobs/categories` | Local category suggestions; no provider call or invented job counts. |
| `GET /api/jobs?query=software%20engineer&location=Chapel%20Hill%2C%20NC&remote=false&page=1` | One search page, up to 10 jobs. |
| `GET /api/jobs/{id}` | Full plain-text JD from the search cache; no paid detail call. Unknown or expired IDs return 404. |

`query` is required and limited to 300 characters, `location` to 120. `remote=false` includes remote and onsite work; true requests remote-only jobs. Page is an integer from 1 to 3. Invalid input returns 422. More than 30 searches per minute per client IP returns 429 with `Retry-After: 60`; forwarded client IP headers are not trusted. Searches default to the US.

The provider integration uses `/search-v2`, `work_from_home` and cursor pagination. Fetch pages in order with unchanged filters; a missing/expired previous-page cursor returns labelled samples with `reason: "search_previous_page_first"`. It does not silently purchase earlier pages. Each upstream request uses one page.

List responses contain normalized jobs, `page`, `has_more`, `cached`, `degraded`, `reason`, `fetched_at` and `notice`. Live jobs have `source: "JSearch"`; fictional examples have `source: "sample"` and no fake application link. Details add `description`. Missing location, dates, employment type or links stay empty. An actual search with no matches returns an empty list.

Cache and quota counters are stored in ignored `backend/runs/.jsearch-cache.json`. Equivalent normalized searches reuse a 24-hour cache. Categories, cache hits and JD reads do not consume upstream attempts. Failures count toward the local rolling limit; it is not synchronized to a billing date or other projects sharing the key. Provider failure pauses new upstream calls for five minutes. Valid cached results remain readable; there are no automatic retries. Safe error categories and `retry_after` explain the pause without exposing the key or query.

Missing keys, exhausted limits, provider failures and unusable quota storage return HTTP 200 with `degraded: true` and labelled fictional samples from `data/sample_jobs.json`, filtered by the current search. No matching sample returns an empty list. To clear cached results, stop the backend and clear only `entries`, retaining the `calls` quota history. Do not delete the entire cache file to reset the count.

Browsing sends search terms and location to JSearch, not personal materials, and does not call Claude. Selecting a job saves a draft; only explicit Generate submits generation. No application is automatically sent to an employer.

## Lifecycle and local files

Uploads live in ignored `backend/backgrounds/<id>/`; tasks get isolated copies and outputs in ignored `backend/runs/<id>/`. The original CLI still uses `jobs/`, `reference/` and `output/`. The workflow is `.claude/commands/tailor-resume.md`; builders remain in `scripts/`.

Stopping the server terminates active subprocesses. Restarting invalidates in-memory upload/task IDs even though files remain on disk. Upload again and submit a new task. Files can be cleaned up locally after stopping the service. There is no account, database, task recovery, cancel API or concurrent generation.

The backend binds to loopback and validates hosts and origins. It is intended for trusted local use; command restrictions and per-task directories do not create an operating-system sandbox. Claude Code uses the existing account and its normal network access. A browser on another computer cannot access this backend through its own localhost.

## Tests

From the root in macOS, Linux or WSL2 Ubuntu, after installing the normal dependencies and LibreOffice:

```bash
backend/.venv/bin/python -m pip install httpx
backend/.venv/bin/python -B -m unittest backend.test_jobs backend.test_backgrounds backend.test_results scripts.test_workflow -v
```

Tests use synthetic uploads and mocked Claude/provider behavior. They exercise validation, uploads and conversion, task isolation, permission failures, publication checks, previews, feedback and downloads without consuming model quota. Legacy-reference tests also create their own temporary synthetic inputs.
