# MineJob

MineJob turns resume preparation into an explorable voxel workshop. Upload your resume, photo and supporting experience in the materials chest, browse jobs on the noticeboard, and prepare applications at the workbench. The local Claude Code workflow produces an ATS resume, a professional resume and a cover letter, with validation, previews and DOCX downloads.

The frontend uses Three.js and plain JavaScript. The backend uses FastAPI, Claude Code and the existing document builders. The scene includes keyboard movement, object interactions, background music and sound effects.

## Install

Install **Python 3.11+**, **Node.js 18.17+**, **LibreOffice** and **Claude Code**. Claude Code must be signed in under the same system user that runs the backend; check with `claude auth status`. LibreOffice's `soffice` or `libreoffice` executable must be available, or set `RESUME_SOFFICE` to its absolute path.

From a macOS or Linux terminal:

```bash
git clone https://github.com/Ancheng-git/HACKNC26_Resume_Generator.git
cd HACKNC26_Resume_Generator
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
npm ci
npm ci --prefix frontend
cp .env.example .env
```

On Windows, create the environment with `py -3 -m venv backend/.venv` and use `backend\.venv\Scripts\python.exe` in place of `backend/.venv/bin/python`.

JSearch is optional: add a RapidAPI JSearch key to `JSEARCH_API_KEY` in the root `.env` for live job listings. Without a key, the noticeboard uses clearly labelled fictional sample jobs. Keep `.env` private.

## Run locally

Start the backend from the project root:

```bash
backend/.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --workers 1
```

In a second terminal opened at the project root, start the frontend:

```bash
cd frontend
npm run dev
```

Open **http://localhost:5173**. API documentation is at **http://127.0.0.1:8000/docs**. Stop either server with **Ctrl+C**. Keep one backend worker and do not use `--reload`: uploads and task IDs are held in memory and become invalid after a backend restart. Frontend drafts are cleared when the page reloads.

Use **WASD / arrow keys** to move, **Shift** to run, **Ctrl** to crouch, and **E / Enter** to interact. Objects and the ground are also clickable. Music starts after your first interaction; **Sound** in the upper-right menu mutes music and effects.

## Checks and build

```bash
backend/.venv/bin/python -m pip install httpx
backend/.venv/bin/python -B -m unittest backend.test_jobs backend.test_backgrounds backend.test_results scripts.test_workflow -v
cd frontend
node --test tests/*.test.mjs
npm run build
```

`npm run preview` serves the frontend build on port 5173; stop the development server first. Tests use synthetic data and mocked generation, without model calls.

See [backend configuration and API](backend/README.md) and [frontend development](frontend/README.md). Personal reference files, uploads, generated documents, secrets and dependency folders are excluded from Git. This version runs on your own computer and has no account system or persistent task history.
