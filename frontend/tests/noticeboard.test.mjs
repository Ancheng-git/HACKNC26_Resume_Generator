import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const nodes = new Map();
const node = () => ({ value: '', checked: false, hidden: false, disabled: false, textContent: '', children: [], handlers: {},
  append(...items) { this.children.push(...items); }, replaceChildren() { this.children = []; },
  addEventListener(name, callback) { this.handlers[name] = callback; }, scrollIntoView() {},
  querySelector(selector) { return find(selector); },
});
const find = selector => { if (!nodes.has(selector)) nodes.set(selector, node()); return nodes.get(selector); };
const requests = [], imports = [];
const job = { id: '101', title: '<img src=x onerror=alert(1)> Analyst', company: 'Example', category: 'Data Analysis', description: 'Full JD\n• SQL\n• Python', applyUrl: 'https://careers.example.com/jobs/101', employmentType: 'Full-time', source: 'JSearch', remote: true, snippet: 'Short JD' };
let delayed = null, failure = false;
const context = vm.createContext({ URL, URLSearchParams, AbortController,
  document: { createElement: node }, API_BASE: 'http://127.0.0.1:8000',
  state: { backgroundId: null }, applications: [], importJobApplication: (...args) => imports.push(args),
  readResponse: async response => { if (!response.ok) throw new Error('Provider offline'); return response.json(); },
  fetch: async (url, options) => {
    requests.push({ url, options });
    if (delayed) return new Promise(resolve => { delayed.resolve = resolve; });
    if (failure) return { ok: false };
    return { ok: true, json: async () => url.endsWith('/categories') ? { categories: [{ id: 'Data Analysis', name: 'Data Analysis', count: 1 }] }
      : url.includes('?') ? { has_more: true, page: Number(new URL(url).searchParams.get('page')), jobs: [job], degraded: false }
      : { job } };
  },
});
vm.runInContext(readFileSync(new URL('../src/noticeboard.js', import.meta.url), 'utf8'), context);
context.root = { querySelector: find };
const settle = () => new Promise(resolve => setImmediate(resolve));
const dispose = vm.runInContext('mountNoticeboard(root)', context);
await settle();
assert.equal(find('#noticeboard-category').children[0].value, 'Data Analysis');
find('#noticeboard-category').value = 'Data Analysis'; find('#noticeboard-query').value = 'SQL & Python';
find('#noticeboard-location').value = 'Chapel Hill, NC'; find('#noticeboard-remote').value = 'true';
find('#noticeboard-filters').handlers.submit({ preventDefault() {} }); await settle();
let query = new URL(requests.at(-1).url).searchParams;
assert.equal(query.get('query'), 'Data Analysis SQL & Python'); assert.equal(query.get('location'), 'Chapel Hill, NC'); assert.equal(query.get('remote'), 'true');
assert.equal(query.has('page_size'), false);
assert.equal(find('#noticeboard-results').children[0].children[0].textContent, job.title, 'Provider content is displayed as text, never HTML');
assert.equal(find('#noticeboard-next').hidden, false);
find('#noticeboard-results').children[0].children[0].handlers.click(); await settle();
assert.equal(requests.at(-1).url, 'http://127.0.0.1:8000/api/jobs/101');
const detail = find('#noticeboard-detail');
assert.equal(detail.children[3].textContent, job.description);
assert.equal(detail.children[5].disabled, true, 'No materials means Generate disabled');
detail.children[4].handlers.click();
assert.equal(imports.length, 1); assert.equal(imports[0].length, 1, 'Use at workbench creates a draft');
assert.ok(requests.every(request => !request.options.method), 'Browsing only issues GET requests');

context.state.backgroundId = 'pack';
find('#noticeboard-results').children[0].children[0].handlers.click(); await settle();
assert.equal(detail.children[5].disabled, false);
detail.children[5].handlers.click(); assert.equal(imports[1][1], true, 'Explicit Generate delegates to the existing form');
context.applications.push({ status: 'running' });
find('#noticeboard-results').children[0].children[0].handlers.click(); await settle();
assert.equal(detail.children[5].disabled, true, 'A running task disables Generate');
detail.children[5].handlers.click(); assert.equal(imports.length, 2);

find('#noticeboard-next').handlers.click(); await settle();
query = new URL(requests.at(-1).url).searchParams;
assert.equal(query.get('page'), '2'); assert.equal(query.get('query'), 'Data Analysis SQL & Python');
assert.equal(find('#noticeboard-previous').hidden, false);
// Changing filters must clear old jobs immediately, without issuing another API call.
const beforeEdit = requests.length;
find('#noticeboard-location').value = 'Chicago, IL';
find('#noticeboard-filters').handlers.input();
assert.equal(find('#noticeboard-results').children.length, 0);
assert.equal(find('#noticeboard-detail').hidden, true);
assert.equal(find('#noticeboard-previous').hidden, true);
assert.equal(find('#noticeboard-next').hidden, true);
assert.equal(requests.length, beforeEdit, 'Editing filters does not spend API credits');
// Simulate an old search resolving after a newer query. The older response must be ignored.
delayed = {};
find('#noticeboard-filters').handlers.submit({ preventDefault() {} }); await settle();
const oldPending = delayed, oldRequest = requests.at(-1);
find('#noticeboard-category').value = 'Software engineering';
find('#noticeboard-query').value = 'intern';
find('#noticeboard-filters').handlers.change();
assert.equal(oldRequest.options.signal.aborted, true);
assert.equal(find('#noticeboard-filters').querySelector('button').disabled, false);
delayed = null; job.title = 'New Chicago Software Engineering Intern';
find('#noticeboard-filters').handlers.submit({ preventDefault() {} }); await settle();
assert.equal(new URL(requests.at(-1).url).searchParams.get('query'), 'Software engineering intern');
assert.equal(new URL(requests.at(-1).url).searchParams.get('location'), 'Chicago, IL');
oldPending.resolve({ ok: true, json: async () => ({ page: 1, has_more: false, jobs: [{ ...job, title: 'Old Chapel Hill Data Analyst' }] }) });
await settle();
assert.equal(find('#noticeboard-results').children[0].children[0].textContent, 'New Chicago Software Engineering Intern');
failure = true;
find('#noticeboard-filters').handlers.submit({ preventDefault() {} }); await settle();
assert.match(find('#noticeboard-status').textContent, /Provider offline/);
assert.equal(find('#noticeboard-results').children.length, 0);
assert.equal(find('#noticeboard-detail').hidden, true);
failure = false; delayed = {};
find('#noticeboard-filters').handlers.submit({ preventDefault() {} });
await settle(); const last = requests.at(-1);
dispose(); assert.equal(last.options.signal.aborted, true);
delayed.resolve({ ok: true, json: async () => ({ has_more: false, page: 1, jobs: [job] }) });
await settle(); assert.equal(find('#noticeboard-results').children.length, 0, 'A closed dialog ignores late responses');
// Sample fallback is clearly labelled and has no fake application link.
const fallbackRoot = { querySelector: find };
context.root = fallbackRoot; delayed = null;
let emptySamples = false, providerError = '';
context.fetch = async () => ({ ok: true, json: async () => ({ categories: [], jobs: emptySamples ? [] : [{ ...job, source: 'sample', applyUrl: '' }], page: 1, has_more: false, degraded: true, reason: providerError ? 'provider_unavailable' : 'missing_key', provider_error: providerError, retry_after: providerError ? 180 : 0 }) });
const disposeFallback = vm.runInContext('mountNoticeboard(root)', context); await settle();
find('#noticeboard-filters').handlers.submit({ preventDefault() {} }); await settle();
assert.match(find('#noticeboard-status').textContent, /sample jobs, not matching live vacancies/);
assert.match(find('#noticeboard-results').children[0].children.at(-1).textContent, /fictional/);
assert.equal(find('#noticeboard-next').hidden, true);
emptySamples = true;
find('#noticeboard-filters').handlers.submit({ preventDefault() {} }); await settle();
assert.equal(find('#noticeboard-results').children.length, 0);
assert.match(find('#noticeboard-status').textContent, /No matching sample postings/);
for (const [code, message] of [['timeout', /timed out/], ['http_401', /rejected the API key/], ['http_403', /subscription/], ['http_429', /quota or rate limit/], ['invalid_response', /unsupported response/]]) {
  providerError = code;
  find('#noticeboard-filters').handlers.submit({ preventDefault() {} }); await settle();
  assert.match(find('#noticeboard-status').textContent, message);
  assert.match(find('#noticeboard-status').textContent, /Search again in 3 minute/);
  assert.equal(find('#noticeboard-results').children.length, 0, 'Errors must not restore unrelated sample jobs');
}
find('#noticeboard-category').value = ''; find('#noticeboard-query').value = '';
find('#noticeboard-filters').handlers.submit({ preventDefault() {} });
assert.match(find('#noticeboard-status').textContent, /Choose a category/);
disposeFallback();
console.log('Passed: real-job contract, filters/pagination, text-only JD, draft vs explicit Generate, missing materials/busy guards, network errors, filter-edit invalidation, out-of-order query responses and close cancellation.');
