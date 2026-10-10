const applications = [];
let selectedApplication = null;
let documentType = 'resume';

function showPage() {
  const workspaceOpen = location.hash === '#workspace';
  document.querySelector('.page-shell').hidden = workspaceOpen;
  $('#workspace').hidden = !workspaceOpen;
  document.body.style.overflow = '';
  if (workspaceOpen) {
    if (!applications.length) {
      selectedApplication = { label: 'default', title: '', description: '' };
      applications.push(selectedApplication);
      renderApplications();
      renderDocument();
    }
    $('#profile-summary').textContent = state.file ? `${state.file.name}${state.photo ? ' · Photo included' : ''} · ${state.supplements?.length || 0} supporting file(s)` : 'No saved personal file';
    $('#job-title').focus();
  }
}

function renderApplications() {
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
    status.textContent = `◇ ${application.status || 'Draft'}`;
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
}

function renderDocument() {
  const preview = $('#document-preview');
  preview.replaceChildren();
  document.querySelectorAll('[data-document]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.document === documentType)));
  $('#application-title').textContent = selectedApplication ? selectedApplication.label : 'Where will your story go next?';
  $('#document-status').textContent = selectedApplication?.status || 'Draft';
  const message = document.createElement('p');
  message.className = 'document-empty';
  message.textContent = selectedApplication?.error || (selectedApplication?.status === 'succeeded' ? 'Your documents are ready.' : 'Add a job description and generate your application.');
  preview.append(message);
  if (selectedApplication?.warnings) {
    const warning = document.createElement('p');
    warning.textContent = JSON.stringify(selectedApplication.warnings);
    preview.append(warning);
  }
  const fileType = { resume: 'professional_resume', ats: 'ats_resume', letter: 'professional_cover_letter' }[documentType];
  const files = selectedApplication?.files;
  const file = Array.isArray(files) ? files.find((entry) => entry.type === fileType || entry.kind === fileType) : files?.[fileType];
  if (file?.url) {
    const url = new URL(file.url, API_BASE);
    if (url.origin !== new URL(API_BASE).origin) return;
    const link = document.createElement('a');
    link.href = url.href;
    link.textContent = `Download ${file.filename || fileType}`;
    preview.append(link);
  }
}

async function pollApplication(application) {
  try {
    const data = await readResponse(await fetch(`${API_BASE}/api/generations/${encodeURIComponent(application.taskId)}`));
    Object.assign(application, { status: data.status, files: data.files, warnings: data.warnings, error: data.error ? (typeof data.error === 'string' ? data.error : JSON.stringify(data.error)) : '' });
    if (application.status === 'queued' || application.status === 'running') setTimeout(() => pollApplication(application), 2000);
  } catch (error) {
    application.status = 'Status unavailable';
    application.error = `${error.message} The task may still be running. Click Generate to check its status again.`;
  }
  renderApplications();
  if (selectedApplication === application) renderDocument();
}

$('#job-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = $('#job-title').value.trim();
  const description = $('#job-description').value.trim();
  if (!description) { window.alert('Please add a job description before generating.'); $('#job-description').focus(); return; }
  if (!title) { window.alert('Please add a job title.'); $('#job-title').focus(); return; }
  if (!state.backgroundId) { window.alert('Upload your personal materials before generating.'); return; }
  if (!selectedApplication && !createApplication()) return;
  const application = selectedApplication;
  if (application.taskId && application.status === 'Status unavailable') { application.status = 'running'; pollApplication(application); return; }
  if (['submitting', 'queued', 'running'].includes(application.status)) return;
  Object.assign(application, { title, description, status: 'submitting', error: '', files: null, warnings: null });
  renderApplications();
  renderDocument();
  try {
    const data = await readResponse(await fetch(`${API_BASE}/api/generations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company: title, job_description: description, background_id: state.backgroundId }),
    }));
    if (!data.id) throw new Error('The backend did not return a task ID.');
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
function createApplication() {
  const label = window.prompt('Name this application (e.g. Figma — Frontend Engineer)');
  if (!label?.trim()) return false;
  selectedApplication = { label: label.trim(), title: '', description: '', previewed: false };
  applications.unshift(selectedApplication);
  $('#job-form').reset();
  renderApplications();
  renderDocument();
  $('#job-title').focus();
  return true;
}
$('#new-job').addEventListener('click', createApplication);
$('#job-form').addEventListener('input', () => {
  if (!selectedApplication) return;
  Object.assign(selectedApplication, {
    title: $('#job-title').value,
    description: $('#job-description').value,
  });
  renderApplications();
  renderDocument();
});
$('#edit-profile').addEventListener('click', () => { location.hash = 'profile'; });
document.querySelectorAll('[data-document]').forEach((button) => button.addEventListener('click', () => {
  documentType = button.dataset.document;
  renderDocument();
}));
window.addEventListener('hashchange', showPage);
renderApplications();
renderDocument();
showPage();
