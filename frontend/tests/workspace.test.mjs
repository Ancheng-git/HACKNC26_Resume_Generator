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
let taskStatus = { status: 'succeeded', files: Object.fromEntries(['professional_resume', 'ats_resume', 'professional_cover_letter'].map(kind => [kind, { url: `/api/generations/task-1/files/${kind}`, preview_url: `/api/generations/task-1/previews/${kind}`, filename: `${kind}.docx` }])) };
let taskUnavailable = false;
const timers = [];
const timerDelays = new Map();
const documentListeners = new Map();
class FormDataMock { entries = []; append(key, value) { this.entries.push([key, value]); } }
const context = vm.createContext({ URL, AbortController, clearTimeout(timer) { const index = timers.indexOf(timer); if (index !== -1) timers.splice(index, 1); timerDelays.delete(timer); }, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }, FormData: FormDataMock, location: { hash: '' }, setTimeout(callback, delay) { timers.push(callback); timerDelays.set(callback, delay); return callback; }, document: { querySelector: $, querySelectorAll: () => [], createElement: element, addEventListener(name, callback) { if (!documentListeners.has(name)) documentListeners.set(name, []); documentListeners.get(name).push(callback); }, dispatchEvent(event) { documentListeners.get(event.type)?.forEach(callback => callback(event)); }, body: { style: {} } }, window: { prompt: () => names.shift(), alert: (text) => alerts.push(text), addEventListener() {} }, fetch: async (url, options) => {
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
assert.equal($('#document-preview').children.find(child => child.src).src, 'http://127.0.0.1:8000/api/generations/task-1/previews/professional_resume');
for (const [type, kind] of [['ats','ats_resume'], ['letter','professional_cover_letter']]) {
  vm.runInContext(`documentType = '${type}'; renderDocument();`, context);
  assert.equal($('#document-preview').children.find(child => child.href).href, `http://127.0.0.1:8000/api/generations/task-1/files/${kind}`);
  assert.equal($('#document-preview').children.find(child => child.src).src, `http://127.0.0.1:8000/api/generations/task-1/previews/${kind}`);
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
const firstNoticeTimer = timers.at(-1);
assert.equal(timerDelays.get(firstNoticeTimer), 4000);
vm.runInContext("openWorkshop('chest');", context);
await $('#save-profile').handlers.click();
assert.equal(timers.includes(firstNoticeTimer), false, 'A new successful upload cancels the previous notice timer');
assert.match($('#workshop-notice').textContent, /uploaded successfully/);
assert.equal(timerDelays.get(timers.at(-1)), 4000, 'The new notice receives its full display time');
const savedBackgroundId = vm.runInContext('state.backgroundId', context);
timers.pop()();
assert.equal($('#workshop-notice').textContent, '', 'The success notice disappears when its timer expires');
assert.equal(vm.runInContext('state.backgroundId', context), savedBackgroundId, 'Dismissing the notice preserves uploaded materials');
assert.match($('#upload-warnings').textContent, /reading order/, 'Warnings remain available in the materials panel');
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
context.chineseError = { detail: 'PDF \u542b\u65e0\u6cd5\u63d0\u53d6\u6587\u5b57\u7684\u626b\u63cf\u9875，\u8bf7\u4e0a\u4f20\u53ef\u9009\u4e2d\u6587\u5b57\u7684\u7248\u672c。' };
await assert.rejects(() => vm.runInContext('readResponse({ok:false,status:422,json:async()=>chineseError})', context), /selectable text/);
assert.equal(context.chineseError.detail, 'PDF \u542b\u65e0\u6cd5\u63d0\u53d6\u6587\u5b57\u7684\u626b\u63cf\u9875，\u8bf7\u4e0a\u4f20\u53ef\u9009\u4e2d\u6587\u5b57\u7684\u7248\u672c。');
assert.match(vm.runInContext("englishMessage('\u4efb\u52a1\u8d85\u65f6，\u5df2\u7ec8\u6b62\u751f\u6210\u8fdb\u7a0b。')", context), /timed out/);
assert.match(vm.runInContext("englishMessage('resume.pdf \u5df2\u63d0\u53d6\u6587\u5b57；\u591a\u680f\u987a\u5e8f\u53ef\u80fd\u53d8\u5316，\u539f\u6587\u4ef6\u5df2\u4fdd\u7559\u4f9b\u6838\u5bf9。')", context), /reading order/);
assert.match(vm.runInContext("englishMessage([{msg:'DOC \u8f6c\u6362\u5931\u8d25\u6216\u8d85\u65f6，\u8bf7\u4e0a\u4f20 DOCX \u6216\u6587\u5b57\u578b PDF。'}])", context), /DOC conversion/);
assert.ok(!/\p{Script=Han}/u.test(vm.runInContext("englishMessage('\u65b0\u7684\u672a\u77e5\u9519\u8bef')", context)));
vm.runInContext("selectedApplication.error=''; selectedApplication.status='failed';", context);
context.taskChinese = {status:'failed', error:'\u670d\u52a1\u5df2\u505c\u6b62，\u4efb\u52a1\u5df2\u7ec8\u6b62。', warnings:['\u751f\u6210\u4e09\u4efd\u6587\u6863\u9700\u8981\u672c\u4eba\u5934\u50cf，\u8bf7\u91cd\u65b0\u4e0a\u4f20\u5305\u542b\u7167\u7247\u7684\u5b8c\u6574\u8d44\u6599\u5305。']};
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
context.fetch = async()=>({ok:false,status:404,json:async()=>({detail:'\u4efb\u52a1\u4e0d\u5b58\u5728，\u6216\u670d\u52a1\u5df2\u91cd\u542f。'})});
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

// Importing a real job creates a draft; only explicit Generate submits the company and full role JD.
vm.runInContext("applications.forEach(a=>a.status='failed'); state.backgroundId='background-1';", context);
context.importedJob = { company: 'Example Company', title: 'Data Analyst', description: 'Full source JD: SQL and Python.' };
const beforeImport = requests.length;
vm.runInContext('importJobApplication(importedJob)', context);
assert.equal(requests.length, beforeImport, 'Selecting a job must not spend model quota');
assert.equal($('#job-title').value, 'Data Analyst');
assert.equal($('#job-description').value, context.importedJob.description);
assert.equal(vm.runInContext('selectedApplication.company', context), 'Example Company');
assert.equal($('#workspace').parentNode, $('#workshop-panel-body'));
$('#job-form').requestSubmit = () => $('#job-form').handlers.submit({preventDefault(){}});
vm.runInContext('importJobApplication(importedJob, true)', context);
await new Promise(resolve=>setImmediate(resolve));
const importedRequest = requests.slice(beforeImport).find(request=>request.options?.method === 'POST');
assert.deepEqual(JSON.parse(importedRequest.options.body), {
  company: 'Example Company', job_description: 'Data Analyst\nCompany: Example Company\n\nFull source JD: SQL and Python.', background_id: 'background-1',
});
assert.equal(requests.slice(beforeImport).filter(request=>request.options?.method === 'POST').length, 1);
console.log('Passed: job import preserves full JD and company/title, draft has no POST, explicit Generate reuses the existing workflow.');

// Acceptance closes only the workbench; failure keeps the form, and the guide is temporary.
vm.runInContext("applications.forEach(a=>a.status='failed'); hideFurnaceGuide(); openWorkshop('table');", context);
let acceptGeneration, submittedCount = 0;
context.fetch = (url, options) => {
  if (options?.method === 'POST') {
    submittedCount++;
    return new Promise(resolve => { acceptGeneration = resolve; });
  }
  return Promise.resolve({ok:true,json:async()=>({status:'running',stage:'generating'})});
};
const pendingGeneration = $('#job-form').handlers.submit({preventDefault(){}});
assert.equal($('#generate').disabled, true, 'Generate disables immediately during submission');
assert.equal($('#workshop-dialog').open, true, 'Keep the form while the backend has not accepted the request');
assert.equal($('#furnace-guide').hidden, true);
await $('#job-form').handlers.submit({preventDefault(){}});
assert.equal(submittedCount, 1, 'A second click cannot submit another task');
acceptGeneration({ok:true,json:async()=>({id:'guide-task',status:'queued'})});
await pendingGeneration;
await new Promise(resolve=>setImmediate(resolve));
assert.equal($('#workshop-dialog').open, false);
assert.equal($('#workspace').parentNode, originalParent);
assert.equal($('#furnace-guide').hidden, false);
assert.equal($('#generate').disabled, true, 'Generate stays disabled while the task runs');
const guideTimer = vm.runInContext('furnaceGuideTimer', context);
assert.equal(timerDelays.get(guideTimer), 4000);
guideTimer();
assert.equal($('#furnace-guide').hidden, true);
assert.equal(vm.runInContext('selectedApplication.status', context), 'running', 'Hiding the guide cannot stop the task');

// A fast failure clears the guide before its timer, and unlocks Generate for a retry.
vm.runInContext("openWorkshop('table'); window.workshop.generating();", context);
const earlyGuideTimer = vm.runInContext('furnaceGuideTimer', context);
context.fetch = async()=>({ok:true,json:async()=>({status:'failed',error:'Fixture generation failed'})});
await vm.runInContext('pollApplication(selectedApplication)', context);
assert.equal($('#furnace-guide').hidden, true);
assert.equal(timers.includes(earlyGuideTimer), false);
assert.equal($('#generate').disabled, false);
for (const failure of [
  {ok:false,status:409,json:async()=>({detail:'Backend is busy'})},
  {ok:true,json:async()=>({status:'queued'})},
]) {
  vm.runInContext("openWorkshop('table');", context);
  context.fetch = async()=>failure;
  await $('#job-form').handlers.submit({preventDefault(){}});
  assert.equal($('#workshop-dialog').open, true, 'A rejected or invalid submission must leave the form open');
  assert.equal($('#furnace-guide').hidden, true);
  assert.equal($('#generate').disabled, false);
  assert.equal(vm.runInContext('selectedApplication.status', context), 'Submission failed');
}
context.fetch = previousFetch;
console.log('Passed: immediate Generate lock, duplicate submission guard, accepted-task dialog close, four-second guide, early failure cleanup and rejected submission retry.');

// Terminal results return to the workbench without interrupting an open materials panel.
const resultFiles = Object.fromEntries(['professional_resume','ats_resume','professional_cover_letter'].map(kind=>[kind, {
  name:`${kind}.docx`, url:`/api/generations/result/files/${kind}`, preview_url:`/api/generations/result/previews/${kind}`,
}]));
vm.runInContext("closeWorkshop(); location.hash='#scene'; showPage(); applications.forEach(a=>a.status='failed'); selectedApplication.status='running'; selectedApplication.taskId='result';",context);
context.fetch = async()=>({ok:true,json:async()=>({status:'succeeded',files:resultFiles})});
await vm.runInContext('pollApplication(selectedApplication)',context);
assert.equal($('#workshop-dialog').open,true);
assert.equal(vm.runInContext('window.workshop.active',context),'table');
assert.equal($('#document-preview').children.filter(child=>child.src).length,1);
const image = $('#document-preview').children.find(child=>child.src);
image.handlers.error();
assert.equal(image.hidden,true);
assert.ok($('#document-preview').children.some(child=>child.href),'A preview error must keep the DOCX download');
assert.match($('#document-preview').children.at(-1).textContent,/still download/);
vm.runInContext("selectedApplication.files.professional_cover_letter.preview_url='https://untrusted.example/page.png'; renderDocument();",context);
assert.equal($('#document-preview').children.some(child=>child.src),false,'Ignore previews outside the backend origin');

const failureData = {category:'ats',summary:'ATS publication requirements were not met.',report_available:true,
  report_summary:['<img src=x onerror=alert(1)> is plain report text','Commercial experience was not documented'],
  checks:{composite_score:93,must_have_pct:83,revision_passes:0},focus_areas:[{area:'Databricks',action:'Upload real project evidence or gain practical experience.'}]};
vm.runInContext("closeWorkshop(); selectedApplication.status='running';",context);
context.fetch = async()=>({ok:true,json:async()=>({status:'failed',error:'ATS failed',failure:failureData})});
await vm.runInContext('pollApplication(selectedApplication)',context);
assert.equal(vm.runInContext('window.workshop.active',context),'table');
const feedbackSection = $('#document-preview').children.find(child=>child.className==='generation-feedback');
const treeText = node=>[node.textContent||'',...node.children.map(treeText)].join(' ');
assert.match(treeText(feedbackSection),/93\/100.*83%.*0\/3/);
assert.match(treeText(feedbackSection),/Databricks/);
assert.match(treeText(feedbackSection),/<img src=x onerror=alert\(1\)> is plain report text/);
assert.equal($('#document-preview').children.some(child=>child.href||child.src),false,'Failed results must have no file links or previews');
vm.runInContext("openWorkshop('chest'); selectedApplication.status='running';",context);
context.fetch = async()=>({ok:true,json:async()=>({status:'succeeded',files:resultFiles})});
await vm.runInContext('pollApplication(selectedApplication)',context);
assert.equal(vm.runInContext('window.workshop.active',context),'chest','Completion must not close an active materials panel');
context.fetch = previousFetch;
console.log('Passed: all three actual preview URLs, preview failure download fallback, origin restriction, result auto-open, report text safety and uninterrupted materials panel.');
