// Scene audio listens to existing interaction events; it never changes form or task state.
const music = document.querySelector('#eco-bgm');
const soundButton = document.querySelector('#eco-audio');
const effects = Object.fromEntries(['chest-open', 'chest-close', 'table', 'board', 'furnace'].map(name => {
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
  audio.volume = 0.45;
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
