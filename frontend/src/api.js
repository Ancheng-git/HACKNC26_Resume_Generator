const API_BASE = 'http://127.0.0.1:8000';
// Presentation only: retain the backend contract and translate its current messages here.
const backendEnglish = {
  '\u65e0\u6548\u7684\u8bf7\u6c42\u957f\u5ea6。': 'The request length is invalid.',
  '\u4e0a\u4f20\u8bf7\u6c42\u4e0d\u80fd\u8d85\u8fc7 30 MB。': 'The upload request must not exceed 30 MB.',
  '\u4e0a\u4f20\u5185\u5bb9\u4e0d\u80fd\u4e3a\u7a7a。': 'The upload must not be empty.',
  '\u8d44\u6599\u5305\u4e0d\u5b58\u5728\u6216\u670d\u52a1\u5df2\u91cd\u542f，\u8bf7\u91cd\u65b0\u4e0a\u4f20。': 'Your materials are unavailable or the backend restarted. Please upload them again.',
  '\u8d44\u6599\u5305\u7f3a\u5c11\u672c\u4eba\u5934\u50cf，\u4e0d\u80fd\u751f\u6210\u4e09\u4efd\u6587\u6863；\u8bf7\u91cd\u65b0\u4e0a\u4f20\u5b8c\u6574\u8d44\u6599\u5305。': 'Your personal photo is missing. Upload a complete package before generating the three documents.',
  '\u6700\u591a\u4e0a\u4f20\u4e94\u4efd\u8865\u5145\u7ecf\u5386\u6587\u4ef6。': 'Upload at most five supporting files.',
  '\u6587\u6863\u4ec5\u652f\u6301 PDF、DOCX、DOC；\u7167\u7247\u4ec5\u652f\u6301 JPG、PNG。': 'Documents must be PDF, DOCX or DOC; photos must be JPG or PNG.',
  '\u6587\u6863\u6bcf\u4efd\u6700\u591a 10 MB，\u7167\u7247\u6700\u591a 5 MB。': 'Each document must be at most 10 MB and the photo at most 5 MB.',
  '\u4e0d\u80fd\u4e0a\u4f20\u7a7a\u6587\u4ef6。': 'Empty files cannot be uploaded.',
  'Word \u6587\u4ef6\u89e3\u538b\u540e\u8fc7\u5927。': 'The Word file is too large after decompression.',
  '\u4e0d\u63a5\u53d7\u542b\u5b8f\u7684 Word \u6587\u6863。': 'Word documents containing macros are not accepted.',
  'Word \u6587\u4ef6\u635f\u574f、\u52a0\u5bc6\u6216\u4e0d\u662f\u53ef\u8bfb\u53d6\u7684 DOCX。': 'The Word file is damaged, encrypted or not a readable DOCX.',
  '\u6587\u4ef6\u5185\u5bb9\u4e0d\u662f\u65e7\u7248 DOC。': 'The file content is not a legacy DOC document.',
  'DOC \u8f6c\u6362\u5931\u8d25\u6216\u8d85\u65f6，\u8bf7\u4e0a\u4f20 DOCX \u6216\u6587\u5b57\u578b PDF。': 'DOC conversion failed or timed out. Upload a DOCX or a text-based PDF instead.',
  '\u65e0\u6cd5\u5c06 DOC \u8f6c\u4e3a DOCX。': 'The DOC file could not be converted to DOCX.',
  'PDF \u6700\u591a\u63a5\u53d7 100 \u9875。': 'PDF files must contain at most 100 pages.',
  'PDF \u542b\u65e0\u6cd5\u63d0\u53d6\u6587\u5b57\u7684\u626b\u63cf\u9875，\u8bf7\u4e0a\u4f20\u53ef\u9009\u4e2d\u6587\u5b57\u7684\u7248\u672c。': 'The PDF contains scanned pages without extractable text. Upload a version with selectable text.',
  'PDF \u635f\u574f、\u52a0\u5bc6\u6216\u683c\u5f0f\u65e0\u6548。': 'The PDF is damaged, encrypted or invalid.',
  '\u5934\u50cf\u6587\u4ef6\u65e0\u6548\u6216\u5c3a\u5bf8\u8fc7\u5927。': 'The photo is invalid or its dimensions are too large.',
  '\u6587\u6863\u6ca1\u6709\u53ef\u8bfb\u53d6\u6587\u5b57，\u8bf7\u4e0a\u4f20\u6587\u5b57\u7248\u8d44\u6599。': 'The document has no readable text. Upload a text-based version.',
  '\u6587\u6863\u6587\u5b57\u91cf\u8fc7\u5927。': 'The document contains too much text.',
  '\u751f\u6210\u4e09\u4efd\u6587\u6863\u9700\u8981\u672c\u4eba\u5934\u50cf，\u8bf7\u91cd\u65b0\u4e0a\u4f20\u5305\u542b\u7167\u7247\u7684\u5b8c\u6574\u8d44\u6599\u5305。': 'A personal photo is required to generate the three documents. Upload a complete package including your photo.',
  '\u8bf7\u4f7f\u7528 multipart/form-data \u4e0a\u4f20\u6587\u4ef6。': 'Upload files using multipart/form-data.',
  '\u53ea\u63a5\u53d7 resume、background_files \u548c photo \u5b57\u6bb5。': 'Only the resume, background_files and photo upload fields are accepted.',
  '\u5fc5\u987b\u4e0a\u4f20\u4e00\u4efd\u4e3b\u7b80\u5386，\u5934\u50cf\u6700\u591a\u4e00\u5f20。': 'Upload exactly one resume and at most one personal photo.',
  '\u4e0a\u4f20\u5b57\u6bb5\u5fc5\u987b\u662f\u6587\u4ef6。': 'Upload fields must contain files.',
  '\u5df2\u6709\u4efb\u52a1\u8fd0\u884c\u4e2d，\u8bf7\u7a0d\u540e\u63d0\u4ea4。': 'A task is already running. Try submitting again later.',
  '\u4efb\u52a1\u4e0d\u5b58\u5728，\u6216\u670d\u52a1\u5df2\u91cd\u542f。': 'The task is unavailable or the backend restarted.',
  '\u4efb\u52a1\u6216\u7ecf\u8fc7\u9a8c\u8bc1\u7684\u6587\u4ef6\u4e0d\u5b58\u5728。': 'The task or validated file is unavailable.',
  '\u4efb\u52a1\u5c1a\u672a\u6210\u529f，\u6587\u4ef6\u4e0d\u53ef\u4e0b\u8f7d。': 'The task has not completed successfully. Files are not available for download.',
  '\u670d\u52a1\u5df2\u505c\u6b62，\u4efb\u52a1\u5df2\u7ec8\u6b62。': 'The backend stopped and the task was terminated.',
  '\u4efb\u52a1\u8d85\u65f6，\u5df2\u7ec8\u6b62\u751f\u6210\u8fdb\u7a0b。': 'The task timed out and the generation process was terminated.',
  '\u672c\u5730\u73af\u5883\u6216\u751f\u6210\u6587\u4ef6\u65e0\u6548；\u8bf7\u68c0\u67e5\u4efb\u52a1\u76ee\u5f55\u4e2d\u7684\u65e5\u5fd7\u548c\u4f9d\u8d56。': 'The local runtime or generated files are invalid. Check the task logs and dependencies.',
  '\u65e0\u6cd5\u542f\u52a8\u672c\u5730\u7a0b\u5e8f；\u8bf7\u68c0\u67e5 Claude Code、Python \u548c\u4f9d\u8d56\u8def\u5f84。': 'The local program could not start. Check Claude Code, Python and dependency paths.',
  '\u65e0\u6cd5\u786e\u8ba4 Claude Code \u767b\u5f55\u72b6\u6001，\u8bf7\u5728\u540c\u4e00\u7cfb\u7edf\u7528\u6237\u4e0b\u68c0\u67e5 claude auth status。': 'Claude Code authentication could not be confirmed. Check claude auth status using the same system user.',
  'Claude Code \u5c1a\u672a\u767b\u5f55；\u8bf7\u5728\u7ec8\u7aef\u8fd0\u884c claude \u5b8c\u6210\u767b\u5f55，\u518d\u63d0\u4ea4\u65b0\u4efb\u52a1。': 'Claude Code is not signed in. Run claude in a terminal to sign in before submitting a new task.',
  '\u7f3a\u5c11\u6838\u5fc3\u7b80\u5386\u6216\u7167\u7247，\u8bf7\u5148\u8865\u9f50 reference/ \u4e2d\u7684\u5fc5\u9700\u8d44\u6599。': 'The required resume or photo is missing. Complete the required materials in reference/ first.',
  'Claude Code \u6267\u884c\u5931\u8d25；\u8bf7\u68c0\u67e5\u4efb\u52a1\u76ee\u5f55\u4e2d\u7684 claude \u65e5\u5fd7、\u767b\u5f55\u548c\u5de5\u5177\u6743\u9650。': 'Claude Code execution failed. Check the task logs, authentication and tool permissions.',
  'Claude Code \u672a\u8fd4\u56de\u6709\u6548\u7684\u8fd0\u884c\u7ed3\u679c。': 'Claude Code did not return a valid result.',
  'Claude Code \u62a5\u544a\u5931\u8d25\u6216\u5de5\u5177\u6743\u9650\u4e0d\u8db3，\u672a\u53d1\u5e03\u6587\u4ef6。': 'Claude Code reported a failure or insufficient tool permissions. No files were published.',
  '\u7f3a\u5c11\u672c\u6b21\u4efb\u52a1\u6587\u4ef6，\u6216\u6587\u4ef6\u6307\u5411\u4efb\u52a1\u76ee\u5f55\u5916。': 'Task files are missing or point outside the task directory.',
  '\u7f3a\u5c11\u6700\u7ec8\u62a5\u544a。': 'The final report is missing.',
  '\u7f3a\u5c11\u4e0e\u6700\u7ec8\u6587\u4ef6\u5bf9\u5e94\u7684\u89c6\u89c9\u5ba1\u9605\u8bb0\u5f55。': 'The visual review record for the final files is missing.',
  '\u7f3a\u5c11\u672c\u6b21\u4efb\u52a1\u7684 PNG \u6392\u7248\u9884\u89c8。': 'The PNG layout previews for this task are missing.',
  '\u6700\u7ec8\u6587\u6863\u672a\u901a\u8fc7\u5355\u9875\u6216\u6587\u5b57\u5b8c\u6574\u6027\u68c0\u67e5；\u672a\u53d1\u5e03\u6587\u4ef6。': 'The final documents failed the single-page or text-integrity checks. No files were published.',
  'ATS \u68c0\u67e5\u65e0\u6cd5\u5b8c\u6210；\u672a\u53d1\u5e03\u6587\u4ef6。': 'The ATS check could not be completed. No files were published.',
  'ATS \u672a\u8fbe\u9608\u503c，\u4e14\u7f3a\u5c11\u4e09\u8f6e\u4fee\u6539\u540e\u7684\u771f\u5b9e\u7f3a\u53e3\u62a5\u544a。': 'The ATS threshold was not met and the report documenting remaining gaps after three revisions is missing.',
  'ATS \u672a\u8fbe\u9608\u503c；\u5de5\u4f5c\u6d41\u62a5\u544a\u5df2\u5b8c\u6210\u4e09\u8f6e\u4fee\u6539。\u8bf7\u5728\u672c\u5730 report.md \u67e5\u770b\u771f\u5b9e\u7f3a\u53e3，\u4e0d\u5e94\u7f16\u9020\u7ecf\u5386\u8865\u5206。': 'The ATS threshold was not met after three reported revisions. Review the remaining gaps in the local report.md; do not invent experience to raise the score.',
};
function englishMessage(value, fallback = 'The backend could not process this request. Please check your materials and try again.') {
  if (!value) return '';
  if (Array.isArray(value)) return value.map(item => englishMessage(item, fallback)).join(' · ');
  if (typeof value === 'object') return englishMessage(value.msg || value.message || value.detail || value.error, fallback) || fallback;
  const text = String(value);
  if (!/\p{Script=Han}/u.test(text)) return text;
  if (backendEnglish[text]) return backendEnglish[text];
  if (text.endsWith(' \u5df2\u63d0\u53d6\u6587\u5b57；\u591a\u680f\u987a\u5e8f\u53ef\u80fd\u53d8\u5316，\u539f\u6587\u4ef6\u5df2\u4fdd\u7559\u4f9b\u6838\u5bf9。')) return 'Text was extracted. Multi-column reading order may change; the original file is retained for comparison.';
  return fallback;
}
async function readResponse(response) {
  let data;
  try { data = await response.json(); }
  catch { throw new Error(`Backend returned an unreadable response (${response.status}).`); }
  if (!response.ok) {
    const hints = { 404: 'The resource is unavailable. If the backend restarted, upload your materials again.', 409: 'The backend is busy. Try again later.', 413: 'Files exceed the upload size limit.', 415: 'Unsupported file format.', 422: 'The files or required fields could not be processed.' };
    const detail = englishMessage(data.detail);
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

async function downloadGenerationFile(file) {
  const url = new URL(file.url, API_BASE);
  if (url.origin !== new URL(API_BASE).origin) throw new Error('The download URL does not belong to the backend.');
  const response = await fetch(url.href);
  if (!response.ok) await readResponse(response);
  const objectURL = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = objectURL;
  link.download = file.name || file.filename || 'application.docx';
  document.body.append(link);
  try { link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(objectURL), 1000); }
}
