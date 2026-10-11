# MineJob

MineJob turns job application preparation into an explorable voxel workshop. Upload your resume, photo and supporting experience in the materials chest, browse jobs on the noticeboard, and prepare applications at the workbench. A local Claude Code workflow produces an ATS resume, a professional resume and a cover letter, with layout previews, ATS feedback and DOCX downloads.

The frontend uses Three.js and plain JavaScript; the backend uses FastAPI and the existing document builders. Pixel-style panels and cursors, background music, interaction effects and surface-specific footsteps bring the workshop to life. The upper-right menu also offers screenshots and current-tab recording in supported browsers.

## Choose your setup

| System | Full application | Frontend only |
| --- | --- | --- |
| macOS / Linux | Follow the installation and startup steps below. | Node.js is sufficient. |
| Windows with WSL2 | Run both servers and install all dependencies inside Ubuntu. | You can also use native PowerShell. |
| Native Windows PowerShell / CMD | The current backend is not supported: it uses Unix process groups and directory symlinks. Installing Claude Code for Windows alone does not resolve this. | Supported; see the PowerShell instructions below. |

WSL2 is the recommended Windows route based on the backend's runtime requirements. This release has not been verified end to end on a Windows machine.

## Requirements

Install these in the environment where you will run the backend:

- **Git**, for cloning the repository.
- **Python 3.11+**, including virtual environment support.
- **Node.js and npm**: use a supported [Node.js LTS release](https://nodejs.org/en/download); the frontend minimum is 18.17.
- **LibreOffice**, for DOC conversion, document previews and page-count validation.
- **Claude Code CLI**, installed and signed in as the same system user who runs the backend. Follow the [official setup guide](https://code.claude.com/docs/en/quickstart). Generation uses your Claude Code account and its available usage.

For Windows, complete the WSL2 preparation below first. Installing these tools only on the Windows host does not install them in Ubuntu.

### Windows: prepare WSL2

In **PowerShell as Administrator**, install Ubuntu using Microsoft's [WSL installation guide](https://learn.microsoft.com/en-us/windows/wsl/install):

```powershell
wsl --install -d Ubuntu
```

Restart if prompted, open **Ubuntu**, and create your Linux user. Check the distribution version from PowerShell:

```powershell
wsl --list --verbose
```

Ubuntu should show version **2**. If it shows 1, run `wsl --set-version Ubuntu 2`. Use Ubuntu 24.04 or later for Python 3.11+ without additional Python setup.

Run these commands **inside Ubuntu**:

```bash
sudo apt update
sudo apt install -y git curl python3 python3-venv python3-pip libreoffice fonts-liberation fonts-carlito
```

Install a Linux Node.js LTS release using the [Node.js download instructions](https://nodejs.org/en/download), selecting **Linux**, and install Claude Code using its [Linux/WSL instructions](https://code.claude.com/docs/en/quickstart). Open a new Ubuntu terminal after installation. Keep the checkout under your Linux home directory, such as `~/projects`, and use the same Ubuntu environment for both servers. Do not reuse a Windows virtual environment or Windows `node_modules`.

### Verify dependencies (macOS / Linux / Ubuntu)

```bash
git --version
python3 --version
node --version
npm --version
claude --version
```

Run `claude` once to finish signing in, exit the interactive session, then run `claude auth status`; it must report `loggedIn: true`. LibreOffice's `soffice` or `libreoffice` executable must be on PATH, or configure `RESUME_SOFFICE` as described below.

## Install the project (macOS / Linux / Ubuntu)

Run once from the folder where you keep your projects:

```bash
git clone https://github.com/Ancheng-git/HACKNC26_Resume_Generator.git
cd HACKNC26_Resume_Generator
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
npm ci
npm ci --prefix frontend
cp .env.example .env
```

Both npm installs are required: the root dependencies build Word documents, while the frontend dependencies render the scene. Virtual environment activation is unnecessary because the commands use its Python executable directly. On an existing installation, keep your current `.env` instead of overwriting it.

Edit the root `.env` if needed:

| Setting | When to change it |
| --- | --- |
| `JSEARCH_API_KEY` | Optional RapidAPI JSearch key for live listings. Without it, the noticeboard clearly labels fictional sample jobs. |
| `RESUME_FRONTEND_ORIGINS` | The example already allows `http://localhost:5173` and `http://127.0.0.1:5173`. Update it if you change the frontend port. |
| `RESUME_SOFFICE` | Absolute path to LibreOffice if automatic detection fails. On WSL, use the Linux executable, typically `/usr/bin/libreoffice`. |
| `RESUME_CLAUDE` | Absolute path to the Claude Code executable if `claude` is unavailable on the backend's PATH. |

Keep `.env` private. See [backend configuration](backend/README.md) for all settings.

For example, a standard macOS LibreOffice install can use `RESUME_SOFFICE=/Applications/LibreOffice.app/Contents/MacOS/soffice` in `.env`; Ubuntu can use `RESUME_SOFFICE=/usr/bin/libreoffice`. Set executable paths only, without command arguments.

## Run locally

Open **two terminals** in the cloned project root. On Windows, both must be Ubuntu terminals.

**Terminal 1 — backend:**

```bash
backend/.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --workers 1
```

**Terminal 2 — frontend:**

```bash
npm run dev --prefix frontend
```

Open **http://localhost:5173** in your browser. Backend API documentation is at **http://127.0.0.1:8000/docs**. Windows browsers can normally access WSL servers through [localhost forwarding](https://learn.microsoft.com/en-us/windows/wsl/networking#accessing-linux-networking-apps-from-windows-localhost).

Stop each server with **Ctrl+C**. To restart, run the same commands again. Use one backend worker and omit `--reload`: restarting the backend invalidates upload and task IDs, so upload materials again. Refreshing the frontend clears its drafts. The frontend has no hot reload; refresh after editing source files.

### Windows PowerShell: frontend only

Install [Git for Windows](https://git-scm.com/downloads/win) and [Node.js LTS](https://nodejs.org/en/download), then open a new PowerShell window:

```powershell
git clone https://github.com/Ancheng-git/HACKNC26_Resume_Generator.git
cd HACKNC26_Resume_Generator
npm.cmd ci --prefix frontend
npm.cmd run dev --prefix frontend
```

Open **http://localhost:5173** to explore the interface. `npm.cmd` avoids PowerShell blocking `npm.ps1`. Uploads, job search and AI generation require the backend; follow the WSL2 setup for the complete application.

## Use MineJob

Use **WASD / arrow keys** to move, **Shift** to run, **Ctrl** to crouch, and **E / Enter** to interact. Objects and the ground are also clickable.

1. Open the materials chest and upload a resume (PDF/DOCX/DOC), a personal photo (JPG/PNG), and optional supporting documents. Save the materials.
2. Select a job on the noticeboard or enter a company and complete job description at the workbench.
3. Generate, follow progress at the furnace, then preview and download all three documents at the workbench. Generation may take several minutes.

Music starts after your first interaction. **Sound** in the upper-right menu mutes music and effects. Recording requires a supported browser such as Chrome or Edge: choose the current MineJob tab, optionally share tab audio, then stop recording to download the video. Screens, windows and other tabs are rejected.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Backend is unavailable | Keep Terminal 1 running; confirm `http://127.0.0.1:8000/docs` opens. Run the backend from the project root. |
| Origin is not allowed | Check `.env` origins against the exact frontend URL, including host and port, then restart the backend. |
| Claude is missing or not signed in | Check `claude --version` and `claude auth status` in the backend's environment. Sign in under the same user; on WSL, sign in inside Ubuntu. |
| LibreOffice is missing | Install it in the backend environment or set `RESUME_SOFFICE` to its executable, then restart the backend. |
| A file fails layout validation | Check the task feedback and local rendered files; font availability can change pagination between systems. Install the required fonts and review the generated layout. |
| Port 5173 / 8000 is already in use | Stop the previous server before starting another instance. |
| Materials or tasks disappear | Page refreshes clear frontend drafts; backend restarts invalidate IDs. Upload again. |

## Checks and build

From the project root on macOS / Linux / Ubuntu:

```bash
backend/.venv/bin/python -m pip install httpx
backend/.venv/bin/python -B -m unittest backend.test_jobs backend.test_backgrounds backend.test_results scripts.test_workflow -v
cd frontend
node --test tests/*.test.mjs
npm run build
npm run preview
```

Preview uses port 5173; stop the development server first. Tests use synthetic data and mocked generation without model calls; they do not replace a real generation check on your target machine.

See [backend configuration and API](backend/README.md) and [frontend development](frontend/README.md). Personal reference files, uploads, generated documents, secrets and dependencies are excluded from Git. This version is for local use and has no account system or persistent application history.
