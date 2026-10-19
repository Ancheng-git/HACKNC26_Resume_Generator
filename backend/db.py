"""Postgres persistence (Tiger Cloud). The connection string comes only from DATABASE_URL."""
import hashlib
import hmac
import secrets

import psycopg
from psycopg.types.json import Jsonb

SCHEMA = '''
create table if not exists users (
    id bigserial primary key, email text unique not null, password_hash text not null,
    created_at timestamptz not null default now());
create table if not exists sessions (
    token_hash text primary key, user_id bigint not null references users on delete cascade,
    expires_at timestamptz not null default now() + interval '30 days');
create table if not exists profiles (
    user_id bigint primary key references users on delete cascade, data jsonb not null,
    updated_at timestamptz not null default now());
create table if not exists resumes (
    id text primary key, user_id bigint not null references users on delete cascade,
    company text not null, status text not null, error text, ats jsonb, warnings jsonb,
    created_at timestamptz not null default now());
create table if not exists resume_files (
    resume_id text not null references resumes on delete cascade, kind text not null,
    name text not null, content bytea not null, primary key (resume_id, kind));
'''


def hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f'scrypt${salt.hex()}${digest.hex()}'


def check_password(password, stored):
    _, salt, digest = stored.split('$')
    actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1)
    return hmac.compare_digest(actual.hex(), digest)


def _token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


class Database:
    def __init__(self, url):
        self.url = url

    def connect(self):
        # shortcut: one connection per call; add psycopg_pool if traffic grows past a demo.
        return psycopg.connect(self.url)

    def init(self):
        with self.connect() as conn:
            conn.execute(SCHEMA)

    def _session(self, conn, user_id):
        token = secrets.token_urlsafe(32)
        conn.execute('insert into sessions (token_hash, user_id) values (%s, %s)', (_token_hash(token), user_id))
        return token

    def register(self, email, password):
        """Return a session token, or None if the email is taken."""
        with self.connect() as conn:
            row = conn.execute('insert into users (email, password_hash) values (%s, %s) '
                'on conflict (email) do nothing returning id', (email, hash_password(password))).fetchone()
            return row and self._session(conn, row[0])

    def login(self, email, password):
        with self.connect() as conn:
            row = conn.execute('select id, password_hash from users where email = %s', (email,)).fetchone()
            if row and check_password(password, row[1]):
                return self._session(conn, row[0])
            return None

    def logout(self, token):
        with self.connect() as conn:
            conn.execute('delete from sessions where token_hash = %s', (_token_hash(token),))

    def user_for(self, token):
        with self.connect() as conn:
            row = conn.execute('select user_id from sessions where token_hash = %s and expires_at > now()',
                (_token_hash(token),)).fetchone()
            return row and row[0]

    def me(self, user_id):
        with self.connect() as conn:
            return conn.execute('select u.email, coalesce(p.data, \'{}\'::jsonb) from users u '
                'left join profiles p on p.user_id = u.id where u.id = %s', (user_id,)).fetchone()

    def save_profile(self, user_id, data):
        with self.connect() as conn:
            conn.execute('insert into profiles (user_id, data) values (%s, %s) on conflict (user_id) '
                'do update set data = excluded.data, updated_at = now()', (user_id, Jsonb(data)))

    def start_resume(self, ident, user_id, company):
        with self.connect() as conn:
            conn.execute('insert into resumes (id, user_id, company, status) values (%s, %s, %s, %s)',
                (ident, user_id, company, 'running'))

    def finish_resume(self, task):
        """Copy a finished runner task (and its validated files) into the database."""
        with self.connect() as conn:
            conn.execute('update resumes set status = %s, error = %s, ats = %s, warnings = %s where id = %s',
                (task['status'], task['error'], Jsonb(task.get('ats')), Jsonb(task.get('warnings')), task['id']))
            for kind, path in task['files'].items():
                conn.execute('insert into resume_files (resume_id, kind, name, content) values (%s, %s, %s, %s)',
                    (task['id'], kind, path.name, path.read_bytes()))

    def recent_count(self, user_id):
        with self.connect() as conn:
            return conn.execute("select count(*) from resumes where user_id = %s and created_at > now() - interval '1 day'",
                (user_id,)).fetchone()[0]

    def resumes(self, user_id):
        with self.connect() as conn:
            rows = conn.execute('select r.id, r.company, r.status, r.error, r.ats, r.warnings, r.created_at, '
                'coalesce(jsonb_object_agg(f.kind, f.name) filter (where f.kind is not null), \'{}\'::jsonb) '
                'from resumes r left join resume_files f on f.resume_id = r.id where r.user_id = %s '
                'group by r.id order by r.created_at desc', (user_id,)).fetchall()
        return [{'id': r[0], 'company': r[1], 'status': r[2], 'error': r[3], 'ats': r[4], 'warnings': r[5],
                 'created_at': r[6].isoformat(),
                 'files': {kind: {'name': name, 'url': f'/api/resumes/{r[0]}/files/{kind}'} for kind, name in r[7].items()}}
                for r in rows]

    def resume_file(self, user_id, ident, kind):
        with self.connect() as conn:
            return conn.execute('select f.name, f.content from resume_files f join resumes r on r.id = f.resume_id '
                'where r.user_id = %s and f.resume_id = %s and f.kind = %s', (user_id, ident, kind)).fetchone()
