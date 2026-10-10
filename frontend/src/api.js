const API_BASE = 'http://127.0.0.1:8000';
// Presentation only: retain the backend contract and translate its current messages here.
const backendEnglish = {
  '无效的请求长度。': 'The request length is invalid.',
  '上传请求不能超过 30 MB。': 'The upload request must not exceed 30 MB.',
  '上传内容不能为空。': 'The upload must not be empty.',
  '资料包不存在或服务已重启，请重新上传。': 'Your materials are unavailable or the backend restarted. Please upload them again.',
  '资料包缺少本人头像，不能生成三份文档；请重新上传完整资料包。': 'Your personal photo is missing. Upload a complete package before generating the three documents.',
  '最多上传五份补充经历文件。': 'Upload at most five supporting files.',
  '文档仅支持 PDF、DOCX、DOC；照片仅支持 JPG、PNG。': 'Documents must be PDF, DOCX or DOC; photos must be JPG or PNG.',
  '文档每份最多 10 MB，照片最多 5 MB。': 'Each document must be at most 10 MB and the photo at most 5 MB.',
  '不能上传空文件。': 'Empty files cannot be uploaded.',
  'Word 文件解压后过大。': 'The Word file is too large after decompression.',
  '不接受含宏的 Word 文档。': 'Word documents containing macros are not accepted.',
  'Word 文件损坏、加密或不是可读取的 DOCX。': 'The Word file is damaged, encrypted or not a readable DOCX.',
  '文件内容不是旧版 DOC。': 'The file content is not a legacy DOC document.',
  'DOC 转换失败或超时，请上传 DOCX 或文字型 PDF。': 'DOC conversion failed or timed out. Upload a DOCX or a text-based PDF instead.',
  '无法将 DOC 转为 DOCX。': 'The DOC file could not be converted to DOCX.',
  'PDF 最多接受 100 页。': 'PDF files must contain at most 100 pages.',
  'PDF 含无法提取文字的扫描页，请上传可选中文字的版本。': 'The PDF contains scanned pages without extractable text. Upload a version with selectable text.',
  'PDF 损坏、加密或格式无效。': 'The PDF is damaged, encrypted or invalid.',
  '头像文件无效或尺寸过大。': 'The photo is invalid or its dimensions are too large.',
  '文档没有可读取文字，请上传文字版资料。': 'The document has no readable text. Upload a text-based version.',
  '文档文字量过大。': 'The document contains too much text.',
  '生成三份文档需要本人头像，请重新上传包含照片的完整资料包。': 'A personal photo is required to generate the three documents. Upload a complete package including your photo.',
  '请使用 multipart/form-data 上传文件。': 'Upload files using multipart/form-data.',
  '只接受 resume、background_files 和 photo 字段。': 'Only the resume, background_files and photo upload fields are accepted.',
  '必须上传一份主简历，头像最多一张。': 'Upload exactly one resume and at most one personal photo.',
  '上传字段必须是文件。': 'Upload fields must contain files.',
  '已有任务运行中，请稍后提交。': 'A task is already running. Try submitting again later.',
  '任务不存在，或服务已重启。': 'The task is unavailable or the backend restarted.',
  '任务或经过验证的文件不存在。': 'The task or validated file is unavailable.',
  '任务尚未成功，文件不可下载。': 'The task has not completed successfully. Files are not available for download.',
  '服务已停止，任务已终止。': 'The backend stopped and the task was terminated.',
  '任务超时，已终止生成进程。': 'The task timed out and the generation process was terminated.',
  '本地环境或生成文件无效；请检查任务目录中的日志和依赖。': 'The local runtime or generated files are invalid. Check the task logs and dependencies.',
  '无法启动本地程序；请检查 Claude Code、Python 和依赖路径。': 'The local program could not start. Check Claude Code, Python and dependency paths.',
  '无法确认 Claude Code 登录状态，请在同一系统用户下检查 claude auth status。': 'Claude Code authentication could not be confirmed. Check claude auth status using the same system user.',
  'Claude Code 尚未登录；请在终端运行 claude 完成登录，再提交新任务。': 'Claude Code is not signed in. Run claude in a terminal to sign in before submitting a new task.',
  '缺少核心简历或照片，请先补齐 reference/ 中的必需资料。': 'The required resume or photo is missing. Complete the required materials in reference/ first.',
  'Claude Code 执行失败；请检查任务目录中的 claude 日志、登录和工具权限。': 'Claude Code execution failed. Check the task logs, authentication and tool permissions.',
  'Claude Code 未返回有效的运行结果。': 'Claude Code did not return a valid result.',
  'Claude Code 报告失败或工具权限不足，未发布文件。': 'Claude Code reported a failure or insufficient tool permissions. No files were published.',
  '缺少本次任务文件，或文件指向任务目录外。': 'Task files are missing or point outside the task directory.',
  '缺少最终报告。': 'The final report is missing.',
  '缺少与最终文件对应的视觉审阅记录。': 'The visual review record for the final files is missing.',
  '缺少本次任务的 PNG 排版预览。': 'The PNG layout previews for this task are missing.',
  '最终文档未通过单页或文字完整性检查；未发布文件。': 'The final documents failed the single-page or text-integrity checks. No files were published.',
  'ATS 检查无法完成；未发布文件。': 'The ATS check could not be completed. No files were published.',
  'ATS 未达阈值，且缺少三轮修改后的真实缺口报告。': 'The ATS threshold was not met and the report documenting remaining gaps after three revisions is missing.',
  'ATS 未达阈值；工作流报告已完成三轮修改。请在本地 report.md 查看真实缺口，不应编造经历补分。': 'The ATS threshold was not met after three reported revisions. Review the remaining gaps in the local report.md; do not invent experience to raise the score.',
};
function englishMessage(value, fallback = 'The backend could not process this request. Please check your materials and try again.') {
  if (!value) return '';
  if (Array.isArray(value)) return value.map(item => englishMessage(item, fallback)).join(' · ');
  if (typeof value === 'object') return englishMessage(value.msg || value.message || value.detail || value.error, fallback) || fallback;
  const text = String(value);
  if (!/\p{Script=Han}/u.test(text)) return text;
  if (backendEnglish[text]) return backendEnglish[text];
  if (text.endsWith(' 已提取文字；多栏顺序可能变化，原文件已保留供核对。')) return 'Text was extracted. Multi-column reading order may change; the original file is retained for comparison.';
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
