const $ = (selector) => document.querySelector(selector);
const state = { file: null, pendingFile: null, photo: null, pendingPhoto: null, supplements: [], pendingSupplements: Array(5).fill(null), open: false, backgroundId: null, uploading: false };
const chest = $('#chest-toggle');
const inventory = $('#inventory');
const fileInput = $('#file-input');
const startButton = $('#start-button');

for (let index = 0; index < 5; index++) {
  const label = document.createElement('label');
  label.className = 'chest-file-field';
  label.textContent = `Supporting file ${index + 1} · Optional`;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,.docx,.doc';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Clear';
  remove.setAttribute('aria-label', `Clear supporting file ${index + 1}`);
  input.addEventListener('change', () => { if (input.files.length) state.pendingSupplements[index] = input.files[0]; });
  remove.addEventListener('click', () => { input.value = ''; state.pendingSupplements[index] = null; });
  label.append(input, remove);
  $('#supplementary-files').append(label);
}
$('#photo-input').addEventListener('change', () => {
  const photo = $('#photo-input').files[0];
  if (!photo) return;
  if (!/\.(jpg|jpeg|png)$/i.test(photo.name)) {
    window.alert('Please select a JPG or PNG photo.');
    $('#photo-input').value = '';
    return;
  }
  state.pendingPhoto = photo;
  render();
});

function render() {
  $('#chest-count').textContent = state.file ? String(2 + state.supplements.length) : '0';
  $('#chest-count').hidden = !state.file;
  chest.classList.toggle('is-filled', Boolean(state.file));
  startButton.disabled = !state.backgroundId || state.uploading;
  $('#readiness').textContent = state.file && state.photo ? `${state.file.name} · Photo included · Uploaded` : 'Add your personal file and photo to get started.';
  $('#file-selection').textContent = state.pendingFile?.name || 'Choose one file or drop it here';
  $('#photo-selection').textContent = state.pendingPhoto?.name || 'Choose one photo';
}
function setChestOpen(open) {
  state.open = open;
  chest.classList.toggle('is-open', open);
  $('#chest-stage').classList.toggle('is-open', open);
  chest.setAttribute('aria-expanded', String(open));
  chest.setAttribute('aria-label', open ? 'Close your experience chest' : 'Open your experience chest');
  inventory.hidden = !open;
  $('#chest-open-label').textContent = open ? 'Close chest ×' : 'Open chest ↗';
  if (open) fileInput.focus();
}
function chooseFile(files) {
  if (files.length !== 1) { window.alert('Please choose exactly one personal file.'); return; }
  state.pendingFile = files[0];
  fileInput.value = '';
  render();
}
chest.addEventListener('click', () => setChestOpen(!state.open));
$('#chest-open-label').addEventListener('click', () => setChestOpen(!state.open));
fileInput.addEventListener('change', () => { if (fileInput.files.length) chooseFile(fileInput.files); });
const dropZone = $('#drop-zone');
['dragenter', 'dragover'].forEach((name) => dropZone.addEventListener(name, (event) => { event.preventDefault(); dropZone.classList.add('drag-over'); }));
['dragleave', 'drop'].forEach((name) => dropZone.addEventListener(name, (event) => { event.preventDefault(); dropZone.classList.remove('drag-over'); }));
dropZone.addEventListener('drop', (event) => chooseFile(event.dataTransfer.files));
$('#save-profile').addEventListener('click', async () => {
  if (state.uploading) return;
  const resume = state.pendingFile;
  const photo = state.pendingPhoto;
  const supplements = state.pendingSupplements.filter(Boolean);
  const button = $('#save-profile');
  try {
    validateUpload(resume, photo, supplements);
    state.uploading = true;
    button.disabled = true;
    button.textContent = 'Uploading…';
    $('#upload-status').textContent = 'Uploading and processing your materials…';
    $('#upload-warnings').textContent = '';
    render();
    const pack = await uploadBackground(resume, photo, supplements);
    $('#upload-warnings').textContent = Array.isArray(pack.warnings) ? pack.warnings.join(' · ') : pack.warnings ? JSON.stringify(pack.warnings) : '';
    if (!pack.ready_for_generation || !pack.background_id) throw new Error('These materials are not ready for generation. Upload a complete package with your photo.');
    Object.assign(state, { file: resume, photo, supplements, backgroundId: pack.background_id });
    $('#upload-status').textContent = 'Materials uploaded successfully.';
    setChestOpen(false);
    chest.focus();
    $('#readiness').textContent = 'Materials uploaded successfully.';
  } catch (error) {
    $('#upload-status').textContent = error.message;
  } finally {
    state.uploading = false;
    button.disabled = false;
    button.textContent = 'Save to chest ↗';
    render();
    if (!state.open && $('#upload-warnings').textContent) $('#readiness').textContent += ` · ${$('#upload-warnings').textContent}`;
  }
});
startButton.addEventListener('click', () => { if (!startButton.disabled) location.hash = 'workspace'; });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && state.open) { setChestOpen(false); chest.focus(); } });
render();
