"""Local-only HTTP bridge. Run with one Uvicorn worker, without --reload."""
from contextlib import asynccontextmanager
import os
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.datastructures import UploadFile

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .backgrounds import UploadBodyLimit

from .runner import BusyError, Runner


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


def create_app(runner=None):
    runner = runner or Runner()
    origins = [s.strip() for s in os.environ.get('RESUME_FRONTEND_ORIGINS', '').split(',') if s.strip()]
    if '*' in origins or 'null' in origins:
        raise ValueError('Configure explicit frontend origins, not * or null')

    @asynccontextmanager
    async def lifespan(app):
        yield
        await runner.close()

    app = FastAPI(title='Local resume backend', lifespan=lifespan)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=['localhost', '127.0.0.1', '[::1]'])
    app.add_middleware(UploadBodyLimit)
    app.add_middleware(CORSMiddleware, allow_origins=origins,
                       allow_methods=['GET', 'POST'], allow_headers=['Content-Type'])

    @app.middleware('http')
    async def check_origin(request, call_next):
        # CORS alone does not reject cross-origin POST side effects.
        origin = request.headers.get('origin')
        if origin and origin not in origins and origin != str(request.base_url).rstrip('/'):
            return JSONResponse({'detail': 'Origin is not allowed'}, status_code=403)
        return await call_next(request)

    @app.post('/api/backgrounds', status_code=201, openapi_extra={
        'requestBody': {'required': True, 'content': {'multipart/form-data': {'schema': {
            'type': 'object', 'required': ['resume'], 'properties': {
                'resume': {'type': 'string', 'format': 'binary'},
                'background_files': {'type': 'array', 'items': {'type': 'string', 'format': 'binary'}},
                'photo': {'type': 'string', 'format': 'binary'}}}}}}})
    async def upload_background(request: Request):
        if not request.headers.get('content-type', '').lower().startswith('multipart/form-data'):
            raise HTTPException(415, '请使用 multipart/form-data 上传文件。')
        async with request.form(max_files=7, max_fields=3) as form:
            if any(key not in ('resume', 'background_files', 'photo') for key in form):
                raise HTTPException(422, '只接受 resume、background_files 和 photo 字段。')
            resumes, photos = form.getlist('resume'), form.getlist('photo')
            backgrounds = form.getlist('background_files')
            if len(resumes) != 1 or len(photos) > 1:
                raise HTTPException(422, '必须上传一份主简历，头像最多一张。')
            if not all(isinstance(file, UploadFile) for file in resumes + photos + backgrounds):
                raise HTTPException(422, '上传字段必须是文件。')
            return await runner.backgrounds.create(resumes[0], backgrounds, photos[0] if photos else None)

    @app.post('/api/generations', status_code=202)
    async def generate(body: GenerationRequest):
        try:
            return runner.submit(body.company, body.job_description, body.background_id)
        except BusyError:
            raise HTTPException(409, '已有任务运行中，请稍后提交。')

    @app.get('/api/generations/{ident}')
    async def status(ident: str):
        try:
            return runner.public(ident)
        except KeyError:
            raise HTTPException(404, '任务不存在，或服务已重启。')

    @app.get('/api/generations/{ident}/files/{kind}')
    async def download(ident: str, kind: Literal['ats_resume', 'professional_resume', 'professional_cover_letter']):
        try:
            path = runner.download(ident, kind)
        except KeyError:
            raise HTTPException(404, '任务或经过验证的文件不存在。')
        except BusyError:
            raise HTTPException(409, '任务尚未成功，文件不可下载。')
        return FileResponse(path, filename=path.name,
            media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document')

    return app


app = create_app()
