#!/usr/bin/env python3
"""Render final DOCX files and require one page with all body text visible.

Usage: python3 scripts/check_pages.py output/Resume_Company_Date.docx ...
Requires LibreOffice and either pymupdf (original project dependency) or pypdf.
Set RESUME_SOFFICE to an explicit LibreOffice executable if needed.
Never uses DOCX metadata or word-count estimates as evidence of pagination.
"""
import argparse
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import zipfile
from xml.etree import ElementTree as ET


def renderer():
    explicit = os.environ.get('RESUME_SOFFICE')
    bundled = Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/soffice'
    choices = [explicit] if explicit else [str(bundled), shutil.which('soffice'), shutil.which('libreoffice')]
    for candidate in choices:
        if candidate and Path(candidate).is_file():
            return str(candidate)
    raise RuntimeError('LibreOffice is required to verify one page. Set RESUME_SOFFICE to its executable; no page estimate will be accepted.')


def pdf_text(path):
    try:
        import pymupdf
    except ImportError:
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise RuntimeError('Install pymupdf or pypdf to verify the rendered PDF.') from exc
        doc = PdfReader(path)
        return [p.extract_text() or '' for p in doc.pages]
    with pymupdf.open(path) as doc:
        return [p.get_text() for p in doc]


def normalized(text):
    return re.sub(r'[^\w]', '', text.casefold(), flags=re.UNICODE)


def check(path):
    path = Path(path).resolve()
    if not path.is_file():
        raise RuntimeError(f'File not found: {path}')
    with tempfile.TemporaryDirectory(prefix='resume-page-check-') as tmp:
        root = Path(tmp)
        profile = (root/'profile').as_uri()
        result = subprocess.run(
            [renderer(), f'-env:UserInstallation={profile}', '--headless', '--convert-to', 'pdf',
             '--outdir', str(root), str(path)], capture_output=True, text=True, timeout=60)
        pdf = root/(path.stem+'.pdf')
        if result.returncode or not pdf.is_file():
            raise RuntimeError('PDF rendering failed: '+(result.stderr or result.stdout).strip())
        pages = pdf_text(pdf)
        if len(pages) != 1:
            raise RuntimeError(f'{path.name}: rendered {len(pages)} pages; shorten content or sidebar, then rebuild. Required: exactly 1.')
        rendered = normalized(pages[0])
        with zipfile.ZipFile(path) as z:
            body = ET.fromstring(z.read('word/document.xml'))
        ns = {'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        missing = []
        for p in body.findall('.//w:p', ns):
            text = ''.join(t.text or '' for t in p.findall('.//w:t', ns))
            if normalized(text) and normalized(text) not in rendered:
                missing.append(text[:100])
        if missing:
            raise RuntimeError(f'{path.name}: body/sidebar text may be clipped or missing in the rendered page: '+repr(missing[:4]))
    return 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('documents', nargs='+', type=Path)
    args = parser.parse_args()
    failed = False
    for path in args.documents:
        try:
            check(path)
            print(f'PASS {path.name}: 1 rendered page; all body/sidebar text found')
        except (RuntimeError, subprocess.TimeoutExpired) as exc:
            print(f'FAIL {exc}')
            failed = True
    return int(failed)


if __name__ == '__main__':
    raise SystemExit(main())
