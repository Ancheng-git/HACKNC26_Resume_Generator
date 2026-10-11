"""JSearch bridge. Only search terms go upstream; personal materials stay local."""
import asyncio
from datetime import datetime, timezone
from hashlib import sha256
from html.parser import HTMLParser
from http.client import HTTPException as HTTPClientError
import json
import logging
import math
import os
from pathlib import Path
import re
import ssl
import time
from urllib.parse import urlencode, urlsplit
from urllib.error import HTTPError
from urllib.request import Request, urlopen, build_opener, HTTPSHandler, HTTPRedirectHandler

import certifi

SEARCH_URL = 'https://jsearch.p.rapidapi.com/search-v2'
CACHE_SECONDS = 24 * 60 * 60
QUOTA_SECONDS = 31 * 24 * 60 * 60
RETRY_SECONDS = 5 * 60
MAX_RESPONSE = 20 * 1024 * 1024
MAX_PAGE = 3
RATE_LIMIT = 30
# Inherit the existing server logger so quota info appears with default Uvicorn startup.
LOGGER = logging.getLogger('uvicorn.error.jsearch')
ROOT = Path(__file__).resolve().parent.parent
CATEGORIES = ('Software engineering', 'Data analyst', 'Business analyst', 'Design',
              'Product management', 'Marketing', 'IT support', 'Research', 'Cybersecurity')


class DescriptionText(HTMLParser):
    """Keep paragraph/list boundaries, without executing provider HTML."""
    blocks = {'p', 'div', 'br', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'section'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.ignored = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.ignored += 1
        if not self.ignored and tag in self.blocks:
            self.parts.append('\n' + ('• ' if tag == 'li' else ''))

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.ignored = max(0, self.ignored - 1)
        if not self.ignored and tag in self.blocks:
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.ignored:
            self.parts.append(re.sub(r'\s+', ' ', data))

    def text(self):
        lines = [line.strip() for line in ''.join(self.parts).splitlines()]
        return re.sub(r'(^|\n)•\n', r'\1• ', '\n'.join(line for line in lines if line).strip())


def safe_url(value):
    if not isinstance(value, str) or len(value) > 4000:
        return ''
    try:
        url = urlsplit(value)
        if url.scheme == 'https' and url.hostname and not url.username and not url.password:
            return value
    except ValueError:
        pass
    return ''


def normalize_jobs(payload):
    data = payload.get('data') if isinstance(payload, dict) else None
    if not isinstance(payload, dict) or payload.get('status') != 'OK' or not isinstance(data, dict) or not isinstance(data.get('jobs'), list):
        raise ValueError('Invalid job response')
    jobs = []
    for row in data['jobs'][:10]:
        if not isinstance(row, dict):
            continue
        def text(key):
            return row[key].strip() if isinstance(row.get(key), str) else ''
        if not text('job_id') or not text('job_title') or not text('employer_name'):
            continue
        description = text('job_description')
        if len(description) > 1_000_000:
            continue
        if re.search(r'</?(?:p|div|br|li|ul|ol|h[1-6]|script|style)\b', description, re.I):
            parser = DescriptionText()
            parser.feed(description)
            parser.close()
            description = parser.text()
        jobs.append({'id': 'j-' + sha256(text('job_id').encode()).hexdigest()[:32],
            'title': text('job_title'), 'company': text('employer_name'),
            'location': text('job_location') or ', '.join(filter(None, (text('job_city'), text('job_state'), text('job_country')))),
            'remote': row.get('job_is_remote') is True, 'employmentType': text('job_employment_type'),
            'postedAt': text('job_posted_at_datetime_utc'), 'applyUrl': safe_url(row.get('job_apply_link')),
            'snippet': description[:300], 'source': 'JSearch', 'description': description})
    if data['jobs'] and not jobs:
        raise ValueError('No usable jobs in response')
    return jobs


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Never forward the API key to a redirect destination.


def fetch_jobs(params, key):
    request = Request(SEARCH_URL + '?' + urlencode(params), headers={
        'Accept': 'application/json', 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'})
    opener = build_opener(HTTPSHandler(context=ssl.create_default_context(cafile=certifi.where())), NoRedirect())
    timeout = min(60, max(1, float(os.environ.get('JSEARCH_TIMEOUT_SECONDS', '20'))))
    with opener.open(request, timeout=timeout) as response:
        body = response.read(MAX_RESPONSE + 1)
        headers = dict(response.headers)
    if len(body) > MAX_RESPONSE:
        raise ValueError('Job response too large')
    return json.loads(body), headers


class JobBoard:
    def __init__(self, cache_path=None, fetcher=fetch_jobs, clock=time.time, key=None, limit=None):
        self.cache_path = Path(cache_path) if cache_path else ROOT / 'backend/runs/.jsearch-cache.json'
        self.fetcher, self.clock = fetcher, clock
        self.key = os.environ.get('JSEARCH_API_KEY', '').strip() if key is None else key
        self.limit = int(os.environ.get('JSEARCH_REQUEST_LIMIT', '180')) if limit is None else limit
        if self.limit < 0:
            raise ValueError('JSEARCH_REQUEST_LIMIT must be nonnegative')
        self.entries, self.calls, self.clients = {}, [], {}
        self.loaded = False
        self.state_error = False
        self.retry_at = 0
        self.provider_error = ''
        self.lock = asyncio.Lock()
        self.samples = json.loads((ROOT / 'data/sample_jobs.json').read_text(encoding='utf-8'))

    def allow_request(self, ip):
        now = self.clock()
        self.clients = {host: window for host, window in self.clients.items() if now - window[0] < 60}
        start, count = self.clients.get(ip, (now, 0))
        if count >= RATE_LIMIT:
            return False
        self.clients[ip] = (start, count + 1)
        return True

    def _load(self):
        try:
            data = json.loads(self.cache_path.read_text(encoding='utf-8'))
            calls, entries = data['calls'], data['entries']
            if not isinstance(calls, list) or any(type(t) not in (float, int) or not math.isfinite(t) or t < 0 for t in calls) or not isinstance(entries, dict):
                raise ValueError('Invalid quota state')
            fields = {'id', 'title', 'company', 'location', 'remote', 'employmentType', 'postedAt', 'applyUrl', 'snippet', 'source', 'description'}
            for entry in entries.values():
                if not isinstance(entry, dict) or type(entry.get('time')) not in (int, float) or not math.isfinite(entry['time']) or not isinstance(entry.get('jobs'), list):
                    raise ValueError('Invalid job cache')
                for job in entry['jobs']:
                    if not isinstance(job, dict) or set(job) != fields or type(job['remote']) is not bool or any(not isinstance(v, str) for k, v in job.items() if k != 'remote'):
                        raise ValueError('Invalid cached job')
                    if job['source'] != 'JSearch' or not re.fullmatch(r'j-[a-f0-9]{32}', job['id']):
                        raise ValueError('Invalid cached job ID')
            self.calls = calls
            self.entries = {key: entry for key, entry in entries.items()
                if isinstance(entry, dict) and isinstance(entry.get('jobs'), list)
                and type(entry.get('time')) in (int, float) and isinstance(entry.get('cursor'), (str, type(None)))}
        except FileNotFoundError:
            pass
        except (OSError, ValueError, KeyError, TypeError):
            self.state_error = True  # A broken counter must not silently reset the allowance.

    def _save(self):
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        temp = self.cache_path.with_suffix('.tmp')
        temp.write_text(json.dumps({'calls': self.calls, 'entries': self.entries}), encoding='utf-8')
        temp.replace(self.cache_path)

    @staticmethod
    def _cache_key(query, location, remote, page):
        return sha256(json.dumps([query.casefold(), location.casefold(), remote, page]).encode()).hexdigest()

    def _result(self, jobs, page, has_more, cached=False, reason='', stamp=None):
        return {'jobs': [{k: v for k, v in job.items() if k != 'description'} for job in jobs],
            'page': page, 'has_more': has_more and page < MAX_PAGE, 'cached': cached,
            'degraded': bool(reason), 'reason': reason,
            'fetched_at': datetime.fromtimestamp(stamp, timezone.utc).isoformat() if stamp is not None else None,
            'notice': 'Locally filtered fictional examples only; not live vacancies.' if reason else 'Listings supplied by JSearch. Verify availability and requirements at the source.'}

    def _fallback(self, page, reason, query, location, remote):
        terms = [term for term in re.findall(r'\w+', query.casefold()) if term not in ('in', 'job', 'jobs')]
        terms = ['intern' if term in ('internship', 'internships', 'interns') else term for term in terms]
        places = re.findall(r'\w+', location.casefold())
        matches = [job for job in self.samples
            if (not remote or job['remote'])
            and all(place in re.findall(r'\w+', job['location'].casefold()) for place in places)
            and all(term in ' '.join(job[key] for key in ('title', 'company', 'location', 'employmentType')).casefold() for term in terms)]
        start = (page - 1) * 10
        # Filter first, then paginate. Never substitute unrelated examples to fill the board.
        result = self._result(matches[start:start + 10], page, start + 10 < len(matches), reason=reason)
        if reason == 'provider_unavailable':
            result['provider_error'] = self.provider_error
            result['retry_after'] = max(0, math.ceil(self.retry_at - self.clock()))
        return result

    @staticmethod
    def _log_remaining(headers):
        for name, value in headers.items():
            if name.lower().startswith('x-ratelimit-') and name.lower().endswith('-remaining') and str(value).isdigit():
                LOGGER.info('JSearch %s: %s', name, value)

    async def categories(self):
        return {'categories': [{'id': name, 'name': name} for name in CATEGORIES]}

    async def search(self, query, location='', remote=False, page=1):
        query, location = ' '.join(query.split()), ' '.join(location.split())
        if not query:
            raise ValueError('Query must not be blank')
        page = min(MAX_PAGE, max(1, page))
        cache_key = self._cache_key(query, location, remote, page)
        async with self.lock:
            if not self.loaded:
                await asyncio.to_thread(self._load)
                self.loaded = True
            now = self.clock()
            self.entries = {k: v for k, v in self.entries.items() if 0 <= now - v['time'] < CACHE_SECONDS}
            self.calls = [t for t in self.calls if now - t < QUOTA_SECONDS]
            entry = self.entries.get(cache_key)
            if entry:
                return self._result(entry['jobs'], page, bool(entry['cursor']), cached=True, stamp=entry['time'])
            if not self.key:
                return self._fallback(page, 'missing_key', query, location, remote)
            if self.state_error:
                return self._fallback(page, 'quota_state_unavailable', query, location, remote)
            if len(self.calls) >= self.limit:
                return self._fallback(page, 'quota_exhausted', query, location, remote)
            if now < self.retry_at:
                return self._fallback(page, 'provider_unavailable', query, location, remote)
            params = {'query': query + (f' in {location}' if location else ''),
                'work_from_home': str(remote).lower(), 'num_pages': 1, 'country': 'us'}
            if page > 1:
                previous = self.entries.get(self._cache_key(query, location, remote, page - 1))
                if not previous:
                    return self._fallback(page, 'search_previous_page_first', query, location, remote)
                if not previous['cursor']:
                    return self._result([], page, False)
                params['cursor'] = previous['cursor']
            self.calls.append(now)
            try:
                await asyncio.to_thread(self._save)  # Reserve quota before sending a request, including failures.
            except OSError:
                self.state_error = True
                return self._fallback(page, 'quota_state_unavailable', query, location, remote)
            LOGGER.info('JSearch upstream attempt %d/%d in rolling 31 days', len(self.calls), self.limit)
            try:
                payload, headers = await asyncio.to_thread(self.fetcher, params, self.key)
                self._log_remaining(headers)
                jobs = normalize_jobs(payload)
                cursor = payload['data'].get('cursor')
                if cursor is not None and (not isinstance(cursor, str) or len(cursor) > 10000):
                    raise ValueError('Invalid pagination cursor')
                entry = {'time': now, 'jobs': jobs, 'cursor': cursor}
                self.entries[cache_key] = entry
                await asyncio.to_thread(self._save)
            except (OSError, ValueError, TypeError, HTTPClientError) as exc:
                self._log_remaining(getattr(exc, 'headers', None) or {})
                if isinstance(exc, HTTPError):
                    self.provider_error = f'http_{exc.code}'
                elif isinstance(exc, TimeoutError) or isinstance(getattr(exc, 'reason', None), TimeoutError):
                    self.provider_error = 'timeout'
                elif isinstance(exc, (ValueError, TypeError)):
                    self.provider_error = 'invalid_response'
                else:
                    self.provider_error = 'network_error'
                self.retry_at = self.clock() + RETRY_SECONDS
                LOGGER.warning('JSearch request unavailable (%s); new upstream calls paused for %d seconds', self.provider_error, RETRY_SECONDS)
                return self._fallback(page, 'provider_unavailable', query, location, remote)
            return self._result(jobs, page, bool(cursor), stamp=now)

    async def detail(self, ident):
        async with self.lock:
            if not self.loaded:
                await asyncio.to_thread(self._load)
                self.loaded = True
            for job in self.samples:
                if job['id'] == ident:
                    return {'job': job, 'degraded': True, 'notice': 'Fictional sample posting; not a live vacancy.'}
            for entry in self.entries.values():
                if 0 <= self.clock() - entry['time'] < CACHE_SECONDS:
                    for job in entry['jobs']:
                        if job['id'] == ident:
                            return {'job': job, 'degraded': False}
            raise KeyError(ident)
