"""Offline JSearch API/cache tests. No live upstream or model calls."""
import asyncio
import json
from http.client import IncompleteRead
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, MagicMock
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlsplit

import httpx

from backend.app import create_app
from backend.jobs import (CACHE_SECONDS, QUOTA_SECONDS, RETRY_SECONDS, RATE_LIMIT,
                          JobBoard, normalize_jobs, fetch_jobs, NoRedirect)


def feed(cursor='next-page'):
    return {'status': 'OK', 'data': {'cursor': cursor, 'jobs': [
        {'job_id': 'opaque/job==', 'job_title': 'Data Analyst', 'employer_name': 'Example Company',
         'job_description': '<h2>About the role</h2><p>SQL &amp; Python</p><ul><li>Build dashboards</li><li>Review metrics</li></ul><script>alert(1)</script>',
         'job_location': 'Chapel Hill, NC', 'job_is_remote': True,
         'job_apply_link': 'https://careers.example.com/jobs/1', 'job_employment_type': 'Intern',
         'job_posted_at_datetime_utc': '2026-10-09T10:00:00Z'},
        {'job_id': 'two', 'job_title': 'Designer', 'employer_name': 'Example Studio',
         'job_description': 'First paragraph.\n\nSecond paragraph.', 'job_is_remote': False,
         'job_apply_link': 'javascript:alert(1)'}]}}


class NoModelRunner:
    async def close(self):
        pass

    async def submit(self, *args):
        raise AssertionError('Browsing must never generate documents')


class JobTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.cache = Path(self.temp.name) / 'cache.json'
        self.now = 1_800_000_000
        self.calls = []
        self.upstream_error = None
        def fetcher(params, key):
            self.calls.append((params.copy(), key))
            if self.upstream_error:
                raise self.upstream_error
            return feed(), {'X-RateLimit-Requests-Remaining': '199'}
        self.fetcher = fetcher
        self.board = JobBoard(self.cache, fetcher, lambda: self.now, key='test-only-placeholder', limit=180)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app(NoModelRunner(), self.board)), base_url='http://127.0.0.1:8000')

    async def asyncTearDown(self):
        await self.client.aclose()
        self.temp.cleanup()

    async def test_contract_normalization_full_jd_without_second_call(self):
        self.assertTrue((await self.client.get('/api/jobs/categories')).json()['categories'])
        self.assertEqual(len(self.calls), 0, 'Category choices are local, no API credits')
        response = await self.client.get('/api/jobs', params={'query': 'data analyst', 'location': 'Chapel Hill, NC', 'remote': 'true', 'unknown': 'ignored'})
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertFalse(result['degraded'])
        job = result['jobs'][0]
        self.assertEqual(set(job), {'id', 'title', 'company', 'location', 'remote', 'employmentType', 'postedAt', 'applyUrl', 'snippet', 'source'})
        self.assertTrue(job['remote'])
        detail = (await self.client.get('/api/jobs/' + job['id'])).json()['job']
        self.assertIn('SQL & Python', detail['description'])
        self.assertIn('\n• Build dashboards\n• Review metrics', detail['description'])
        self.assertNotIn('alert', detail['description'])
        self.assertEqual(self.calls[0][0], {'query': 'data analyst in Chapel Hill, NC', 'work_from_home': 'true', 'num_pages': 1, 'country': 'us'})
        self.assertEqual(len(self.calls), 1)
        self.assertNotIn('test-only-placeholder', json.dumps(result))
        self.assertNotIn('test-only-placeholder', self.cache.read_text())

    async def test_cache_hit_miss_24h_restart_and_concurrent_requests(self):
        await asyncio.gather(*(self.board.search('  Data   Analyst ', ' Chapel   Hill ') for _ in range(8)))
        self.assertEqual(len(self.calls), 1)
        self.assertTrue((await self.board.search('data analyst', 'chapel hill'))['cached'])
        restarted = JobBoard(self.cache, self.fetcher, lambda: self.now, key='test', limit=180)
        self.assertTrue((await restarted.search('data analyst', 'chapel hill'))['cached'])
        self.assertEqual(len(self.calls), 1)
        await restarted.search('designer')
        self.assertEqual(len(self.calls), 2)
        self.now += CACHE_SECONDS
        self.assertFalse((await restarted.search('data analyst', 'chapel hill'))['cached'])
        self.assertEqual(len(self.calls), 3)

    async def test_cursor_pagination_only_one_call_per_page(self):
        await self.board.search('analyst')
        result = await self.board.search('analyst', page=2)
        self.assertEqual(result['page'], 2)
        self.assertEqual(self.calls[-1][0]['cursor'], 'next-page')
        await self.board.search('analyst', page=999)
        self.assertEqual(len(self.calls), 3)
        await self.board.search('analyst', page=0)
        self.assertEqual(len(self.calls), 3)
        result = await self.board.search('different query', page=2)
        self.assertEqual(result['reason'], 'search_previous_page_first')
        self.assertEqual(len(self.calls), 3, 'Never fetch hidden earlier pages to spend extra credits')

    async def test_quota_limit_persisted_and_cached_data_still_served(self):
        self.board.limit = 1
        await self.board.search('analyst')
        restarted = JobBoard(self.cache, self.fetcher, lambda: self.now, key='test', limit=1)
        self.assertTrue((await restarted.search('analyst'))['cached'])
        result = await restarted.search('designer')
        self.assertEqual(result['reason'], 'quota_exhausted')
        self.assertEqual(len(self.calls), 1)
        self.now += QUOTA_SECONDS
        self.assertFalse((await restarted.search('designer'))['degraded'])
        self.assertEqual(len(self.calls), 2)

    async def test_live_cache_keeps_chicago_software_and_new_york_analyst_separate(self):
        def fetcher(params, key):
            self.calls.append((params.copy(), key))
            result = feed(cursor=None)
            row = result['data']['jobs'][0]
            chicago = 'Chicago' in params['query']
            row.update(job_id='chicago' if chicago else 'new-york',
                job_title='Software Engineering Intern' if chicago else 'Data Analyst Intern',
                job_location='Chicago, IL' if chicago else 'New York, NY')
            result['data']['jobs'] = [row]
            return result, {}
        self.board.fetcher = fetcher
        software_params = {'query': 'software engineering intern', 'location': 'Chicago'}
        analyst_params = {'query': 'data analyst intern', 'location': 'New York'}
        software = (await self.client.get('/api/jobs', params=software_params)).json()
        analyst = (await self.client.get('/api/jobs', params=analyst_params)).json()
        cached_software = (await self.client.get('/api/jobs', params=software_params)).json()
        self.assertEqual(software['jobs'][0]['location'], 'Chicago, IL')
        self.assertEqual(analyst['jobs'][0]['title'], 'Data Analyst Intern')
        self.assertTrue(cached_software['cached'])
        self.assertEqual(cached_software['jobs'], software['jobs'])
        self.assertEqual(len(self.calls), 2)

    async def test_fallback_respects_role_location_remote_and_pagination(self):
        self.board.key = ''
        chicago = await self.board.search('intern', 'Chicago')
        self.assertTrue(chicago['degraded'])
        self.assertEqual(len(chicago['jobs']), 0, 'Never replace Chicago matches with Chapel Hill examples')
        self.assertEqual((await self.board.search('intern', 'IL'))['jobs'], [], 'State IL must not match the word Hill')
        software = await self.board.search('software engineering intern', 'Chapel Hill, NC')
        self.assertEqual([job['title'] for job in software['jobs']], ['Software Engineering Intern'])
        self.assertEqual((await self.board.search('software engineering intern', 'Chapel Hill', remote=True))['jobs'], [])
        analyst = await self.board.search('data analyst intern', 'Durham')
        self.assertEqual([job['title'] for job in analyst['jobs']], ['Data Analyst Intern'])
        self.assertEqual((await self.board.search('intern', page=2))['jobs'], [], 'Pagination applies after filtering')
        self.assertEqual(len(self.calls), 0)

    async def test_failed_live_queries_do_not_show_unrelated_fallback_jobs(self):
        self.upstream_error = TimeoutError('upstream unavailable')
        chicago = (await self.client.get('/api/jobs', params={'query': 'intern', 'location': 'Chicago'})).json()
        self.assertEqual(len(chicago['jobs']), 0)
        self.assertEqual(chicago['reason'], 'provider_unavailable')
        software = (await self.client.get('/api/jobs', params={'query': 'software engineering', 'location': 'Chapel Hill'})).json()
        self.assertEqual([job['title'] for job in software['jobs']], ['Software Engineering Intern'])
        self.assertEqual(len(self.calls), 1, 'Existing five-minute quota-saving backoff remains active')

    async def test_missing_key_and_quota_return_fifteen_labelled_samples(self):
        self.board.key = ''
        first = await self.board.search('jobs')
        second = await self.board.search('jobs', page=2)
        self.assertEqual(first['reason'], 'missing_key')
        jobs = first['jobs'] + second['jobs']
        self.assertEqual(len(jobs), 15)
        self.assertTrue(all(job['source'] == 'sample' and not job['applyUrl'] for job in jobs))
        detail = await self.board.detail(jobs[0]['id'])
        self.assertTrue(detail['degraded'])
        self.assertIn('fictional', detail['job']['description'])
        self.assertEqual(len(self.calls), 0)
        response = await self.client.get('/api/jobs?query=test')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['degraded'])

    async def test_upstream_failures_timeout_http_error_and_backoff(self):
        errors = ((TimeoutError('internal details'), 'timeout'),
            (URLError(TimeoutError('private socket details')), 'timeout'),
            (OSError('private internal path'), 'network_error'),
            (HTTPError('https://provider', 401, 'private key details', {}, None), 'http_401'),
            (HTTPError('https://provider', 403, 'private subscription details', {}, None), 'http_403'),
            (HTTPError('https://provider', 429, 'quota', {}, None), 'http_429'),
            (IncompleteRead(b'partial'), 'network_error'),
            (ValueError('private response details'), 'invalid_response'))
        for error, category in errors:
            self.now += RETRY_SECONDS
            self.upstream_error = error
            with self.assertLogs('uvicorn.error.jsearch', level='WARNING') as logs:
                response = await self.client.get('/api/jobs?query=test')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['reason'], 'provider_unavailable')
            self.assertEqual(response.json()['provider_error'], category)
            self.assertEqual(response.json()['retry_after'], RETRY_SECONDS)
            self.assertNotIn('internal', response.text)
            self.assertNotIn('private', response.text + '\n'.join(logs.output))
            self.assertNotIn('test-only-placeholder', '\n'.join(logs.output))
            count = len(self.calls)
            backoff = (await self.client.get('/api/jobs?query=different')).json()
            self.assertEqual(backoff['provider_error'], category)
            self.assertEqual(len(self.calls), count)
        self.assertEqual(len(json.loads(self.cache.read_text())['calls']), len(errors), 'Failed attempts count towards cap')

    async def test_timeout_wait_expires_cached_search_still_works_and_retry_recovers(self):
        await self.board.search('analyst')
        def slow_timeout(params, key):
            self.calls.append((params.copy(), key))
            self.now += 20
            raise TimeoutError('private transport details')
        self.board.fetcher = slow_timeout
        result = await self.board.search('software engineering', 'Chicago')
        self.assertEqual(result['retry_after'], RETRY_SECONDS, 'Cooldown begins after the failed request finishes')
        self.assertEqual(result['jobs'], [])
        self.assertTrue((await self.board.search('analyst'))['cached'])
        self.now += 120
        self.assertEqual((await self.board.search('software engineering', 'Chicago'))['retry_after'], 180)
        self.assertEqual(len(self.calls), 2, 'No retries during cooldown')
        self.now += 180
        self.board.fetcher = self.fetcher
        self.assertFalse((await self.board.search('software engineering', 'Chicago'))['degraded'])
        self.assertEqual(len(self.calls), 3, 'One explicit search after cooldown resumes live requests')

    async def test_corrupt_quota_state_and_write_failure_fail_closed(self):
        self.cache.write_text('invalid json')
        self.assertEqual((await self.board.search('test'))['reason'], 'quota_state_unavailable')
        self.assertEqual(len(self.calls), 0)
        other = JobBoard(Path(self.temp.name) / 'other.json', self.fetcher, lambda: self.now, key='test')
        with patch.object(other, '_save', side_effect=OSError('disk unavailable')):
            self.assertEqual((await other.search('test'))['reason'], 'quota_state_unavailable')
        self.assertEqual(len(self.calls), 0)

    async def test_empty_provider_result_is_valid_not_sample(self):
        self.board.fetcher = lambda *_: ({'status': 'OK', 'data': {'jobs': [], 'cursor': None}}, {})
        result = await self.board.search('nonexistent role')
        self.assertEqual(result['jobs'], [])
        self.assertFalse(result['degraded'])
        self.assertFalse(result['has_more'])
        self.board.fetcher = lambda *_: ({'status': 'ERROR'}, {})
        self.assertTrue((await self.board.search('another role'))['degraded'])

    async def test_validation_unknown_params_and_page_clamping(self):
        for path in ['/api/jobs', '/api/jobs?query=', '/api/jobs?query=%20%20', '/api/jobs?query=' + 'x' * 301, '/api/jobs?query=x&location=' + 'x' * 121, '/api/jobs?query=x&remote=maybe', '/api/jobs?query=x&page=oops', '/api/jobs/not-a-valid-id']:
            self.assertEqual((await self.client.get(path)).status_code, 422, path)
        self.assertEqual((await self.client.get('/api/jobs/j-' + '0' * 32)).status_code, 404)
        self.assertEqual((await self.client.get('/api/jobs?query=x&page=-10&random=ignored')).json()['page'], 1)
        self.assertEqual((await self.client.get('/api/jobs?query=x&page=100')).json()['page'], 3)

    async def test_ip_rate_limit_including_cache_and_one_minute_reset(self):
        for _ in range(RATE_LIMIT):
            self.assertEqual((await self.client.get('/api/jobs?query=x')).status_code, 200)
        response = await self.client.get('/api/jobs?query=x', headers={'X-Forwarded-For': 'invented-client'})
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers['retry-after'], '60')
        self.assertEqual(len(self.calls), 1)
        self.now += 60
        self.assertEqual((await self.client.get('/api/jobs?query=x')).status_code, 200)

    async def test_configured_frontend_origin_and_untrusted_origin(self):
        with patch.dict('os.environ', {'RESUME_FRONTEND_ORIGINS': 'http://localhost:5173'}):
            app = create_app(NoModelRunner(), self.board)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://127.0.0.1:8000') as client:
            response = await client.get('/api/jobs?query=x', headers={'Origin': 'http://localhost:5173'})
            self.assertEqual(response.headers['access-control-allow-origin'], 'http://localhost:5173')
            self.assertEqual((await client.get('/api/jobs?query=x', headers={'Origin': 'https://untrusted.example'})).status_code, 403)
            response = await client.options('/api/jobs', headers={'Origin': 'http://localhost:5173', 'Access-Control-Request-Method': 'GET'})
            self.assertEqual(response.status_code, 200)

    def test_normalization_plain_text_long_description_bool_and_unsafe_url(self):
        data = feed()
        data['data']['jobs'][0]['job_description'] = 'First line.\n\nSecond line. ' + 'z' * 400
        data['data']['jobs'][1]['job_is_remote'] = 'false'
        jobs = normalize_jobs(data)
        self.assertEqual(len(jobs[0]['snippet']), 300)
        self.assertIn('\n\nSecond line.', jobs[0]['description'])
        self.assertFalse(jobs[1]['remote'])
        self.assertEqual(jobs[1]['applyUrl'], '')
        data['data']['jobs'][0]['job_apply_link'] = 'https://user:password@example.com/job'
        self.assertEqual(normalize_jobs(data)[0]['applyUrl'], '')
        for bad in (None, [], {}, {'status': 'OK', 'data': []}):
            with self.assertRaises(ValueError):
                normalize_jobs(bad)

    def test_fixed_upstream_host_headers_timeout_and_no_key_redirect(self):
        response = MagicMock()
        response.__enter__.return_value = response
        response.headers = {'X-RateLimit-Requests-Remaining': '199'}
        response.read.return_value = json.dumps(feed()).encode()
        opener = MagicMock()
        opener.open.return_value = response
        with patch.dict('os.environ', {'JSEARCH_TIMEOUT_SECONDS': '20'}), patch('backend.jobs.build_opener', return_value=opener):
            fetch_jobs({'query': 'analyst & Python', 'num_pages': 1}, 'test-key')
        request = opener.open.call_args.args[0]
        self.assertEqual(urlsplit(request.full_url).netloc, 'jsearch.p.rapidapi.com')
        self.assertEqual(urlsplit(request.full_url).path, '/search-v2')
        self.assertEqual(parse_qs(urlsplit(request.full_url).query)['query'], ['analyst & Python'])
        self.assertEqual(request.get_header('X-rapidapi-key'), 'test-key')
        self.assertEqual(opener.open.call_args.kwargs['timeout'], 20)
        self.assertIsNone(NoRedirect().redirect_request(None, None, 302, '', {}, 'https://external.example'))

    async def test_remaining_quota_logging_without_secret(self):
        with self.assertLogs('uvicorn.error.jsearch', level='INFO') as logs:
            await self.board.search('test')
        self.assertIn('199', '\n'.join(logs.output))
        self.assertNotIn('test-only-placeholder', '\n'.join(logs.output))


if __name__ == '__main__':
    unittest.main()
