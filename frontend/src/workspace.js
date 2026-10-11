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
  let source = document.querySelector('#job-source');
  if (!source) { source = document.createElement('p'); source.id = 'job-source'; $('#job-error').before(source); }
  source.textContent = selectedApplication?.company ? `Company: ${selectedApplication.company} · Imported from ${selectedApplication.source || 'JSearch'}. Title is the role name; review the full job description before generating.` : '';
  $('#document-status').textContent = selectedApplication ? taskText(selectedApplication) : 'Draft';
  const message = document.createElement('p');
  message.className = selectedApplication?.status === 'succeeded' || selectedApplication?.status === 'failed' ? 'document-result' : 'document-empty';
  message.textContent = selectedApplication?.error || (selectedApplication?.status === 'succeeded' ? 'Your documents are ready.' : 'Add a job description and generate your application.');
  preview.append(message);
  if (selectedApplication?.status === 'failed') renderFailure(preview, selectedApplication.failure);
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
    const imageFeedback = document.createElement('p');
    imageFeedback.className = 'document-preview-feedback';
    let previewURL;
    try { previewURL = file.preview_url ? new URL(file.preview_url, API_BASE) : null; } catch { previewURL = null; }
    if (previewURL?.origin === new URL(API_BASE).origin) {
      const image = document.createElement('img');
      image.className = 'document-page';
      image.alt = `${{resume: 'Professional resume', ats: 'ATS resume', letter: 'Professional cover letter'}[documentType]} — generated document preview`;
      image.decoding = 'async';
      image.addEventListener('error', () => { image.hidden = true; imageFeedback.textContent = 'Preview unavailable. You can still download the verified DOCX above.'; });
      image.src = previewURL.href;
      preview.append(image);
    } else {
      imageFeedback.textContent = 'Preview unavailable for this task. You can download the DOCX above.';
    }
    preview.append(imageFeedback);
  }
}

function renderFailure(preview, failure) {
  const section = document.createElement('section'); section.className = 'generation-feedback';
  const text = (tag, value) => { const node = document.createElement(tag); node.textContent = value; section.append(node); };
  text('h3', 'Why generation failed');
  text('p', failure?.summary || 'Detailed feedback is unavailable. Check the local backend task report and logs before retrying.');
  const checks = failure?.checks;
  if (checks && checks.composite_score != null) {
    text('p', `ATS score: ${checks.composite_score}/100 (required: 80) · Required keyword coverage: ${checks.must_have_pct ?? 'Unavailable'}% (required: 90%) · Recorded review passes: ${checks.revision_passes ?? 'Unavailable'}/3`);
  }
  text('h4', 'Report summary');
  if (failure?.report_summary?.length) {
    const list = document.createElement('ul');
    failure.report_summary.forEach(finding => { const item = document.createElement('li'); item.textContent = finding; list.append(item); });
    section.append(list);
    text('p', 'Report findings should be checked against your actual background; missing keywords do not automatically mean missing skills.');
  } else {
    text('p', failure?.report_available ? 'The report did not contain a usable gap summary.' : 'No workflow report was available for this task. The failure may have occurred before a report could be written.');
  }
  if (failure?.focus_areas?.length) {
    text('h4', 'Recommended next steps');
    const list = document.createElement('ul');
    failure.focus_areas.forEach(focus => {
      const item = document.createElement('li'), area = document.createElement('strong'), action = document.createElement('p');
      area.textContent = focus.area; action.textContent = focus.action;
      item.append(area, action); list.append(item);
    });
    section.append(list);
  }
  preview.append(section);
}

async function pollApplication(application) {
  if (application.polling) return;
  application.polling = true;
  const taskId = application.taskId;
  const previousStatus = application.status;
  const controller = new AbortController();
  application.controller = controller;
  try {
    const data = await readResponse(await fetch(`${API_BASE}/api/generations/${encodeURIComponent(taskId)}`, { signal: controller.signal }));
    if (controller.signal.aborted || application.taskId !== taskId) return;
    Object.assign(application, { status: data.status, stage: data.stage, files: data.files, ats: data.ats, warnings: data.warnings, failure: data.failure || null, error: data.error ? englishMessage(data.error, 'Generation failed. Check the backend task logs before trying again.') : '' });
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
  if (application.status !== previousStatus && ['succeeded', 'failed'].includes(application.status)) window.workshop?.completed?.(application);
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
  const company = application.company || title;
  const jobDescription = application.company ? `${title}\nCompany: ${company}\n\n${description}` : description;
  if (company.length > 120 || jobDescription.length > 50000) { $('#job-error').textContent = 'Company must be at most 120 characters and the complete job description at most 50,000 characters. Review the imported details.'; return; }
  if (application.taskId && application.status === 'Status unavailable') { pollApplication(application); return; }
  if (applications.some(item => ['submitting', 'queued', 'running'].includes(item.status))) return;
  Object.assign(application, { title, description, status: 'submitting', stage: null, taskId: null, error: '', files: null, ats: null, warnings: null, failure: null, downloads: {} });
  renderApplications();
  renderDocument();
  try {
    const data = await readResponse(await fetch(`${API_BASE}/api/generations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company, job_description: jobDescription, background_id: state.backgroundId }),
    }));
    if (typeof data.id !== 'string' || !data.id.trim()) throw new Error('The backend did not return a valid task ID.');
    application.taskId = data.id;
    application.status = data.status || 'queued';
    window.workshop?.generating?.();
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
function importJobApplication(job, generate = false) {
  createApplication(`${job.company} · ${job.title}`);
  Object.assign(selectedApplication, { company: job.company, title: job.title, description: job.description, source: job.source });
  $('#job-title').value = job.title;
  $('#job-description').value = job.description;
  window.workshop.open('table');
  renderApplications();
  renderDocument();
  // The existing submit handler still owns validation, locking, polling and downloads.
  if (generate) $('#job-form').requestSubmit();
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
