# Hosted MineJob: one container serves the built frontend and the API on port 8000.
# Claude Code runs inside this container, so it is the isolation boundary for uploaded documents.
FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends libreoffice-writer fonts-liberation fonts-dejavu-core nodejs npm \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g @anthropic-ai/claude-code \
 && useradd --create-home --uid 1000 app

WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY frontend/package.json frontend/package-lock.json frontend/
RUN npm ci --prefix frontend
COPY . .
RUN npm run build --prefix frontend && chown -R app:app /app

USER app
ENV PYTHONUTF8=1 PYTHONDONTWRITEBYTECODE=1
EXPOSE 8000
# Proxy headers keep https:// in request URLs behind the HTTPS reverse proxy, so the origin check passes.
CMD ["python", "-m", "uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--proxy-headers", "--forwarded-allow-ips", "*"]
