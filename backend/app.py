"""Local-only HTTP bridge. Run with one Uvicorn worker, without --reload."""
import asyncio
from contextlib import asynccontextmanager
import json
import os
from pathlib import Path as PathFile
from typing import Literal
from urllib.parse import quote

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Query, Path
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.datastructures import UploadFile

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .backgrounds import UploadBodyLimit

from .db import Database
from .runner import BusyError, Runner
from dotenv import load_dotenv

from .jobs import JobBoard


class GenerationRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    company: str = Field(min_length=1, max_length=120)
    job_description: str = Field(min_length=1, max_length=50000)

    background_id: str | None = Field(default=None, pattern=r'^[a-f0-9]{32}$')

    @field_validator('company', 'job_description')
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError('must not be blank')
        return value


class Credentials(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    email: str = Field(max_length=254, pattern=r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
    password: str = Field(min_length=8, max_length=128)


DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
Kind = Literal['ats_resume', 'professional_resume', 'professional_cover_letter']


def create_app(runner=None, jobs=None, db=None):
    load_dotenv(PathFile(__file__).resolve().parent.parent / '.env', override=False)
    runner = runner or Runner()
    if db is None and os.environ.get('DATABASE_URL'):
        db = Database(os.environ['DATABASE_URL'])
    daily_limit = int(os.environ.get('RESUME_DAILY_LIMIT', '3'))
    hosts = [s.strip() for s in os.environ.get('RESUME_ALLOWED_HOSTS', 'localhost,127.0.0.1,[::1]').split(',') if s.strip()]
    jobs = jobs or JobBoard()
    origins = [s.strip() for s in os.environ.get('RESUME_FRONTEND_ORIGINS', '').split(',') if s.strip()]
    if '*' in origins or 'null' in origins:
        raise ValueError('Configure explicit frontend origins, not * or null')

    @asynccontextmanager
    async def lifespan(app):
        if db:
            await asyncio.to_thread(db.init)
        yield
        await runner.close()

    app = FastAPI(title='Local resume backend', lifespan=lifespan)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=hosts)
    app.add_middleware(UploadBodyLimit)
    app.add_middleware(CORSMiddleware, allow_origins=origins,
                       allow_methods=['GET', 'POST', 'PUT'], allow_headers=['Content-Type', 'Authorization'])

    @app.middleware('http')
    async def check_origin(request, call_next):
        # CORS alone does not reject cross-origin POST side effects.
        origin = request.headers.get('origin')
        if origin and origin not in origins and origin != str(request.base_url).rstrip('/'):
            return JSONResponse({'detail': 'Origin is not allowed'}, status_code=403)
        return await call_next(request)

    @app.get('/api/jobs/categories')
    async def job_categories():
        return await jobs.categories()

    @app.get('/api/jobs')
    async def search_jobs(request: Request, query: str = Query(..., min_length=1, max_length=300),
                          location: str = Query('', max_length=120),
                          remote: bool = Query(False), page: int = Query(1)):
        if not query.strip():
            raise HTTPException(422, 'Query must not be blank')
        if not jobs.allow_request(request.client.host if request.client else 'local'):
            raise HTTPException(429, 'Too many job searches. Try again in one minute.', headers={'Retry-After': '60'})
        return await jobs.search(query, location, remote, page)

    @app.get('/api/jobs/{ident}')
    async def job_detail(ident: str = Path(pattern=r'^(?:j-[a-f0-9]{32}|sample-[0-9]{2})$')):
        try:
            return await jobs.detail(ident)
        except KeyError:
            raise HTTPException(404, 'Job is unavailable. Refresh the noticeboard or check the source site.')

    @app.post('/api/backgrounds', status_code=201, openapi_extra={
        'requestBody': {'required': True, 'content': {'multipart/form-data': {'schema': {
            'type': 'object', 'required': ['resume'], 'properties': {
                'resume': {'type': 'string', 'format': 'binary'},
                'background_files': {'type': 'array', 'items': {'type': 'string', 'format': 'binary'}},
                'photo': {'type': 'string', 'format': 'binary'}}}}}}})
    async def upload_background(request: Request):
        if not request.headers.get('content-type', '').lower().startswith('multipart/form-data'):
            raise HTTPException(415, 'Upload files using multipart/form-data.')
        async with request.form(max_files=7, max_fields=3) as form:
            if any(key not in ('resume', 'background_files', 'photo') for key in form):
                raise HTTPException(422, 'Only the resume, background_files and photo upload fields are accepted.')
            resumes, photos = form.getlist('resume'), form.getlist('photo')
            backgrounds = form.getlist('background_files')
            if len(resumes) != 1 or len(photos) > 1:
                raise HTTPException(422, 'Upload exactly one resume and at most one personal photo.')
            if not all(isinstance(file, UploadFile) for file in resumes + photos + backgrounds):
                raise HTTPException(422, 'Upload fields must contain files.')
            return await runner.backgrounds.create(resumes[0], backgrounds, photos[0] if photos else None)

    def user_for(authorization):
        token = authorization[7:] if authorization and authorization.startswith('Bearer ') else None
        user_id = db.user_for(token) if db and token else None
        if user_id is None:
            raise HTTPException(401, 'Sign in first.')
        return user_id

    def current_user(authorization: str | None = Header(default=None)):
        if db is None:
            raise HTTPException(503, 'Accounts are not configured on this server.')
        return user_for(authorization)

    async def save_task(task):
        if task.get('user_id') is not None:
            await asyncio.to_thread(db.finish_resume, task)

    runner.on_done = save_task if db else None

    @app.post('/api/auth/register', status_code=201)
    def register(body: Credentials):
        if db is None:
            raise HTTPException(503, 'Accounts are not configured on this server.')
        token = db.register(body.email.lower(), body.password)
        if token is None:
            raise HTTPException(409, 'This email is already registered.')
        return {'token': token}

    @app.post('/api/auth/login')
    def login(body: Credentials):
        if db is None:
            raise HTTPException(503, 'Accounts are not configured on this server.')
        token = db.login(body.email.lower(), body.password)
        if token is None:
            raise HTTPException(401, 'Incorrect email or password.')
        return {'token': token}

    @app.post('/api/auth/logout', status_code=204)
    def logout(user_id=Depends(current_user), authorization: str | None = Header(default=None)):
        db.logout(authorization[7:])

    @app.get('/api/me')
    def me(user_id=Depends(current_user)):
        email, profile = db.me(user_id)
        return {'email': email, 'profile': profile, 'daily_limit': daily_limit,
                'used_today': db.recent_count(user_id)}

    @app.put('/api/profile')
    def save_profile(profile: dict, user_id=Depends(current_user)):
        if len(json.dumps(profile)) > 100_000:
            raise HTTPException(413, 'The profile must not exceed 100 KB.')
        db.save_profile(user_id, profile)
        return {'profile': profile}

    @app.get('/api/resumes')
    def resumes(user_id=Depends(current_user)):
        return db.resumes(user_id)

    @app.get('/api/resumes/{ident}/files/{kind}')
    def resume_file(ident: str, kind: Kind, user_id=Depends(current_user)):
        row = db.resume_file(user_id, ident, kind)
        if row is None:
            raise HTTPException(404, 'The file is unavailable.')
        return Response(row[1], media_type=DOCX,
            headers={'Content-Disposition': f"attachment; filename*=UTF-8''{quote(row[0])}"})

    @app.post('/api/generations', status_code=202)
    async def generate(body: GenerationRequest, authorization: str | None = Header(default=None)):
        # With a database (hosted mode), generation needs an account and is rate-limited per user.
        user_id = await asyncio.to_thread(user_for, authorization) if db else None
        if db and body.background_id is None:
            # Without a pack the runner falls back to the server owner's own reference/ files.
            raise HTTPException(422, 'Upload your resume and photo before generating.')
        if user_id is not None and await asyncio.to_thread(db.recent_count, user_id) >= daily_limit:
            raise HTTPException(429, f'You have used all {daily_limit} generations for the last 24 hours.')
        try:
            result = runner.submit(body.company, body.job_description, body.background_id, user_id)
        except BusyError:
            raise HTTPException(409, 'The generation queue is full. Try submitting again later.')
        if user_id is not None:
            await asyncio.to_thread(db.start_resume, result['id'], user_id, body.company)
        return result

    @app.get('/api/generations/{ident}')
    async def status(ident: str):
        try:
            return runner.public(ident)
        except KeyError:
            raise HTTPException(404, 'The task is unavailable or the backend restarted.')

    @app.get('/api/generations/{ident}/files/{kind}')
    async def download(ident: str, kind: Literal['ats_resume', 'professional_resume', 'professional_cover_letter']):
        try:
            path = runner.download(ident, kind)
        except KeyError:
            raise HTTPException(404, 'The task or validated file is unavailable.')
        except BusyError:
            raise HTTPException(409, 'The task has not completed successfully. Files are not available for download.')
        return FileResponse(path, filename=path.name,
            media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document')

    @app.get('/api/generations/{ident}/previews/{kind}')
    async def preview(ident: str, kind: Literal['ats_resume', 'professional_resume', 'professional_cover_letter']):
        try:
            path = runner.preview(ident, kind)
        except KeyError:
            raise HTTPException(404, 'Verified task preview is unavailable.')
        except BusyError:
            raise HTTPException(409, 'Only successful tasks have published previews.')
        return FileResponse(path, media_type='image/png', headers={'Cache-Control': 'no-store'})

    site = PathFile(__file__).resolve().parent.parent / 'frontend/dist'
    if site.is_dir():  # Hosted mode: one origin serves the built frontend and the API.
        app.mount('/', StaticFiles(directory=site, html=True), name='site')
    return app


app = create_app()
