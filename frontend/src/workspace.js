const applications = [];
let selectedApplication = null;
let documentType = 'resume';

function showPage() {
  window.workshop?.close();
  const workspaceOpen = location.hash === '#workspace';
  const sceneOpen = !location.hash || location.hash === '#scene';
  document.querySelector('#eco-scene').hidden = !sceneOpen;
  document.querySelector('.page-shell').hidden = workspaceOpen || sceneOpen;
  $('#workspace').hidden = !workspaceOpen;
  document.body.style.overflow = '';
  if (workspaceOpen) {
    ensureApplication();
    $('#job-title').focus();
  }
}

function ensureApplication() {
    if (!applications.length) {
      selectedApplication = { label: 'default', title: '', description: '' };
      applications.push(selectedApplication);
      renderApplications();
      renderDocument();
    }
    $('#profile-summary').textContent = state.file ? `${state.file.name}${state.photo ? ' · Photo included' : ''} · ${state.supplements?.length || 0} supporting file(s)` : 'No saved personal file';
}

function taskText(application) {
  const statuses = { submitting: 'Submitting', queued: 'Queued', running: 'Generating', succeeded: 'Completed', failed: 'Failed', 'Submission failed': 'Submission failed', 'Status unavailable': 'Status unavailable; check again' };
  if (application.status === 'running') return { preparing: 'Preparing', generating: 'Generating', validating: 'Validating' }[application.stage] || 'Generating';
  return statuses[application.status] || englishMessage(application.status, 'Status unavailable') || 'Draft';
}
function furnaceState() {
  const tasks = applications.filter(application => application.taskId || application.status);
  const active = tasks.filter(application => ['queued', 'running'].includes(application.status));
  return { lit: active.length > 0, text: active.length ? active.map(application => `${application.label} · ${taskText(application)}`).join(' / ') : tasks.length ? `${tasks[0].label} · ${taskText(tasks[0])}` : 'No generation tasks', tasks };
}

function renderApplications() {
  $('#job-form').querySelector('button[type="submit"]').disabled = applications.some(application => ['submitting', 'queued', 'running'].includes(application.status));
  $('#job-list').replaceChildren();
  if (!applications.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-jobs';
    empty.textContent = 'Click + to name your first application.';
    $('#job-list').append(empty);
  }
  applications.forEach((application) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `job-card${application === selectedApplication ? ' selected' : ''}`;
    button.setAttribute('aria-pressed', String(application === selectedApplication));
    const company = document.createElement('strong');
    company.textContent = application.label;
    const title = document.createElement('span');
    title.textContent = application.title || 'Add job details';
    const status = document.createElement('small');
    status.textContent = `◇ ${taskText(application)}`;
    button.append(company, title, status);
    button.addEventListener('click', () => {
      selectedApplication = application;
      $('#job-title').value = application.title;
      $('#job-description').value = application.description;
      renderApplications();
      renderDocument();
    });
    $('#job-list').append(button);
  });
  document.dispatchEvent(new CustomEvent('workshop-tasks', { detail: furnaceState() }));
}

function renderDocument() {
  const preview = $('#document-preview');
  preview.replaceChildren();
  document.querySelectorAll('[data-document]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.document === documentType)));
  $('#application-title').textContent = selectedApplication ? selectedApplication.label : 'Where will your story go next?';
  $('#document-status').textContent = selectedApplication ? taskText(selectedApplication) : 'Draft';
  const message = document.createElement('p');
  message.className = 'document-empty';
  message.textContent = selectedApplication?.error || (selectedApplication?.status === 'succeeded' ? 'Your documents are ready.' : 'Add a job description and generate your application.');
  preview.append(message);
  if (selectedApplication?.warnings) {
    const warning = document.createElement('p');
    warning.textContent = englishMessage(selectedApplication.warnings, 'The backend reported a generation warning. Review the generated documents.');
    preview.append(warning);
  }
  if (selectedApplication?.ats) {
    const score = document.createElement('p');
    const ats = selectedApplication.ats;
    score.textContent = `ATS score: ${ats.composite_score ?? 'Unavailable'} · Required keyword coverage: ${ats.must_have_pct == null ? 'Unavailable' : `${ats.must_have_pct}%`}`;
    preview.append(score);
  }
  const fileType = { resume: 'professional_resume', ats: 'ats_resume', letter: 'professional_cover_letter' }[documentType];
  const files = selectedApplication?.files;
  const file = Array.isArray(files) ? files.find((entry) => entry.type === fileType || entry.kind === fileType) : files?.[fileType];
  if (selectedApplication?.status === 'succeeded' && file?.url) {
    const url = new URL(file.url, API_BASE);
    if (url.origin !== new URL(API_BASE).origin) return;
    const link = document.createElement('a');
    link.href = url.href;
    link.textContent = `Download ${{resume: 'resume', ats: 'ATS resume', letter: 'cover letter'}[documentType]}`;
    preview.append(link);
    const application = selectedApplication;
    const kind = documentType;
    application.downloads ||= {};
    const download = application.downloads[kind] ||= {};
    const feedback = document.createElement('p');
    feedback.setAttribute('role', 'status');
    const label = link.textContent;
    const update = () => { link.textContent = download.busy ? 'Downloading…' : label; link.setAttribute('aria-disabled', String(!!download.busy)); feedback.textContent = download.error || ''; };
    update();
    link.addEventListener('click', async event => {
      event.preventDefault();
      if (download.busy) return;
      download.busy = true; download.error = ''; update();
      try { await downloadGenerationFile(file); }
      catch (error) { download.error = `${englishMessage(error.message)} Try downloading again; you do not need to regenerate.`; }
      finally { download.busy = false; update(); }
    });
    preview.append(feedback);
  }
}

async function pollApplication(application) {
  if (application.polling) return;
  application.polling = true;
  const taskId = application.taskId;
  const controller = new AbortController();
  application.controller = controller;
  try {
    const data = await readResponse(await fetch(`${API_BASE}/api/generations/${encodeURIComponent(taskId)}`, { signal: controller.signal }));
    if (controller.signal.aborted || application.taskId !== taskId) return;
    Object.assign(application, { status: data.status, stage: data.stage, files: data.files, ats: data.ats, warnings: data.warnings, error: data.error ? englishMessage(data.error, 'Generation failed. Check the backend task logs before trying again.') : '' });
    if (application.status === 'queued' || application.status === 'running') application.timer = setTimeout(() => pollApplication(application), 2000);
  } catch (error) {
    if (controller.signal.aborted || application.taskId !== taskId || error.name === 'AbortError') return;
    application.status = 'Status unavailable';
    application.error = `${error.message} The task may still be running. Click Generate to check its status again.`;
  } finally {
    application.polling = false;
    application.controller = null;
  }
  renderApplications();
  if (selectedApplication === application) renderDocument();
}

$('#job-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = $('#job-title').value.trim();
  const description = $('#job-description').value.trim();
  $('#job-error').textContent = '';
  if (!description) { $('#job-error').textContent = 'Please add a job description before generating.'; $('#job-description').focus(); return; }
  if (!title) { $('#job-error').textContent = 'Please add a job title.'; $('#job-title').focus(); return; }
  if (title.length > 120 || description.length > 50000) { $('#job-error').textContent = 'Title must be at most 120 characters and job description at most 50,000 characters.'; return; }
  if (!state.backgroundId) { $('#job-error').textContent = 'Upload your personal materials in the experience chest before generating.'; $('#edit-profile').focus(); return; }
  if (!selectedApplication && !createApplication()) return;
  const application = selectedApplication;
  if (application.taskId && application.status === 'Status unavailable') { pollApplication(application); return; }
  if (applications.some(item => ['submitting', 'queued', 'running'].includes(item.status))) return;
  Object.assign(application, { title, description, status: 'submitting', stage: null, taskId: null, error: '', files: null, ats: null, warnings: null, downloads: {} });
  renderApplications();
  renderDocument();
  try {
    const data = await readResponse(await fetch(`${API_BASE}/api/generations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company: title, job_description: description, background_id: state.backgroundId }),
    }));
    if (typeof data.id !== 'string' || !data.id.trim()) throw new Error('The backend did not return a valid task ID.');
    application.taskId = data.id;
    application.status = data.status || 'queued';
    pollApplication(application);
  } catch (error) {
    application.status = 'Submission failed';
    application.error = `${error.message} Check that the backend is running at ${API_BASE} and allows this frontend origin.`;
  }
  renderApplications();
  if (selectedApplication === application) renderDocument();
});
function createApplication(label = $('#new-job-label').value) {
  if (!label?.trim()) return false;
  selectedApplication = { label: label.trim(), title: '', description: '', previewed: false };
  applications.unshift(selectedApplication);
  $('#job-form').reset();
  renderApplications();
  renderDocument();
  $('#job-title').focus();
  return true;
}
$('#new-job').addEventListener('click', () => {
  $('#new-job-error').textContent = '';
  $('#new-job-form').hidden = false;
  $('#new-job').setAttribute('aria-expanded', 'true');
  $('#new-job-label').focus();
});
function closeNewApplication() {
  $('#new-job-form').hidden = true;
  $('#new-job').setAttribute('aria-expanded', 'false');
  $('#new-job-label').value = '';
}
$('#new-job-form').addEventListener('submit', event => {
  event.preventDefault();
  if (createApplication()) closeNewApplication();
  else { $('#new-job-error').textContent = 'Please enter an application label.'; $('#new-job-label').focus(); }
});
$('#cancel-new-job').addEventListener('click', () => { closeNewApplication(); $('#new-job').focus(); });
$('#job-form').addEventListener('input', () => {
  if (!selectedApplication) return;
  Object.assign(selectedApplication, {
    title: $('#job-title').value,
    description: $('#job-description').value,
  });
  renderApplications();
  renderDocument();
});
$('#edit-profile').addEventListener('click', () => { if (window.workshop?.active) window.workshop.open('chest'); else location.hash = 'profile'; });
document.querySelectorAll('[data-document]').forEach((button) => button.addEventListener('click', () => {
  documentType = button.dataset.document;
  renderDocument();
}));
window.addEventListener('hashchange', showPage);
window.addEventListener('pagehide', () => {
  applications.forEach(application => { clearTimeout(application.timer); application.controller?.abort(); });
});
window.addEventListener('pageshow', () => {
  applications.filter(application => ['queued', 'running'].includes(application.status)).forEach(application => pollApplication(application));
});
renderApplications();
renderDocument();
showPage();
