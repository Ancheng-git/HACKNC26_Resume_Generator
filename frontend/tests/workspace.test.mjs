import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const elements = new Map();
let focused;
const originalParent = { insertBefore(child) { child.parentNode = this; } };
const element = () => ({ value: '', children: [], handlers: {}, parentNode: originalParent, nextSibling: null, isConnected: true, classList: { toggle() {}, add() {}, remove() {} }, append(...items) { this.children.push(...items); items.forEach(item => { item.parentNode = this; }); }, replaceChildren() { this.children = []; }, setAttribute() {}, querySelector() { return $('#generate'); }, focus() { focused = this; }, showModal() { this.open = true; }, close() { this.open = false; }, addEventListener(name, callback) { this.handlers[name] = callback; } });
const $ = (id) => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
const requests = [], alerts = [], names = ['Second', null];
let uploadReady = true;
let taskStatus = { status: 'succeeded', files: Object.fromEntries(['professional_resume', 'ats_resume', 'professional_cover_letter'].map(kind => [kind, { url: `/api/generations/task-1/files/${kind}`, filename: `${kind}.docx` }])) };
let taskUnavailable = false;
const timers = [];
class FormDataMock { entries = []; append(key, value) { this.entries.push([key, value]); } }
const context = vm.createContext({ URL, AbortController, clearTimeout() {}, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }, FormData: FormDataMock, location: { hash: '' }, setTimeout(callback) { timers.push(callback); }, document: { querySelector: $, querySelectorAll: () => [], createElement: element, addEventListener() {}, dispatchEvent() {}, body: { style: {} } }, window: { prompt: () => names.shift(), alert: (text) => alerts.push(text), addEventListener() {} }, fetch: async (url, options) => {
  requests.push({ url, options });
  if (options?.method !== 'POST' && taskUnavailable) throw new Error('Network unavailable');
  return { ok: true, json: async () => url.endsWith('/backgrounds') ? { background_id: 'background-1', ready_for_generation: uploadReady, warnings: ['PDF reading order may change.'] } : options?.method === 'POST' ? { id: 'task-1', status: 'queued' } : taskStatus };
} });
$('#job-form').reset = () => { $('#job-title').value = ''; $('#job-description').value = ''; };
for (const file of ['api.js', 'script.js', 'workspace.js']) vm.runInContext(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), context);
assert.equal($('#start-button').disabled, true);
assert.equal($('#eco-scene').hidden, false);
assert.equal($('.page-shell').hidden, true);
vm.runInContext("location.hash = '#profile'; showPage();", context);
assert.equal($('#eco-scene').hidden, true);
assert.equal($('.page-shell').hidden, false);
await $('#save-profile').handlers.click();
assert.equal(requests.length, 0);
context.resume = { name: 'resume.pdf', size: 1000 };
context.photo = { name: 'photo.png', size: 1000 };
vm.runInContext('chooseFile([resume]); state.pendingPhoto = photo; setChestOpen(true);', context);
await $('#save-profile').handlers.click();
assert.equal(vm.runInContext('state.backgroundId', context), 'background-1');
assert.equal(vm.runInContext('state.open', context), false);
assert.equal($('#start-button').disabled, false);
assert.deepEqual(requests[0].options.body.entries.map(([key]) => key), ['resume', 'photo']);
assert.equal(requests[0].options.headers, undefined);
assert.match($('#readiness').textContent, /reading order/);
vm.runInContext("location.hash = '#workspace'; showPage();", context);
assert.equal(vm.runInContext('selectedApplication.label', context), 'default');
await $('#job-form').handlers.submit({ preventDefault() {} });
assert.equal(requests.length, 1);
assert.match($('#job-error').textContent, /job description/);
$('#job-title').value = 'Figma'; $('#job-description').value = 'Job details';
$('#job-form').handlers.input();
await $('#job-form').handlers.submit({ preventDefault() {} });
await new Promise((resolve) => setImmediate(resolve));
assert.deepEqual(JSON.parse(requests[1].options.body), { company: 'Figma', job_description: 'Job details', background_id: 'background-1' });
assert.equal(vm.runInContext('selectedApplication.status', context), 'succeeded');
assert.equal($('#document-preview').children.find(child => child.href).href, 'http://127.0.0.1:8000/api/generations/task-1/files/professional_resume');
for (const [type, kind] of [['ats','ats_resume'], ['letter','professional_cover_letter']]) {
  vm.runInContext(`documentType = '${type}'; renderDocument();`, context);
  assert.equal($('#document-preview').children.find(child => child.href).href, `http://127.0.0.1:8000/api/generations/task-1/files/${kind}`);
}
$('#new-job').handlers.click();
$('#new-job-label').value = 'Second';
$('#new-job-form').handlers.submit({ preventDefault() {} });
assert.equal(vm.runInContext('applications.length', context), 2);
$('#job-list').children[1].handlers.click();
assert.equal($('#job-description').value, 'Job details');
vm.runInContext("location.hash = '#scene'; showPage();", context);
assert.equal($('#eco-scene').hidden, false);
assert.equal($('#workspace').hidden, true);
assert.equal(vm.runInContext('state.backgroundId', context), 'background-1');
vm.runInContext("location.hash = '#workspace'; showPage();", context);
assert.equal(vm.runInContext('applications.length', context), 2);
assert.equal($('#job-description').value, 'Job details');
$('#new-job').handlers.click();
$('#new-job-label').value = '';
$('#new-job-form').handlers.submit({ preventDefault() {} });
assert.equal(vm.runInContext('applications.length', context), 2);
assert.throws(() => vm.runInContext("validateUpload({name:'resume.txt',size:1}, photo, [])", context), /PDF/);
assert.throws(() => vm.runInContext("validateUpload({...resume,size:11*1024*1024}, photo, [])", context), /10 MB/);
assert.throws(() => vm.runInContext('validateUpload(resume, photo, Array(6).fill(resume))', context), /five/);
vm.runInContext('state.backgroundId = null; setChestOpen(true);', context);
uploadReady = false;
await $('#save-profile').handlers.click();
assert.equal(vm.runInContext('state.backgroundId', context), null);
assert.equal(vm.runInContext('state.open', context), true);
assert.equal($('#start-button').disabled, true);
vm.runInContext("applications[0].status = 'running'; applications[0].stage = 'validating';", context);
assert.equal(vm.runInContext('furnaceState().lit', context), true);
assert.match(vm.runInContext('furnaceState().text', context), /Validating/);
vm.runInContext("selectedApplication = applications[1]; location.hash = '#scene'; showPage();", context);
assert.equal(vm.runInContext('furnaceState().lit', context), true, 'Switching projects and closing workspace cannot extinguish an active task');
vm.runInContext("applications[0].status = 'failed'; applications[0].stage = 'failed';", context);
assert.equal(vm.runInContext('furnaceState().lit', context), false);
vm.runInContext("applications[0].status = 'queued';", context);
assert.match(vm.runInContext('furnaceState().text', context), /Queued/);
vm.runInContext("applications[0].status = 'running'; applications[0].stage = 'generating';", context);
assert.match(vm.runInContext('furnaceState().text', context), /Generating/);
vm.runInContext("applications[0].status = 'succeeded';", context);
assert.equal(vm.runInContext('furnaceState().lit', context), false);
vm.runInContext(readFileSync(new URL('../src/workshop.js', import.meta.url), 'utf8'), context);
vm.runInContext("location.hash = '#scene'; showPage(); openWorkshop('chest');", context);
assert.equal($('#inventory').parentNode, $('#workshop-panel-body'));
assert.equal($('#workshop-dialog').open, true);
assert.equal(vm.runInContext('state.open', context), true);
await $('#save-profile').handlers.click();
assert.equal($('#workshop-dialog').open, true, 'Unready upload must keep panel open');
uploadReady = true;
await $('#save-profile').handlers.click();
assert.equal($('#workshop-dialog').open, false, 'Successful upload closes panel');
assert.equal(vm.runInContext('state.open', context), false);
assert.equal($('#inventory').parentNode, originalParent);
assert.equal(focused, $('[data-workshop="chest"]'));
assert.match($('#workshop-notice').textContent, /reading order/);
vm.runInContext("openWorkshop('table');", context);
assert.equal($('#workspace').parentNode, $('#workshop-panel-body'));
const appCount = vm.runInContext('applications.length', context);
const backgroundId = vm.runInContext('state.backgroundId', context);
$('#workshop-dialog').handlers.cancel({ preventDefault() {} });
assert.equal($('#workspace').parentNode, originalParent);
assert.equal(focused, $('[data-workshop="table"]'));
vm.runInContext("openWorkshop('table'); closeWorkshop();", context);
assert.equal(vm.runInContext('applications.length', context), appCount);
assert.equal(vm.runInContext('state.backgroundId', context), backgroundId);
taskStatus = { status: 'running', stage: 'validating' };
const beforePoll = requests.length;
await vm.runInContext('Promise.all([pollApplication(applications[0]), pollApplication(applications[0])])', context);
assert.equal(requests.length, beforePoll + 1, 'Concurrent retries cannot duplicate polling');
assert.equal(vm.runInContext('furnaceState().lit', context), true);
assert.match(vm.runInContext('furnaceState().text', context), /Validating/);
assert.ok(timers.length, 'Active tasks schedule their next query independently of dialog');
taskStatus = { status: 'succeeded' };
await timers.pop()();
assert.equal(vm.runInContext('furnaceState().lit', context), false);
taskUnavailable = true;
await vm.runInContext('pollApplication(applications[0])', context);
assert.equal(vm.runInContext('applications[0].status', context), 'Status unavailable');
assert.equal(vm.runInContext('furnaceState().lit', context), false, 'Unknown state must not imply the backend is generating');
console.log('Passed: upload contract, validation/warnings, scene dialogs and focus, independent drafts, three downloads, task stages, background polling and retry guards (simulated).');

// Backend messages are translated for presentation, while response payloads stay untouched.
context.chineseError = { detail: 'PDF 含无法提取文字的扫描页，请上传可选中文字的版本。' };
await assert.rejects(() => vm.runInContext('readResponse({ok:false,status:422,json:async()=>chineseError})', context), /selectable text/);
assert.equal(context.chineseError.detail, 'PDF 含无法提取文字的扫描页，请上传可选中文字的版本。');
assert.match(vm.runInContext("englishMessage('任务超时，已终止生成进程。')", context), /timed out/);
assert.match(vm.runInContext("englishMessage('resume.pdf 已提取文字；多栏顺序可能变化，原文件已保留供核对。')", context), /reading order/);
assert.match(vm.runInContext("englishMessage([{msg:'DOC 转换失败或超时，请上传 DOCX 或文字型 PDF。'}])", context), /DOC conversion/);
assert.ok(!/\p{Script=Han}/u.test(vm.runInContext("englishMessage('新的未知错误')", context)));
vm.runInContext("selectedApplication.error=''; selectedApplication.status='failed';", context);
context.taskChinese = {status:'failed', error:'服务已停止，任务已终止。', warnings:['生成三份文档需要本人头像，请重新上传包含照片的完整资料包。']};
const previousFetch = context.fetch;
context.fetch = async () => ({ok:true,json:async()=>context.taskChinese});
await vm.runInContext('pollApplication(selectedApplication)', context);
assert.match(vm.runInContext('selectedApplication.error', context), /backend stopped/);
assert.ok(!/\p{Script=Han}/u.test($('#document-preview').children.map(child=>child.textContent).join(' ')));
context.fetch = previousFetch;

// Contract limits are enforced before any POST, not only by native input attributes.
vm.runInContext("state.backgroundId='background-1'; applications.forEach(a=>a.status='failed');", context);
const requestCount = requests.length;
$('#job-title').value = 'x'.repeat(121); $('#job-description').value = 'Job details';
await $('#job-form').handlers.submit({preventDefault(){}});
assert.equal(requests.length, requestCount);
assert.match($('#job-error').textContent, /120/);
$('#job-title').value = 'Valid'; $('#job-description').value = 'x'.repeat(50001);
await $('#job-form').handlers.submit({preventDefault(){}});
assert.equal(requests.length, requestCount);
assert.match($('#job-error').textContent, /50,000/);

context.withWarnings = {status:'succeeded', ats:{composite_score:74,must_have_pct:82}, warnings:['Three revisions completed; remaining skills gap.'], files:taskStatus.files};
context.fetch = async()=>({ok:true,json:async()=>context.withWarnings});
await vm.runInContext('pollApplication(selectedApplication)',context);
assert.equal(vm.runInContext('selectedApplication.status',context),'succeeded');
assert.match($('#document-preview').children.map(child=>child.textContent).join(' '), /74.*82%/);
assert.match($('#document-preview').children.map(child=>child.textContent).join(' '), /remaining skills gap/);
context.fetch = previousFetch;

// Download errors must never become a DOCX; success uses the returned name and releases the URL.
const realURL = URL;
let blobReads=0, revoked=0, clicked=0, removed=0, savedName;
class DownloadURL extends realURL {
  static createObjectURL(){ return 'blob:fixture'; }
  static revokeObjectURL(url){ assert.equal(url,'blob:fixture'); revoked++; }
}
context.URL = DownloadURL;
context.document.body.append = link=>{savedName=link.download;};
const oldCreateElement = context.document.createElement;
context.document.createElement = ()=>({...element(),click(){clicked++;},remove(){removed++;}});
for(const status of [404,409]){
  context.fetch = async()=>({ok:false,status,json:async()=>({detail:'Download unavailable'}),blob:async()=>{blobReads++;}});
  await assert.rejects(()=>vm.runInContext("downloadGenerationFile({url:'/api/generations/test/files/ats_resume',name:'real-name.docx'})",context),/unavailable|completed/);
}
assert.equal(blobReads,0); assert.equal(clicked,0);
context.fetch = async()=>({ok:true,blob:async()=>{blobReads++;return new Blob(['fixture']);}});
await vm.runInContext("downloadGenerationFile({url:'/api/generations/test/files/ats_resume',name:'real-name.docx'})",context);
assert.equal(savedName,'real-name.docx'); assert.equal(blobReads,1); assert.equal(clicked,1); assert.equal(removed,1);
timers.pop()(); assert.equal(revoked,1);
await assert.rejects(()=>vm.runInContext("downloadGenerationFile({url:'https://unrelated.example/file.docx'})",context),/does not belong/);
context.URL = realURL; context.fetch = previousFetch; context.document.createElement = oldCreateElement;
console.log('Passed: contract length limits, ATS warnings, checked download success/404/409, returned filenames and URL cleanup.');

// Error responses and late queries cannot create duplicate tasks or overwrite another task.
for (const status of [409,422]) {
  context.fetch = async()=>({ok:false,status,json:async()=>({detail:[{msg:'Request cannot be accepted'}]})});
  await assert.rejects(()=>vm.runInContext('fetch(API_BASE).then(readResponse)',context), /Request cannot be accepted/);
}
context.fetch = async()=>({ok:false,status:404,json:async()=>({detail:'任务不存在，或服务已重启。'})});
await vm.runInContext('pollApplication(selectedApplication)',context);
assert.equal(vm.runInContext('selectedApplication.status',context),'Status unavailable');
assert.match(vm.runInContext('selectedApplication.error',context), /restarted/);
assert.equal($('#document-preview').children.some(child=>child.href),false);

let releaseQuery;
context.fetch = ()=>new Promise(resolve=>{releaseQuery=resolve;});
const latePoll=vm.runInContext('pollApplication(selectedApplication)',context);
vm.runInContext("selectedApplication.taskId='new-task'; selectedApplication.status='queued';",context);
releaseQuery({ok:true,json:async()=>({status:'failed',error:'old failure'})});
await latePoll;
assert.equal(vm.runInContext('selectedApplication.status',context),'queued');
context.fetch = previousFetch;
console.log('Passed: 409/422 messages, status 404, unavailable download hiding and stale query protection.');
