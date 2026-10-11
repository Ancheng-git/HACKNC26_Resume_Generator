// Scene audio listens to existing interaction events; it never changes form or task state.
const music = document.querySelector('#eco-bgm');
const soundButton = document.querySelector('#eco-audio');
const effects = Object.fromEntries(['chest-open', 'chest-close', 'table', 'board', 'furnace', 'step-wood', 'step-grass'].map(name => {
  const audio = new Audio(new URL(`assets/audio/${name}.wav`, import.meta.url).href);
  audio.preload = 'none';
  return [name, audio];
}));
const playing = new Set();
let enabled = true, unlocked = false, chestOpen = false;
music.volume = 0.18;

function syncMusic() {
  if (enabled && unlocked && !document.hidden && music.getAttribute('src')) music.play().catch(() => {});
  else music.pause();
}
function unlock(event) {
  if (unlocked || !event.isTrusted) return;
  unlocked = true;
  syncMusic();
}
document.addEventListener('pointerdown', unlock, { capture: true });
document.addEventListener('keydown', unlock, { capture: true });

function playEffect(name) {
  if (!enabled || !unlocked || document.hidden || !effects[name]) return;
  const audio = effects[name].cloneNode();
  audio.volume = name.startsWith('step-') ? 0.18 : 0.45;
  playing.add(audio);
  const finished = () => playing.delete(audio);
  audio.addEventListener('ended', finished, { once: true });
  audio.addEventListener('error', finished, { once: true });
  audio.play().catch(finished);
}
function stopEffects() {
  playing.forEach(audio => audio.pause());
  playing.clear();
}
soundButton.addEventListener('click', () => {
  enabled = !enabled;
  soundButton.setAttribute('aria-pressed', String(enabled));
  soundButton.textContent = `Sound: ${enabled ? 'On' : 'Off'}`;
  if (!enabled) stopEffects();
  syncMusic();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopEffects();
  syncMusic();
});
document.addEventListener('workshop-chest', event => {
  const open = Boolean(event.detail.open);
  if (open !== chestOpen) playEffect(open ? 'chest-open' : 'chest-close');
  chestOpen = open;
});
document.addEventListener('workshop-panel', event => {
  if (event.detail.open && event.detail.kind !== 'chest') playEffect(event.detail.kind);
});

// Read the scene's existing position updates; footsteps never drive movement.
const footstepHost = document.querySelector('#eco-canvas');
let lastPosition = null, lastPhase = '', stepDistance = 0;
new MutationObserver(() => {
  const { phase, zone, position, controlsPaused } = footstepHost.dataset;
  const current = position?.split(',').map(Number);
  if (!current || current.length !== 3 || !current.every(Number.isFinite)) return;
  const walking = ['walking', 'entering', 'inside'].includes(phase) &&
    controlsPaused !== 'true' && !document.hidden && !document.querySelector('#eco-scene').hidden;
  const distance = lastPosition ? Math.hypot(current[0] - lastPosition[0], current[2] - lastPosition[2]) : 0;
  if (!walking || phase !== lastPhase || distance > 0.5) stepDistance = 0;
  else {
    stepDistance += distance;
    if (stepDistance >= Math.PI / 7) {
      const wood = phase === 'inside' ? zone === 'inside' : phase === 'entering' && current[1] >= 0.49;
      playEffect(wood ? 'step-wood' : 'step-grass');
      stepDistance %= Math.PI / 7;
    }
  }
  lastPosition = current;
  lastPhase = phase;
}).observe(footstepHost, { attributes: true, attributeFilter: ['data-position', 'data-phase', 'data-controls-paused'] });
