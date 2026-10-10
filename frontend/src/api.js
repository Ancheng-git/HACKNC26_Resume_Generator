const API_BASE = 'http://127.0.0.1:8000';
async function readResponse(response) {
  let data;
  try { data = await response.json(); }
  catch { throw new Error(`Backend returned an unreadable response (${response.status}).`); }
  if (!response.ok) {
    const hints = { 404: 'The resource is unavailable. If the backend restarted, upload your materials again.', 409: 'The backend is busy. Try again later.', 413: 'Files exceed the upload size limit.', 415: 'Unsupported file format.', 422: 'The files or required fields could not be processed.' };
    const detail = typeof data.detail === 'string' ? data.detail : data.detail ? JSON.stringify(data.detail) : '';
    throw new Error([hints[response.status] || `Request failed (${response.status}).`, detail].filter(Boolean).join(' '));
  }
  return data;
}
function validateUpload(resume, photo, supplements) {
  const documents = [resume, ...supplements];
  if (!resume || !photo) throw new Error('Choose a resume and a personal photo before saving.');
  if (supplements.length > 5) throw new Error('Choose at most five supporting files.');
  if (documents.some((file) => !/\.(pdf|docx|doc)$/i.test(file.name))) throw new Error('Resume and supporting files must be PDF, DOCX or DOC.');
  if (!/\.(jpg|jpeg|png)$/i.test(photo.name)) throw new Error('Your photo must be JPG or PNG.');
  if (documents.some((file) => file.size > 10 * 1024 * 1024)) throw new Error('Each document must be at most 10 MB.');
  if (photo.size > 5 * 1024 * 1024) throw new Error('Your photo must be at most 5 MB.');
  if ([...documents, photo].reduce((sum, file) => sum + file.size, 0) > 30 * 1024 * 1024) throw new Error('Total file size must be at most 30 MB.');
}
async function uploadBackground(resume, photo, supplements) {
  validateUpload(resume, photo, supplements);
  const form = new FormData();
  form.append('resume', resume);
  supplements.forEach((file) => form.append('background_files', file));
  form.append('photo', photo);
  return readResponse(await fetch(`${API_BASE}/api/backgrounds`, { method: 'POST', body: form }));
}
