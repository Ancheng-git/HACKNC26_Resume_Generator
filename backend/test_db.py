"""Accounts, saved resumes, daily limit and queue. The API test needs DATABASE_URL to a disposable Postgres."""
import asyncio
import os
from pathlib import Path
import sys
import tempfile
import unittest
from uuid import uuid4

import httpx

ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))
from backend.app import create_app
from backend.db import Database, check_password, hash_password
from backend.runner import BusyError, Runner

PACK='a'*32


class FakeRunner(Runner):
    def __init__(self, root, gate=None):
        super().__init__(root=root, runs=Path(root)/'runs')
        self.backgrounds.reference=lambda ident: Path(root)
        self.gate=gate
        self.order=[]

    async def _generate(self, task, company, jd):
        self.order.append(company)
        if self.gate:
            await self.gate.wait()
        path=Path(self.root)/f'Resume_{company}.docx'; path.write_bytes(b'docx-bytes')
        task.update(status='succeeded', stage='completed', files={'ats_resume': path}, ats={'composite_score': 90}, warnings=[])


class PasswordTest(unittest.TestCase):
    def test_hash(self):
        stored=hash_password('correct horse')
        self.assertTrue(check_password('correct horse', stored))
        self.assertFalse(check_password('wrong horse', stored))
        self.assertNotEqual(stored, hash_password('correct horse'))


class QueueTest(unittest.IsolatedAsyncioTestCase):
    async def test_tasks_run_in_order_and_queue_is_bounded(self):
        with tempfile.TemporaryDirectory() as tmp:
            gate=asyncio.Event(); runner=FakeRunner(tmp, gate); runner.queue_limit=3
            ids=[runner.submit(name, 'JD', PACK)['id'] for name in ('A', 'B', 'C')]
            await asyncio.sleep(0)
            self.assertEqual([runner.tasks[i]['status'] for i in ids], ['running', 'queued', 'queued'])
            with self.assertRaises(BusyError):
                runner.submit('D', 'JD', PACK)
            gate.set(); await runner.active
            self.assertEqual(runner.order, ['A', 'B', 'C'])
            self.assertTrue(all(runner.tasks[i]['status'] == 'succeeded' for i in ids))


@unittest.skipUnless(os.environ.get('DATABASE_URL'), 'DATABASE_URL not set')
class DatabaseApiTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.runner=FakeRunner(self.tmp.name)
        db=Database(os.environ['DATABASE_URL']); db.init()
        os.environ['RESUME_DAILY_LIMIT']='1'
        self.client=httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app(self.runner, db=db)),base_url='http://127.0.0.1:8000')
        self.email=f'{uuid4().hex}@example.test'

    async def asyncTearDown(self):
        os.environ.pop('RESUME_DAILY_LIMIT')
        await self.client.aclose(); self.tmp.cleanup()

    async def test_account_profile_saved_resume_and_limit(self):
        c=self.client; creds={'email': self.email, 'password': 'password123'}
        job={'company': 'Figma', 'job_description': 'JD', 'background_id': PACK}
        self.assertEqual((await c.post('/api/auth/register', json=creds)).status_code, 201)
        self.assertEqual((await c.post('/api/auth/register', json=creds)).status_code, 409)
        self.assertEqual((await c.post('/api/auth/login', json={**creds, 'password': 'nope-nope'})).status_code, 401)
        self.assertEqual((await c.get('/api/me')).status_code, 401)
        self.assertEqual((await c.post('/api/generations', json=job)).status_code, 401)
        auth={'Authorization': 'Bearer '+(await c.post('/api/auth/login', json=creds)).json()['token']}
        self.assertEqual((await c.put('/api/profile', json={'name': 'Ada'}, headers=auth)).status_code, 200)
        me=(await c.get('/api/me', headers=auth)).json()
        self.assertEqual((me['email'], me['profile'], me['used_today']), (self.email, {'name': 'Ada'}, 0))
        no_pack={k: v for k, v in job.items() if k != 'background_id'}
        self.assertEqual((await c.post('/api/generations', json=no_pack, headers=auth)).status_code, 422)

        r=await c.post('/api/generations', json=job, headers=auth)
        self.assertEqual(r.status_code, 202)
        await self.runner.active
        self.assertEqual((await c.post('/api/generations', json=job, headers=auth)).status_code, 429)
        saved=(await c.get('/api/resumes', headers=auth)).json()
        self.assertEqual([(x['id'], x['status']) for x in saved], [(r.json()['id'], 'succeeded')])
        f=await c.get(saved[0]['files']['ats_resume']['url'], headers=auth)
        self.assertEqual((f.status_code, f.content), (200, b'docx-bytes'))

        other={'email': 'x'+self.email, 'password': 'password123'}
        other_auth={'Authorization': 'Bearer '+(await c.post('/api/auth/register', json=other)).json()['token']}
        self.assertEqual((await c.get(saved[0]['files']['ats_resume']['url'], headers=other_auth)).status_code, 404)
        self.assertEqual((await c.post('/api/auth/logout', headers=auth)).status_code, 204)
        self.assertEqual((await c.get('/api/me', headers=auth)).status_code, 401)


if __name__=='__main__':
    unittest.main()
