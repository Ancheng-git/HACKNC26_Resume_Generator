// Record only this frontend tab, including its DOM panels and tab audio.
const button = document.querySelector('#eco-record');
const status = document.querySelector('#eco-record-status');
const handle = crypto.randomUUID();
let recorder = null, capture = null;

function release() {
  capture?.getTracks().forEach(track => track.stop());
  capture = null;
  recorder = null;
  button.disabled = false;
  button.textContent = 'Start recording';
  button.setAttribute('aria-pressed', 'false');
}
function stopRecording() {
  if (recorder && recorder.state !== 'inactive') {
    button.disabled = true;
    button.textContent = 'Saving recording…';
    recorder.stop();
  }
}
function isThisTab(track) {
  const identity = track.getCaptureHandle?.();
  return track.getSettings().displaySurface === 'browser' &&
    identity?.origin === location.origin && identity.handle === handle;
}

button.addEventListener('click', async () => {
  if (recorder) { stopRecording(); return; }
  button.disabled = true;
  try {
    if (!navigator.mediaDevices?.getDisplayMedia || !navigator.mediaDevices.setCaptureHandleConfig ||
        !globalThis.MediaRecorder) throw new Error('Use Chrome or Edge to record this page.');
    navigator.mediaDevices.setCaptureHandleConfig({ handle, exposeOrigin: true, permittedOrigins: [location.origin] });
    status.textContent = 'Choose This Tab (MineJob) and share tab audio.';
    capture = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser', frameRate: 30 },
      audio: { suppressLocalAudioPlayback: false },
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      monitorTypeSurfaces: 'exclude',
      surfaceSwitching: 'exclude',
      systemAudio: 'exclude',
    });
    const track = capture.getVideoTracks()[0];
    if (!track || !isThisTab(track)) throw new Error('Choose this MineJob tab. Screens, windows and other tabs are not recorded.');
    const mimeType = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
    recorder = new MediaRecorder(capture, mimeType ? { mimeType } : {});
    const chunks = [];
    recorder.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data); });
    recorder.addEventListener('stop', () => {
      const type = recorder.mimeType || mimeType || 'video/webm';
      release();
      if (!chunks.length) { status.textContent = 'No video was recorded. Try again.'; return; }
      const url = URL.createObjectURL(new Blob(chunks, { type }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `minejob-${new Date().toISOString().replace(/[:.]/g, '-')}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      status.textContent = 'Recording downloaded.';
    }, { once: true });
    recorder.addEventListener('error', () => { status.textContent = 'Recording interrupted. Stop to save the available video.'; stopRecording(); });
    track.addEventListener('ended', stopRecording, { once: true });
    track.addEventListener('capturehandlechange', () => { if (!isThisTab(track)) stopRecording(); });
    recorder.start(1000);
    button.disabled = false;
    button.textContent = 'Stop recording';
    button.setAttribute('aria-pressed', 'true');
    status.textContent = capture.getAudioTracks().length ? 'Recording this page with tab audio.' : 'Recording this page (video only).';
  } catch (error) {
    release();
    status.textContent = error.name === 'NotAllowedError' ? 'Recording cancelled.' : error.message || 'Could not start recording. Try again.';
  }
});
window.addEventListener('pagehide', stopRecording);
