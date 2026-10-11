import { outdoorRoute, Journey, introWalkSpeed } from './journey.js';
import { IslandNavigation, interactionPoints, doorway, islandTiles, islandBounds, waterTiles, groundKind, scenery, floorHeight, gaits, lakes, dogSpot } from './room-navigation.js';
const options = new URLSearchParams(location.search);
let lowQuality = options.get('quality') === 'low';

const host = document.querySelector('#eco-canvas');
const status = document.querySelector('#eco-status');
const motionButton = document.querySelector('#eco-motion');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

try {
  const [THREE, { RoomEnvironment }] = await Promise.all([
    import('three'), import('./vendor/RoomEnvironment.js'),
  ]);
  if (options.get('view') === '2d') throw new Error('Form mode selected');
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(lowQuality ? 1 : Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = !lowQuality;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.75;
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#3d9ae8');
  scene.fog = new THREE.Fog('#3d9ae8', 32, 85);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environmentIntensity = 0.45;
  scene.add(new THREE.HemisphereLight('#e0faff', '#729e74', 1.0));
  const sun = new THREE.DirectionalLight('#fff0cf', 3.2);
  sun.position.set(-9, 15, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 0.5, far: 40 });
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.0002;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  // The same 26x26 shadow area follows the character, re-centred in whole steps, so island edges keep shadows.
  const shadowCenter = new THREE.Vector3(0, 0, 0);

  const camera = new THREE.OrthographicCamera(-12, 12, 8, -8, 0.1, 150);
  const target = new THREE.Vector3(0, 0.8, 0);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  // Opaque block surfaces name their material kind explicitly ("kind #tint"); the colour is only a palette tint.
  // Each kind draws an original 16x16 pixel texture. uv: tile = 16 px per world unit, fit = once per face,
  // row = once vertically and repeated horizontally to keep pixels square.
  const each = fn => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) fn(x, y); };
  const speck = (r, amp, darkP, dark, lightP, light) => { const d = r(); return (1 + (r() - 0.5) * 2 * amp) * (d < darkP ? dark : d > 1 - lightP ? light : 1); };
  const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const steel = [190, 200, 202], soot = [62, 70, 68];
  const kinds = {
    plain: { tint: '#ffffff', uv: 'fit', draw: ({ put, r, c }) => each((x, y) => put(x, y, c, speck(r, 0.04, 0, 1, 0, 1))) },
    grass_top: { tint: '#6cc21c', uv: 'tile', draw: ({ put, r, c }) => each((x, y) => put(x, y, c, speck(r, 0.12, 0.14, 0.76, 0.08, 1.13))) },
    dirt: { tint: '#9e805a', uv: 'tile', draw: ({ put, r, c }) => each((x, y) => put(x, y, c, speck(r, 0.12, 0.18, 0.7, 0.08, 1.18))) },
    grass_side: { tint: '#6cc21c', uv: 'tile', draw: api => {
      kinds.dirt.draw({ ...api, c: rgb(kinds.dirt.tint) });
      for (let x = 0; x < 16; x++) {
        const fringe = 3 + (api.r() < 0.55) + (api.r() < 0.25);
        for (let y = 0; y < fringe; y++) api.put(x, y, api.c, speck(api.r, 0.1, 0.14, 0.8, 0.08, 1.1));
        if (api.r() < 0.3) api.put(x, fringe, api.c, 0.78);
      }
    } },
    sand: { tint: '#e3d3a4', uv: 'tile', draw: ({ put, r, c }) => each((x, y) => put(x, y, c, speck(r, 0.05, 0.12, 0.9, 0.1, 1.06))) },
    oak_log_side: { tint: '#9a7450', uv: 'tile', draw: ({ put, r, c }) => {
      const column = []; for (let x = 0; x < 16; x++) column[x] = x % 3 === 0 ? 0.8 + r() * 0.12 : 0.95 + r() * 0.12;
      each((x, y) => put(x, y, c, column[x] * (1 + (r() - 0.5) * 0.08) * (r() < 0.05 ? 0.75 : 1)));
    } },
    oak_log_end: { tint: '#9a7450', uv: 'fit', draw: ({ put, r, c }) => {
      const wood = c.map(v => v * 1.45);
      each((x, y) => {
        const ring = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        put(x, y, ring > 6.5 ? c : wood, (ring > 6.5 ? 0.9 : Math.floor(ring) % 2 ? 0.86 : 1) * (1 + (r() - 0.5) * 0.06));
      });
    } },
    oak_planks: { tint: '#c9a46e', uv: 'tile', draw: ({ put, r, c }) => each((x, y) => {
      const plank = y >> 2;
      put(x, y, c, y % 4 === 3 ? 0.74 : x === (plank * 7 + 3) % 16 ? 0.8 : (1 + (r() - 0.5) * 0.1) * (r() < 0.08 ? 0.9 : 1));
    }) },
    leaves: { tint: '#6aa94d', uv: 'tile', draw: ({ put, r, c }) => each((x, y) => put(x, y, c, speck(r, 0.12, 0.2, 0.68, 0.1, 1.15))) },
    stone: { tint: '#a9b0ab', uv: 'tile', draw: ({ put, r, c }) => each((x, y) => put(x, y, c, speck(r, 0.06, 0.16, 0.86, 0.08, 1.08))) },
    cobblestone: { tint: '#929d98', uv: 'tile', draw: ({ put, r, c }) => {
      const stones = Array.from({ length: 8 }, () => [r() * 16, r() * 16, 0.84 + r() * 0.28]);
      each((x, y) => {
        const d = stones.map(([sx, sy]) => Math.hypot(Math.min(Math.abs(x - sx), 16 - Math.abs(x - sx)), Math.min(Math.abs(y - sy), 16 - Math.abs(y - sy))));
        const order = d.map((_, i) => i).sort((a, b) => d[a] - d[b]);
        put(x, y, c, d[order[1]] - d[order[0]] < 1.1 ? 0.62 : stones[order[0]][2] * (1 + (r() - 0.5) * 0.08));
      });
    } },
    metal: { tint: '#c4cfcb', uv: 'tile', draw: ({ put, r, c }) => {
      const row = []; for (let y = 0; y < 16; y++) row[y] = y === 0 ? 1.08 : y === 15 ? 0.86 : 0.94 + r() * 0.1;
      each((x, y) => put(x, y, c, row[y] * (1 + (r() - 0.5) * 0.04)));
    } },
    // Crafting table: a reddish plank top with a 3x3 grid and pale corners; oak sides framed by dark posts
    // under a reddish band, with a saw and hammer on the front and tongs on the ends.
    crafting_top: { tint: '#a05b3c', uv: 'fit', draw: ({ put, r, c }) => each((x, y) => {
      const edge = x === 0 || y === 0 || x === 15 || y === 15, line = [3, 6, 9, 12].includes(x) && y >= 3 && y <= 12 || [3, 6, 9, 12].includes(y) && x >= 3 && x <= 12;
      if ((x < 2 || x > 13) && (y < 2 || y > 13)) put(x, y, [226, 196, 140], 1 + (r() - 0.5) * 0.08);
      else if (edge || line) put(x, y, [84, 44, 28], 1 + (r() - 0.5) * 0.1);
      else if (x > 3 && x < 12 && y > 3 && y < 12) put(x, y, [190, 112, 74], (y % 3 === 2 ? 0.9 : 1) * (1 + (r() - 0.5) * 0.08));
      else put(x, y, c, (y % 4 === 3 ? 0.82 : 1) * (1 + (r() - 0.5) * 0.08));
    }) },
    crafting_side: { tint: '#b48c58', uv: 'fit', draw: api => {
      const { put, r, c } = api;
      each((x, y) => {
        if (x < 2 || x > 13) put(x, y, [62, 42, 24], x === 1 || x === 14 ? 1.2 : 1);
        else if (y < 3) put(x, y, y === 2 ? [96, 50, 32] : [146, 76, 50], 1 + (r() - 0.5) * 0.1);
        else put(x, y, c, (y % 4 === 2 ? 0.76 : 1) * (1 + (r() - 0.5) * 0.08));
      });
      if (api.front) {
        for (let y = 4; y <= 8; y++) put(4, y, [58, 38, 22]); // saw: handle and pale blade
        for (let y = 9; y <= 12; y++) { put(4, y, [214, 220, 222]); put(5, y, [176, 184, 188]); }
        for (const [x, y] of [[8, 4], [9, 4], [10, 4], [8, 5], [10, 5], [9, 6], [9, 7], [9, 8], [9, 9]]) put(x, y, [58, 38, 22]); // hammer
        for (let y = 10; y <= 13; y++) { put(9, y, [236, 238, 236]); if (y > 10) put(10, y, [200, 204, 206]); }
      } else {
        for (let y = 5; y <= 9; y++) { put(6, y, [58, 38, 22]); put(9, y, [58, 38, 22]); } // tongs
        for (let y = 10; y <= 12; y++) { put(6, y, [196, 202, 206]); put(9, y, [196, 202, 206]); }
        put(7, 9, [58, 38, 22]); put(8, 9, [58, 38, 22]);
      }
    } },
    crafting_front: { tint: '#b48c58', uv: 'fit', draw: api => kinds.crafting_side.draw({ ...api, front: true }) },
    chest_side: { tint: '#b8894f', uv: 'fit', draw: api => {
      kinds.oak_planks.draw(api);
      each((x, y) => { if (x % 15 === 0 || y % 15 === 0) api.mul(x, y, 0.42); else if (x % 13 === 1 || y % 13 === 1) api.mul(x, y, 0.8); });
    } },
    // Glass keeps a crisp pale frame and two corner glints; the pane itself is a faint aqua tint.
    glass: { tint: '#c9f5ee', uv: 'tile', draw: ({ put, c }) => each((x, y) => {
      if (x % 15 === 0 || y % 15 === 0) put(x, y, [246, 255, 253], 1, 225);
      else if ((x + y === 5 || x + y === 6) && x > 1 && y > 1 || (x + y === 21 || x + y === 22) && x > 9 && y > 9 || x + y === 8 && x > 3 && y > 3) put(x, y, [255, 255, 255], 1, 150);
      else put(x, y, c, 1, 34);
    }) },
    mossy_cobblestone: { tint: '#929d98', uv: 'tile', draw: api => {
      kinds.cobblestone.draw(api);
      each((x, y) => { if (api.r() < 0.28 + (y < 5) * 0.3) api.put(x, y, [104, 150, 72], 0.85 + api.r() * 0.3); });
    } },
    birch_log_side: { tint: '#e8e4d8', uv: 'tile', draw: ({ put, r, c }) => {
      each((x, y) => put(x, y, c, 0.94 + r() * 0.1));
      for (let i = 0; i < 6; i++) { const y = Math.floor(r() * 16), x0 = Math.floor(r() * 12), w = 2 + Math.floor(r() * 4); for (let x = x0; x < x0 + w; x++) put(x % 16, y, [52, 52, 48], 1 + (r() - 0.5) * 0.2); }
    } },
    hay_side: { tint: '#d9b544', uv: 'fit', draw: ({ put, r, c }) => each((x, y) => put(x, y, c, (x % 3 === 0 ? 0.86 : 1.02) * (1 + (r() - 0.5) * 0.1) * (y === 3 || y === 12 ? 0.55 : 1))) },
    hay_top: { tint: '#d9b544', uv: 'fit', draw: ({ put, r, c }) => each((x, y) => {
      const ring = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      put(x, y, c, (Math.floor(ring) % 2 ? 0.9 : 1.03) * (1 + (r() - 0.5) * 0.12) * (x === 3 || x === 12 ? 0.55 : 1));
    }) },
    pumpkin_side: { tint: '#e08a2a', uv: 'fit', draw: ({ put, r, c }) => each((x, y) => put(x, y, c, ([0, 4, 8, 12].includes(x) ? 0.78 : 1) * (1 + (r() - 0.5) * 0.1) * (y === 0 ? 0.85 : 1))) },
    pumpkin_top: { tint: '#e08a2a', uv: 'fit', draw: ({ put, r, c }) => each((x, y) => {
      if (x >= 7 && x <= 8 && y >= 7 && y <= 8) put(x, y, [92, 116, 52], 1);
      else put(x, y, c, (Math.abs(x - 7.5) < 1.6 || Math.abs(y - 7.5) < 1.6 ? 0.82 : 1) * (1 + (r() - 0.5) * 0.1));
    }) },
    melon_side: { tint: '#6aa83b', uv: 'fit', draw: ({ put, r, c }) => each((x, y) => put(x, y, c, (x % 4 < 2 ? 0.78 : 1.08) * (1 + (r() - 0.5) * 0.12))) },
    melon_top: { tint: '#6aa83b', uv: 'fit', draw: ({ put, r, c }) => each((x, y) => put(x, y, c, (Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) > 6.5 ? 0.75 : 1.02) * (1 + (r() - 0.5) * 0.16))) },
    books: { tint: '#c9a46e', uv: 'fit', draw: api => {
      kinds.oak_planks.draw(api);
      const colors = [[176, 64, 56], [60, 110, 160], [86, 140, 74], [212, 180, 98], [120, 82, 150], [60, 150, 150]];
      for (const top of [2, 9]) for (let x = 1; x < 15;) {
        const w = 1 + Math.floor(api.r() * 2), color = colors[Math.floor(api.r() * colors.length)], h = 5 - Math.floor(api.r() * 2);
        for (let dx = 0; dx < w && x < 15; dx++, x++) for (let y = top + 5 - h; y < top + 5; y++) api.put(x, y, color, (dx ? 0.85 : 1) * (y === top + 5 - h ? 1.15 : 1));
        x++;
      }
    } },
    wool: { tint: '#c94b4b', uv: 'tile', draw: ({ put, r, c }) => each((x, y) => put(x, y, c, ((x * 3 + y * 5) % 7 < 2 ? 0.9 : 1.02) * (1 + (r() - 0.5) * 0.06))) },
    sign: { tint: '#c9a46e', uv: 'row', draw: api => {
      kinds.oak_planks.draw(api);
      each((x, y) => { if (y === 0 || y === 15) api.mul(x, y, 0.55); });
      for (const y of [4, 7, 10]) for (let x = 2; x < 14;) { const w = 1 + Math.floor(api.r() * 4); for (let i = 0; i < w && x < 14; i++, x++) api.put(x, y, [58, 40, 24], 1); x += 1; }
    } },
    painting: { tint: '#7cc7e8', uv: 'fit', draw: ({ put, r, c }) => each((x, y) => {
      // An original pixel landscape: sky, sun, two hills and a lake, framed in dark wood.
      if (x % 15 === 0 || y % 15 === 0) return put(x, y, [92, 64, 38], 1);
      const hill = y > 9 - Math.round(2.5 * Math.sin(x * 0.55)) - (x > 8 ? 1 : 0);
      if (Math.hypot(x - 11, y - 4) < 1.8) put(x, y, [255, 236, 150], 1);
      else if (y > 12) put(x, y, [70, 150, 190], 1 + (r() - 0.5) * 0.1);
      else if (hill) put(x, y, [102, 170, 82], 0.9 + r() * 0.2);
      else put(x, y, c, 1 + (y - 7) * 0.025);
    }) },
    furnace_top: { tint: '#a7b5a9', uv: 'fit', draw: api => {
      kinds.stone.draw(api);
      each((x, y) => { if (x % 15 === 0 || y % 15 === 0) api.mul(x, y, 0.8); });
    } },
    furnace_front: { tint: '#85958e', uv: 'fit', draw: api => {
      kinds.cobblestone.draw(api);
      each((x, y) => {
        if (x < 2 || x > 13 || y < 2) api.put(x, y, api.c, 1.12 * (1 + (api.r() - 0.5) * 0.05));
        else if (y === 6 && x > 2 && x < 13) api.mul(x, y, 0.62);
        else if (y > 6 && x > 2 && x < 13) api.put(x, y, soot, 1 + (api.r() - 0.5) * 0.2);
      });
    } },
    skin: { tint: '#d7ad7e', uv: 'fit', draw: ({ put, r, c }) => each((x, y) => put(x, y, c, speck(r, 0.025, 0, 1, 0, 1))) },
    face: { tint: '#d7ad7e', uv: 'fit', draw: api => {
      kinds.skin.draw(api);
      for (const [x, y, k] of [[7, 10, 0.9], [8, 10, 0.9], [7, 11, 0.84], [8, 11, 0.84]]) api.mul(x, y, k);
      for (const x of [3, 4, 11, 12]) api.put(x, 11, api.c.map((v, i) => v * 0.7 + [236, 150, 140][i] * 0.3));
    } },
    hair: { tint: '#634c3b', uv: 'fit', draw: ({ put, r, c }) => {
      const strand = []; for (let x = 0; x < 16; x++) strand[x] = 0.86 + r() * 0.24;
      each((x, y) => put(x, y, c, strand[x] * (r() < 0.12 ? 0.78 : 1) * (y === 1 && x % 4 === 1 ? 1.2 : 1)));
    } },
    shirt: { tint: '#38adb0', uv: 'fit', draw: ({ put, r, c }) => each((x, y) => put(x, y, c, ((x + y) % 2 ? 0.97 : 1.03) * (y === 15 ? 0.86 : 1) * speck(r, 0.03, 0, 1, 0, 1))) },
    pants: { tint: '#536c98', uv: 'fit', draw: ({ put, r, c }) => each((x, y) => put(x, y, c, ((x + y) % 4 === 0 ? 0.88 : 1) * speck(r, 0.04, 0, 1, 0, 1))) },
    boots: { tint: '#4a575b', uv: 'fit', draw: ({ put, r, c }) => each((x, y) => put(x, y, c, (y < 3 ? 1.16 : y > 12 ? 0.7 : 1) * speck(r, 0.05, 0, 1, 0, 1))) },
  };
  // Faces in BoxGeometry order: +x, -x, +y, -y, +z (front), -z.
  const faces = (tint, ...list) => list.map(kind => look(kind === 'dirt' ? kind : `${kind} ${tint}`));
  const presets = {
    grass_block: (tint = '#6cc21c') => faces(tint, 'grass_side', 'grass_side', 'grass_top', 'dirt', 'grass_side', 'grass_side'),
    oak_log: (tint = '#9a7450') => faces(tint, 'oak_log_side', 'oak_log_side', 'oak_log_end', 'oak_log_end', 'oak_log_side', 'oak_log_side'),
    birch_log: (tint = '#e8e4d8') => [look(`birch_log_side ${tint}`), look(`birch_log_side ${tint}`), look('oak_log_end #c9b48a'), look('oak_log_end #c9b48a'), look(`birch_log_side ${tint}`), look(`birch_log_side ${tint}`)],
    crafting_table: () => [look('crafting_side'), look('crafting_side'), look('crafting_top'), look('oak_planks #b48c58'), look('crafting_front'), look('crafting_front')],
    hay_bale: (tint = '#d9b544') => faces(tint, 'hay_side', 'hay_side', 'hay_top', 'hay_top', 'hay_side', 'hay_side'),
    pumpkin: (tint = '#e08a2a') => faces(tint, 'pumpkin_side', 'pumpkin_side', 'pumpkin_top', 'pumpkin_side', 'pumpkin_side', 'pumpkin_side'),
    melon: (tint = '#6aa83b') => faces(tint, 'melon_side', 'melon_side', 'melon_top', 'melon_top', 'melon_side', 'melon_side'),
    // Books face +x; the shelf's top, bottom and ends are planks.
    bookshelf: (tint = '#c9a46e') => faces(tint, 'books', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks'),
    notice: (tint = '#c9a46e') => faces(tint, 'oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', 'sign', 'oak_planks'),
    furnace: (tint = '#85958e') => faces(tint, 'cobblestone', 'cobblestone', 'furnace_top', 'furnace_top', 'furnace_front', 'cobblestone'),
    head: (tint = '#d7ad7e') => faces(tint, 'skin', 'skin', 'skin', 'skin', 'face', 'skin'),
  };
  const textures = new Map(), materials = new Map();
  function texture(kind, tint) {
    const id = `${kind} ${tint}`;
    if (textures.has(id)) return textures.get(id);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d'), image = ctx.createImageData(16, 16), data = image.data;
    // Texture noise has its own stream, seeded per texture, so it never shifts terrain or scenery.
    let s = [...id].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261);
    const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const put = (x, y, color, k = 1, alpha = 255) => { const i = (y * 16 + x) * 4; for (let j = 0; j < 3; j++) data[i + j] = Math.min(255, color[j] * k); data[i + 3] = alpha; };
    const mul = (x, y, k) => { const i = (y * 16 + x) * 4; for (let j = 0; j < 3; j++) data[i + j] = Math.min(255, data[i + j] * k); };
    kinds[kind].draw({ put, mul, r, c: rgb(tint) });
    ctx.putImageData(image, 0, 0);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.magFilter = THREE.NearestFilter;
    map.minFilter = THREE.NearestMipmapNearestFilter;
    textures.set(id, map);
    return map;
  }
  // "kind #tint" -> one shared material (or shared per-face array for presets), cached by kind, tint and roughness.
  function look(spec, roughness = 0.85) {
    const id = `${spec}|${roughness}`;
    if (materials.has(id)) return materials.get(id);
    const [kind, tint] = spec.split(' ');
    let material;
    if (presets[kind]) material = presets[kind](tint);
    else {
      material = new THREE.MeshStandardMaterial({ map: texture(kind, tint || kinds[kind].tint), roughness });
      material.userData.uv = kinds[kind].uv;
    }
    materials.set(id, material);
    return material;
  }
  // Plants bend in world space with the wind: the higher above the ground, the further they lean.
  const wind = { uTime: { value: 0 }, uWind: { value: 0 } }, swaying = new Map();
  function sway(spec, base = 0.12) {
    const id = `${spec}|${base}`;
    if (swaying.has(id)) return swaying.get(id);
    const material = look(spec).clone();
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, wind, { uBase: { value: base } });
      shader.vertexShader = shader.vertexShader.replace('void main() {', 'uniform float uTime, uWind, uBase;\nvoid main() {').replace('#include <project_vertex>', `
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vec4 swayed = modelMatrix * mvPosition;
        float lift = max(swayed.y - uBase, 0.0);
        swayed.xz += vec2(0.8, 0.6) * lift * (uWind * (0.75 + 0.35 * sin(uTime * 2.6 + swayed.x * 0.9 + swayed.z * 0.7)) + 0.03 * sin(uTime * 1.3 + swayed.x));
        mvPosition = viewMatrix * swayed;
        gl_Position = projectionMatrix * mvPosition;`);
    };
    material.customProgramCacheKey = () => 'sway';
    swaying.set(id, material);
    return material;
  }
  // Per-face UV repeats so pixels stay square on long or large boxes; batched blocks share these geometries.
  const faceAxes = [[2, 1], [2, 1], [0, 2], [0, 2], [0, 1], [0, 1]];
  const geometries = new Map(), worldScale = new THREE.Vector3();
  function blockGeometry(size, sides) {
    const repeats = sides.map((material, i) => {
      const [u, v] = faceAxes[i].map(axis => size[axis]), mode = material.userData.uv;
      if (mode === 'tile') return [u, v].map(n => Math.max(1, Math.round(n * 16)) / 16);
      return [mode === 'row' ? Math.max(1, Math.round(u / v)) : 1, 1];
    });
    if (Math.max(...size) < 0.3 || repeats.every(([u, v]) => u === 1 && v === 1)) return cube;
    const id = repeats.flat().join();
    if (!geometries.has(id)) {
      const geometry = new THREE.BoxGeometry(1, 1, 1), uv = geometry.attributes.uv;
      // Anchor at the top edge so thin slabs show the top rows (for example the grass fringe).
      for (let i = 0; i < uv.count; i++) { const [ru, rv] = repeats[Math.floor(i / 4)]; uv.setXY(i, uv.getX(i) * ru, 1 - (1 - uv.getY(i)) * rv); }
      geometries.set(id, geometry);
    }
    return geometries.get(id);
  }
  function box(parent, size, position, material) {
    if (typeof material === 'string') material = look(material);
    const sides = Array.isArray(material) ? material : Array(6).fill(material);
    parent.updateWorldMatrix(true, false); parent.getWorldScale(worldScale);
    const geometry = sides.every(side => side.userData.uv) ? blockGeometry(size.map((n, i) => n * Math.abs(worldScale.getComponent(i))), sides) : cube;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(...size);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  // One reproducible world, including foliage and flowers, across every reload.
  let seed = 26;
  function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

  const island = new THREE.Group();
  scene.add(island);
  // A stepped shoreline, with every visible edge built from solid geometry. Ground uses one shared
  // material set; per-tile shade variation goes into the instance colours when the blocks are batched.
  const tileKey = (x, z) => `${x},${z}`;
  const landTiles = new Set(islandTiles.map(([x, z]) => tileKey(x, z))), pondSet = new Set(waterTiles.map(([x, z]) => tileKey(x, z)));
  const solid = (x, z) => landTiles.has(tileKey(x, z)) || pondSet.has(tileKey(x, z));
  const around = (x, z, test) => [-1, 0, 1].some(dx => [-1, 0, 1].some(dz => (dx || dz) && test(x + dx, z + dz)));
  const tileNoise = (x, z, salt) => { const n = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453; return n - Math.floor(n); };
  const shaded = (mesh, x, z) => { mesh.userData.shade = 0.93 + tileNoise(x, z, 3) * 0.1; return mesh; };
  for (const [x, z] of islandTiles) {
    const kind = groundKind(x, z);
    if (kind === 'bridge') { box(island, [1, 0.12, 1], [x, 0.04, z], 'oak_planks #c9a46e'); continue; } // the river's water runs underneath
    const edge = around(x, z, (nx, nz) => !solid(nx, nz));
    const depth = edge ? [0.72, 0.8, 0.88][Math.floor(tileNoise(x, z, 1) * 3)] : 1.12;
    shaded(box(island, [1, depth, 1], [x, -depth / 2 - 0.12, z], 'dirt'), x, z);
    shaded(box(island, [1, 0.22, 1], [x, -0.01, z], kind === 'sand' ? 'sand' : 'grass_block'), x, z);
    if (edge && tileNoise(x, z, 2) > 0.55) box(island, [0.92, 0.4, 0.92], [x, -depth - 0.27, z], 'stone #a5b9ae');
  }
  // Where the river meets the coast it spills over the edge, so no sand step is built in front of it.
  const bridgeSet = new Set(islandTiles.filter(([x, z]) => groundKind(x, z) === 'bridge').map(([x, z]) => tileKey(x, z)));
  const channel = [...waterTiles, ...[...bridgeSet].map(k => k.split(',').map(Number))];
  const falls = [];
  for (const [x, z] of channel) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!solid(x + dx, z + dz)) falls.push([x, z, dx, dz]);
  const spill = new Set(falls.map(([x, z, dx, dz]) => tileKey(x + dx, z + dz)));
  // A lower sand step around the whole shore leads down into the sea.
  const shoreSteps = new Set();
  for (const [x, z] of islandTiles) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (!solid(x + dx, z + dz) && !spill.has(tileKey(x + dx, z + dz))) shoreSteps.add(tileKey(x + dx, z + dz));
  for (const k of shoreSteps) {
    const [x, z] = k.split(',').map(Number);
    shaded(box(island, [1, 0.95, 1], [x, -1.1, z], 'sand'), x, z);
  }
  // Lake, river and pond: sunken sand beds under the same transparent water as the cabin pond, one slab per row run.
  const pondWater = new THREE.MeshPhysicalMaterial({ color: '#8befe0', transmission: 0.45, thickness: 0.12, roughness: 0.12, clearcoat: 1 });
  const lake = new THREE.Group(); island.add(lake);
  const channelSet = new Set(channel.map(([x, z]) => tileKey(x, z)));
  for (const [x, z] of channel) box(island, [1, 0.9, 1], [x, -0.87, z], 'sand #b9c99a');
  for (const [x, z] of channel) {
    if (channelSet.has(tileKey(x - 1, z))) continue;
    let end = x; while (channelSet.has(tileKey(end + 1, z))) end++;
    box(lake, [end - x + 1, 0.035, 1], [(x + end) / 2, -0.2, z], pondWater).castShadow = false;
  }
  for (const [x, z, dx, dz] of falls) box(lake, [dx ? 0.04 : 1, 1.35, dz ? 0.04 : 1], [x + dx * 0.5, -0.86, z + dz * 0.5], pondWater).castShadow = false;
  for (const { x, z, turn } of scenery.lilies) box(island, [0.42, 0.02, 0.42], [x, -0.17, z], 'leaves #4f9a3c').rotation.y = turn;
  const seaMaterial = new THREE.MeshPhysicalMaterial({ color: '#1f78d6', roughness: 0.23, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.13 });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), seaMaterial);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -1.55;
  sea.receiveShadow = true;
  scene.add(sea);
  const waterHighlights = new THREE.Group();
  scene.add(waterHighlights);
  const shine = new THREE.MeshBasicMaterial({ color: '#e2fffa', transparent: true, opacity: 0.35, depthWrite: false });
  // Glints stay in a band of open sea around the actual shoreline.
  const nearLand = (x, z) => { for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (solid(Math.round(x) + dx, Math.round(z) + dz)) return true; return false; };
  for (let i = 0; i < 160; i++) {
    const x = (random() - 0.5) * 84, z = (random() - 0.5) * 70;
    if (nearLand(x, z)) continue;
    const glint = box(waterHighlights, [0.4 + random() * 1.1, 0.008, 0.045], [x, -1.53, z], shine);
    glint.castShadow = glint.receiveShadow = false;
  }

  const crowns = [];
  // The canopy leans to one side (-x, or +x when flipped) so it can stand beside the cabin without entering its roof.
  function tree(x, z, scale = 1, flip = false, leaves = 20, kind = 'oak') {
    const birch = kind === 'birch';
    const tree = new THREE.Group();
    tree.position.set(x, 0.1, z);
    tree.scale.setScalar(scale);
    island.add(tree);
    box(tree, [0.62, 3.1, 0.62], [0, 1.5, 0], birch ? 'birch_log' : 'oak_log #9a7450');
    if (!birch) box(tree, [0.08, 2.8, 0.63], [-0.32, 1.45, 0], 'oak_log_side #b18b60');
    box(tree, [1.1, 0.35, 0.44], [0.32, 2.6, 0], birch ? 'birch_log_side' : 'oak_log_side #9a7450').rotation.z = 0.45;
    const crown = new THREE.Group();
    crown.position.y = 3.1;
    crown.scale.x = flip ? -1 : 1;
    tree.add(crown);
    for (const [size, position, color] of [
      [[2.9, 1.25, 2.8], [-0.45, 0, 0], '#64a74b'],
      [[2.65, 1.0, 2.35], [-0.55, 1.02, -0.08], '#7fbb55'],
      [[1.7, 0.65, 1.65], [-0.45, 1.83, -0.1], '#9ccc65'],
      [[1.4, 0.9, 1.05], [0.15, 0.2, 1.55], '#72b34e'],
      [[1.1, 0.75, 1.45], [-1.48, 0.12, 0.1], '#91c961'],
    ]) box(crown, size, position, `leaves ${birch ? '#8fc46a' : color}`);
    for (let i = 0; i < leaves; i++) {
      box(crown, [0.48, 0.25, 0.48], [-1.6 + random() * 2.2, random() * 1.4, (random() - 0.5) * 2.4], i % 2 ? 'leaves #9acb67' : birch ? 'leaves #a8d27a' : 'leaves #75b851');
    }
    crowns.push(crown);
    return tree;
  }
  tree(-1.8, 0.6, 1.12);
  tree(-6, -3.45, 0.68);
  tree(7.5, -3.9, 0.7, true);
  for (const { x, z, scale, kind } of scenery.trees) tree(x, z, scale, false, 8, kind);
  // Solid blocks scattered over the new land; their footprints are obstacles in room-navigation.js.
  for (const { x, z, kind, size, turn, seed: blockSeed } of scenery.blocks) {
    if (kind === 'haystack') {
      // Four bales on the ground and two or three stacked above, each a full hay block.
      const top = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].filter((_, i) => i !== Math.floor(blockSeed * 4) || blockSeed > 0.6);
      for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) box(island, [0.98, 0.95, 0.98], [x + dx, 0.595, z + dz], 'hay_bale');
      for (const [dx, dz] of top.slice(0, 3)) box(island, [0.98, 0.95, 0.98], [x + dx, 1.545, z + dz], 'hay_bale');
      continue;
    }
    if (kind === 'pumpkins') {
      // A tilled plot with nine equal pumpkins in neat 3x3 rows, all facing the same way.
      box(island, [2.36, 0.05, 2.36], [x, 0.145, z], 'dirt #6b4a2e');
      for (const dz of [-0.78, 0, 0.78]) box(island, [2.3, 0.03, 0.12], [x, 0.18, z + dz + 0.33], 'leaves #4f8f2f');
      for (const dx of [-0.78, 0, 0.78]) for (const dz of [-0.78, 0, 0.78]) {
        box(island, [0.6, 0.54, 0.6], [x + dx, 0.44, z + dz], 'pumpkin');
        box(island, [0.07, 0.12, 0.07], [x + dx, 0.77, z + dz], 'plain #6d7a3a');
      }
      continue;
    }
    const height = { boulder: 0.75, hay: 0.9, pumpkin: 0.7, melon: 0.8, bush: 0.75 }[kind];
    const spec = { boulder: 'mossy_cobblestone', hay: 'hay_bale', pumpkin: 'pumpkin', melon: 'melon', bush: 'leaves #5e9e45' }[kind];
    box(island, [size, height, size], [x, 0.12 + height / 2, z], spec).rotation.y = turn * Math.PI / 2;
    if (kind === 'bush') box(island, [size * 0.6, 0.3, size * 0.6], [x + 0.08, 0.12 + height + 0.15, z - 0.05], 'leaves #74b356');
    if (kind === 'pumpkin') box(island, [0.07, 0.12, 0.07], [x, 0.12 + height + 0.06, z], 'plain #6d7a3a');
  }
  for (const { x, z, height } of scenery.canes) for (const [dx, dz, k] of [[-0.1, -0.06, 1], [0.1, 0.02, 0.85], [-0.02, 0.12, 0.7]]) {
    box(island, [0.09, height * k, 0.09], [x + dx, 0.12 + height * k / 2, z + dz], sway('plain #8cc865'));
    box(island, [0.18, 0.04, 0.05], [x + dx + 0.06, 0.12 + height * k * 0.6, z + dz], sway('plain #6fae4d'));
  }
  for (const { x, z, red } of scenery.mushrooms) {
    box(island, [0.06, 0.1, 0.06], [x, 0.17, z], 'plain #eadfc8');
    box(island, [0.17, 0.06, 0.17], [x, 0.24, z], red ? 'plain #d0473a' : 'plain #9b6a48');
  }

  // Original block adventurer. Bent knees and a tilted head read as resting.
  const character = new THREE.Group();
  character.position.set(...outdoorRoute[0]);
  character.rotation.y = 0.28;
  island.add(character);
  const hips = new THREE.Group(); character.add(hips);
  const torso = new THREE.Group(); hips.add(torso);
  box(torso, [0.64, 0.72, 0.38], [0, 0.36, 0], 'shirt #38adb0');
  box(torso, [0.68, 0.07, 0.41], [0, 0, 0], 'shirt #257c88');
  const head = new THREE.Group();
  head.position.set(0, 1.02, 0.05);
  head.rotation.z = -0.15;
  head.rotation.x = 0.1;
  torso.add(head);
  box(head, [0.55, 0.55, 0.55], [0, 0, 0], 'head #d7ad7e');
  box(head, [0.57, 0.14, 0.58], [0, 0.23, -0.01], 'hair #634c3b');
  box(head, [0.57, 0.32, 0.12], [0, 0.03, -0.23], 'hair #634c3b');
  box(head, [0.15, 0.25, 0.11], [-0.21, 0.1, 0.23], 'hair #634c3b');
  const eyes = [], eyeWhites = [];
  for (const x of [-0.13, 0.13]) {
    eyeWhites.push(box(head, [0.15, 0.10, 0.02], [x, -0.03, 0.282], 'plain #fff5e5'));
    eyes.push(box(head, [0.1, 0.035, 0.025], [x, -0.03, 0.3], 'plain #634c3b'));
  }
  box(head, [0.13, 0.025, 0.027], [0, -0.17, 0.282], 'plain #ab785e');
  const limbs = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * 0.44, 0.62, 0); torso.add(arm);
    box(arm, [0.24, 0.24, 0.26], [0, -0.12, 0], 'shirt #38adb0');
    box(arm, [0.22, 0.56, 0.24], [0, -0.4, 0], 'skin #d7ad7e');
    const thigh = new THREE.Group(); thigh.position.x = side * 0.18; hips.add(thigh);
    box(thigh, [0.27, 0.42, 0.28], [0, -0.21, 0], 'pants #536c98');
    const shin = new THREE.Group(); shin.position.y = -0.42; thigh.add(shin);
    box(shin, [0.27, 0.4, 0.26], [0, -0.2, 0], 'pants #536c98');
    box(shin, [0.3, 0.16, 0.38], [0, -0.42, 0.04], 'boots #4a575b');
    limbs.push({ side, arm, thigh, shin });
  }
  // A small satchel, left beside the tree instead of used as a UI prop.
  box(island, [0.42, 0.48, 0.28], [-1.9, 0.35, 1.95], 'plain #cc9c58');
  box(island, [0.45, 0.09, 0.31], [-1.9, 0.63, 1.95], 'plain #a9804c');

  const house = new THREE.Group();
  house.position.set(3.15, 0.12, -0.8);
  house.scale.set(1.6, 1, 1.6);
  island.add(house);
  const frontWall = new THREE.Group(), rightWall = new THREE.Group(), backWall = new THREE.Group(), leftWall = new THREE.Group();
  house.add(frontWall, rightWall, backWall, leftWall);
  const wood = look('oak_planks #d6ba8d');
  const paleWood = look('oak_planks #f0dfbb');
  const frame = look('metal #eaf5df', 0.4);
  // Block glass: one pane per world unit with a pale frame and corner glints, kept glossy and aqua for the Aero look.
  const glass = new THREE.MeshPhysicalMaterial({ map: texture('glass', kinds.glass.tint), transparent: true, depthWrite: false, roughness: 0.06, metalness: 0, ior: 1.45, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.3 });
  glass.userData.uv = 'tile';
  box(house, [4.75, 0.28, 3.95], [0, 0.1, 0], 'oak_planks #c9bb9a');
  for (let i = 0; i < 13; i++) box(house, [0.33, 0.12, 3.6], [-2.05 + i * 0.34, 0.3, 0], i % 2 ? paleWood : wood);
  for (const x of [-2.1, 0, 2.1]) {
    for (const z of [-1.7, 1.7]) box(z > 0 ? frontWall : x > 0 ? rightWall : backWall, [0.14, 2.8, 0.14], [x, 1.7, z], frame);
  }
  for (const z of [-1.7, 1.7]) {
    const wall = z > 0 ? frontWall : backWall;
    box(wall, [4.35, 0.14, 0.16], [0, 3.08, z], frame);
    // Keep the doorway clear all the way to the floor.
    for (const x of z > 0 ? [-1.22, 1.5] : [0]) {
      const width = z > 0 ? (x < 0 ? 1.72 : 1.1) : 4.3;
      box(wall, [width, 0.12, 0.15], [x, 0.78, z], wood);
      box(wall, [width, 0.42, 0.13], [x, 0.53, z], wood);
    }
  }
  for (const x of [-2.1, 2.1]) {
    const wall = x > 0 ? rightWall : leftWall;
    box(wall, [0.16, 0.14, 3.45], [x, 3.08, 0], frame);
    box(wall, [0.13, 0.45, 3.4], [x, 0.55, 0], wood);
    box(wall, [0.1, 2.24, 3.3], [x, 1.9, 0], glass).castShadow = false;
    box(wall, [0.15, 2.6, 0.09], [x, 1.72, 0], frame);
    box(wall, [0.16, 0.07, 3.4], [x, 1.86, 0], frame);
  }
  box(backWall, [4.1, 2.24, 0.07], [0, 1.9, -1.7], glass).castShadow = false;
  // Front window leaves a real doorway in the geometry.
  for (const x of [-1.22, 1.5]) box(frontWall, [x < 0 ? 1.72 : 1.1, 2.24, 0.07], [x, 1.9, 1.7], glass).castShadow = false;
  for (const x of [-0.34, 0.94]) box(frontWall, [0.11, 2.65, 0.16], [x, 1.7, 1.72], wood);
  box(frontWall, [1.36, 0.24, 0.16], [0.3, 2.95, 1.74], wood);
  const door = new THREE.Group(); door.position.set(-0.27, 0.4, 1.73); frontWall.add(door);
  box(door, [1.14, 2.35, 0.05], [0.57, 1.18, 0], glass).castShadow = false;
  box(door, [0.06, 0.3, 0.08], [1.03, 1.08, 0.08], 'metal #8aa59b');
  box(house, [1.65, 0.15, 0.5], [0.3, 0.11, 2.03], 'oak_planks #e7d8b5');
  box(house, [2.1, 0.11, 0.5], [0.3, 0.035, 2.36], 'oak_planks #e7d8b5');
  const roof = new THREE.Group();
  roof.position.set(0, 3.3, 0);
  roof.rotation.x = -0.12;
  house.add(roof);
  box(roof, [4.65, 0.075, 3.98], [0, 0, 0], glass).castShadow = false;
  for (const x of [-2.3, -1.15, 0, 1.15, 2.3]) box(roof, [0.09, 0.11, 4], [x, 0.02, 0], frame);
  for (const z of [-1.96, 0, 1.96]) box(roof, [4.7, 0.11, 0.1], [0, 0.02, z], frame);
  const solar = new THREE.MeshPhysicalMaterial({ color: '#285375', roughness: 0.21, metalness: 0.55, clearcoat: 1 });
  for (const x of [0.68, 1.68]) {
    box(roof, [0.91, 0.09, 1.36], [x, 0.13, -0.73], frame);
    box(roof, [0.84, 0.025, 1.28], [x, 0.19, -0.73], solar);
    for (let i = 1; i <= 4; i++) box(roof, [0.84, 0.008, 0.014], [x, 0.206, -1.37 + i * 0.255], 'metal #6293ab');
    box(roof, [0.016, 0.008, 1.28], [x, 0.207, -0.73], 'metal #6293ab');
  }
  // Interior. The house is scaled 1.6x in x and z, so local x/z sizes are world sizes divided by 1.6.
  // Tidy layout: workbench under the noticeboard on the back wall, bed in the back-right corner under a row
  // of paintings, bookshelves down the left wall, a weapon rack above the chest, and a rug in the middle.
  const table = new THREE.Group(); house.add(table);
  box(table, [0.594, 0.95, 0.6125], [-0.234, 0.835, -1.306], 'crafting_table');
  // A hanging lantern: chain, iron cage and a warm glowing core.
  const pendant = new THREE.Group(); house.add(pendant);
  box(pendant, [0.03, 0.42, 0.03], [0.3, 2.82, -0.15], 'metal #4a5052');
  const lamp = new THREE.MeshStandardMaterial({ color: '#fff6c2', emissive: '#ffe6a3', emissiveIntensity: 0.6, roughness: 0.5 });
  box(pendant, [0.15, 0.2, 0.15], [0.3, 2.49, -0.15], lamp);
  box(pendant, [0.2, 0.04, 0.2], [0.3, 2.61, -0.15], 'metal #3f474a');
  box(pendant, [0.2, 0.03, 0.2], [0.3, 2.38, -0.15], 'metal #3f474a');
  for (const dx of [-0.09, 0.09]) for (const dz of [-0.09, 0.09]) box(pendant, [0.025, 0.22, 0.025], [0.3 + dx, 2.49, -0.15 + dz], 'metal #3f474a');
  // The bed: oak frame, white mattress and pillow at the wall end, red wool blanket.
  const bed = new THREE.Group(); bed.position.set(1.606, 0.36, -0.9875); house.add(bed);
  for (const dx of [-0.25, 0.25]) for (const dz of [-0.56, 0.56]) box(bed, [0.1, 0.12, 0.08], [dx, 0.06, dz], 'oak_planks #a38463');
  box(bed, [0.625, 0.12, 1.25], [0, 0.18, 0], 'oak_planks #c9a46e');
  box(bed, [0.6, 0.12, 1.22], [0, 0.3, 0], 'wool #f2f2ec');
  box(bed, [0.635, 0.16, 0.86], [0, 0.32, 0.2], 'wool #c94b4b');
  box(bed, [0.42, 0.08, 0.22], [0, 0.4, -0.47], 'wool #ffffff');
  // Small floor lamp between the bed and workbench, against the back wall.
  const floorLamp = new THREE.Group(); floorLamp.position.set(0.9, 0.36, -1.37); house.add(floorLamp);
  box(floorLamp, [0.28, 0.06, 0.28], [0, 0.03, 0], 'metal #4a5052');
  box(floorLamp, [0.045, 0.86, 0.045], [0, 0.49, 0], 'metal #806647');
  box(floorLamp, [0.32, 0.26, 0.32], [0, 1.02, 0], lamp);
  box(floorLamp, [0.34, 0.035, 0.34], [0, 1.1675, 0], 'metal #806647');
  box(floorLamp, [0.34, 0.035, 0.34], [0, 0.8725, 0], 'metal #806647');
  // Three framed paintings in a row above the bed.
  for (const [x, sky] of [[0.906, '#7cc7e8'], [1.344, '#f4b183'], [1.781, '#a9b8f0']]) box(house, [0.34, 0.5, 0.03], [x, 2.3, -1.62], `painting ${sky}`);
  // Four bookshelf columns, two blocks high, books facing into the room (+x, toward the camera).
  for (const z of [-1.4297, -1.0391, -0.6484, -0.2578]) for (const y of [0.76, 1.56]) box(house, [0.3, 0.8, 0.39], [-1.806, y, z], 'bookshelf');
  // A weapon rack on the left wall above the chest: iron sword, axe and bow on an oak board.
  const rack = new THREE.Group(); rack.position.set(-1.93, 1.75, 0.35); house.add(rack);
  box(rack, [0.04, 0.6, 0.62], [0, 0, 0], 'oak_planks #8a6438');
  box(rack, [0.02, 0.38, 0.045], [0.03, 0.08, -0.2], 'metal #e4ebec');
  box(rack, [0.02, 0.035, 0.14], [0.03, -0.13, -0.2], 'plain #4b3a28');
  box(rack, [0.02, 0.12, 0.035], [0.03, -0.2, -0.2], 'oak_planks #5a3d22');
  box(rack, [0.02, 0.5, 0.035], [0.03, -0.02, 0], 'oak_planks #6b4a2a');
  box(rack, [0.02, 0.14, 0.12], [0.035, 0.16, 0.055], 'metal #c7cfd1');
  box(rack, [0.02, 0.22, 0.03], [0.03, 0.16, 0.24], 'oak_planks #7a5532').rotation.x = 0.35;
  box(rack, [0.02, 0.14, 0.03], [0.03, -0.02, 0.21], 'oak_planks #5a3d22');
  box(rack, [0.02, 0.22, 0.03], [0.03, -0.2, 0.24], 'oak_planks #7a5532').rotation.x = -0.35;
  box(rack, [0.012, 0.56, 0.008], [0.03, -0.02, 0.28], 'plain #e8e8e0');
  // A cyan wool rug centred on the open floor.
  box(house, [1.0, 0.02, 0.875], [0.72, 0.37, 0.125], 'wool #7fd6d0');

  function plant(parent, x, y, z, scale = 1) {
    const plant = new THREE.Group();
    plant.position.set(x, y, z); plant.scale.setScalar(scale); parent.add(plant);
    box(plant, [0.32, 0.3, 0.32], [0, 0.15, 0], 'plain #eed8ae');
    box(plant, [0.37, 0.08, 0.37], [0, 0.31, 0], 'plain #f8e6bf');
    box(plant, [0.05, 0.42, 0.05], [0, 0.54, 0], 'plain #558e56');
    box(plant, [0.28, 0.12, 0.19], [-0.12, 0.52, 0], 'leaves #82bd5c').rotation.z = -0.4;
    box(plant, [0.29, 0.12, 0.19], [0.1, 0.67, 0], 'leaves #69a854').rotation.z = 0.4;
  }
  // Potted plants on top of the bookshelves.
  plant(house, -1.806, 1.96, -1.4297, 0.6);
  plant(house, -1.806, 1.96, -0.6484, 0.6);

  const storageChest = new THREE.Group(); storageChest.position.set(-1.67, 0.36, 0.44); storageChest.rotation.y = Math.PI / 2; house.add(storageChest);
  // A double chest: dark-edged planks, a lid hinged at the back, and a silver latch across the seam.
  box(storageChest, [0.88, 0.56, 0.66], [0, 0.28, 0], 'chest_side #b07a3a');
  const chestLid = new THREE.Group(); chestLid.position.set(0, 0.56, -0.33); storageChest.add(chestLid);
  box(chestLid, [0.88, 0.2, 0.66], [0, 0.1, 0.33], 'chest_side #b07a3a');
  box(chestLid, [0.08, 0.16, 0.05], [0, -0.01, 0.685], 'metal #d6dadb');
  // The noticeboard is a big oak sign with written lines, in a dark log frame.
  const board = new THREE.Group(); board.position.set(-0.234, 2.35, -1.59); house.add(board);
  box(board, [1.46, 1.03, 0.09], [0, 0, -0.02], 'oak_log_side #6e4f2e');
  box(board, [1.38, 0.95, 0.13], [0, 0, 0], 'notice #d1ae74');
  const furnace = new THREE.Group(); furnace.position.set(1.57, 0.36, 0.87); house.add(furnace);
  // Stay inside the existing navigation footprint; leave a real, deep firebox.
  const iron = new THREE.MeshStandardMaterial({ color: '#303139', roughness: 0.72, metalness: 0.45 });
  const firebricks = ['#805044', '#995d48', '#b37455'].map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
  box(furnace, [0.78, 0.12, 0.7], [0, 0.06, 0], iron);
  box(furnace, [0.72, 0.72, 0.15], [0, 0.48, -0.26], iron);
  for (const side of [-1, 1]) for (let row = 0; row < 4; row++) {
    box(furnace, [0.12, 0.17, 0.68], [side * 0.32, 0.205 + row * 0.18, 0], firebricks[(row + (side + 1) / 2) % 3]);
  }
  box(furnace, [0.51, 0.16, 0.68], [0, 0.78, 0], firebricks[1]);
  box(furnace, [0.78, 0.08, 0.7], [0, 0.9, 0], iron);
  box(furnace, [0.27, 0.35, 0.28], [0.13, 1.115, -0.16], iron);
  box(furnace, [0.35, 0.06, 0.36], [0.13, 1.32, -0.16], iron);
  for (const side of [-1, 1]) box(furnace, [0.035, 0.6, 0.035], [side * 0.257, 0.42, 0.345], iron);
  box(furnace, [0.52, 0.05, 0.045], [0, 0.7, 0.345], iron);
  const emberMaterial = new THREE.MeshStandardMaterial({ color: '#3c352d', emissive: '#ffad39', emissiveIntensity: 0, roughness: 0.8 });
  const embers = box(furnace, [0.48, 0.07, 0.39], [0, 0.155, 0.11], emberMaterial);
  for (const x of [-0.17, 0, 0.17]) box(furnace, [0.035, 0.15, 0.04], [x, 0.21, 0.34], iron);
  const furnaceLight = new THREE.PointLight('#ff9c42', 0, 3); furnaceLight.position.set(0, 0.45, 0.54); furnace.add(furnaceLight);

  // Shared pixel flame texture: no external assets or per-frame geometry allocation.
  const flameCanvas = document.createElement('canvas'); flameCanvas.width = 32; flameCanvas.height = 64;
  const flameContext = flameCanvas.getContext('2d');
  for (const [color, outline] of [
    ['#ff541c', [[5,61],[1,45],[8,33],[10,19],[16,2],[18,25],[26,16],[25,38],[31,48],[26,61]]],
    ['#ffb52e', [[9,61],[6,47],[12,36],[15,20],[19,39],[25,32],[25,49],[23,61]]],
    ['#fff2a2', [[12,61],[10,51],[15,40],[18,48],[21,53],[20,61]]],
  ]) {
    flameContext.fillStyle = color; flameContext.beginPath();
    outline.forEach(([x, y], index) => index ? flameContext.lineTo(x, y) : flameContext.moveTo(x, y));
    flameContext.closePath(); flameContext.fill();
  }
  const flameTexture = new THREE.CanvasTexture(flameCanvas);
  flameTexture.colorSpace = THREE.SRGBColorSpace; flameTexture.magFilter = THREE.NearestFilter;
  const fire = new THREE.Group(); fire.visible = false; furnace.add(fire);
  const flames = Array.from({ length: 5 }, (_, index) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    sprite.center.set(0.5, 0); sprite.raycast = () => {};
    fire.add(sprite); return sprite;
  });
  const sparkCount = 28, sparkPositions = new Float32Array(sparkCount * 3), sparkColors = new Float32Array(sparkCount * 3);
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
  sparkGeometry.setAttribute('color', new THREE.BufferAttribute(sparkColors, 3));
  const sparks = new THREE.Points(sparkGeometry, new THREE.PointsMaterial({ size: 3.5, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  sparks.frustumCulled = false; sparks.raycast = () => {}; fire.add(sparks);
  function animateFurnace(time, moving) {
    if (!fire.visible) return;
    flames.forEach((sprite, index) => {
      const wave = Math.sin(time * 9 + index * 2.1), height = 0.4 + (index % 2) * 0.14 + wave * 0.065;
      sprite.position.set((index - 2) * 0.087 + Math.sin(time * 5 + index) * 0.012, 0.18, 0.25 + (index % 2) * 0.04);
      sprite.scale.set(0.17 + wave * 0.018, height, 1);
      sprite.material.opacity = 0.55 + wave * 0.1;
      sprite.material.rotation = Math.sin(time * 4 + index) * 0.055;
    });
    sparks.visible = moving;
    sparkGeometry.setDrawRange(0, lowQuality ? 14 : sparkCount);
    for (let index = 0; index < sparkCount; index++) {
      const life = (time * (0.5 + (index % 5) * 0.09) + index * 0.618) % 1;
      const drift = Math.sin(index * 7.3 + time * 1.8);
      sparkPositions[index * 3] = Math.sin(index * 13.7) * 0.18 + drift * life * 0.09;
      sparkPositions[index * 3 + 1] = 0.27 + life * 1.12;
      sparkPositions[index * 3 + 2] = 0.37 + life * 0.06;
      const glow = 2 * Math.sin(Math.PI * life) * (1 - life);
      sparkColors[index * 3] = glow;
      sparkColors[index * 3 + 1] = glow * (0.45 + (index % 3) * 0.16);
      sparkColors[index * 3 + 2] = glow * 0.12;
    }
    sparkGeometry.attributes.position.needsUpdate = sparkGeometry.attributes.color.needsUpdate = true;
    emberMaterial.emissiveIntensity = 1.5 + Math.sin(time * 8) * 0.25;
    furnaceLight.intensity = 2.5 + Math.sin(time * 11) * 0.3;
  }
  const anvil = new THREE.Group(); anvil.position.set(-1.12, 0.36, -1.46); house.add(anvil);
  // A dark iron anvil: wide foot, stepped base, narrow waist and a long face.
  box(anvil, [0.47, 0.18, 0.375], [0, 0.09, 0], 'metal #4b5254');
  box(anvil, [0.375, 0.05, 0.28], [0, 0.205, 0], 'metal #4b5254');
  box(anvil, [0.2, 0.22, 0.175], [0, 0.34, 0], 'metal #454c4e');
  box(anvil, [0.625, 0.22, 0.344], [0.12, 0.56, 0], 'metal #5d6567');

  const doorwayMarker = new THREE.Group(); house.add(doorwayMarker);
  box(doorwayMarker, [0.65, 0.025, 0.38], [0.44, 0.4, 1.7], 'plain #a0d9a5');
  box(doorwayMarker, [0.09, 0.028, 0.24], [0.44, 0.416, 1.7], 'plain #f5fff0');
  door.traverse(mesh => { if (mesh.isMesh) mesh.userData.workshop = 'door'; });
  const interactive = { chest: storageChest, table, board, furnace, door: doorwayMarker };
  const labelAnchors = { chest: [-1.67,1.23,0.44], table: [-0.234,1.5,-1.15], board: [-0.234,2.96,-1.59], furnace: [1.65,1.45,1.02], door: [0.44,1.0,1.74] };
  const objectButtons = Object.fromEntries(Object.keys(interactive).map(key => [key, document.querySelector(`[data-workshop="${key}"]`)]));
  const materialList = mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  // Give one object its own copies of shared materials (single or per-face arrays), one copy per original,
  // so highlighting or fading it never changes unrelated blocks.
  function ownMaterials(root, skip) {
    const copies = new Map(), copy = material => { if (!copies.has(material)) copies.set(material, material.clone()); return copies.get(material); };
    root.traverse(mesh => { if (mesh.isMesh && mesh !== skip) mesh.material = Array.isArray(mesh.material) ? mesh.material.map(copy) : copy(mesh.material); });
  }
  Object.entries(interactive).forEach(([key, group]) => {
    group.traverse(mesh => { if (mesh.isMesh) mesh.userData.workshop = key; });
    ownMaterials(group, embers);
  });

  // Limestone stepping stones connect the resting spot and the workshop.
  for (const [x, z, width] of [[-1.05,2.1,0.7], [-0.8,2.55,0.7], [0.3,2.65,0.85], [1.4,2.75,0.85], [2.5,2.85,0.85], [3.6,2.65,0.8]]) {
    box(island, [width, 0.08, 0.48], [x, 0.1, z], 'stone #ede5c6');
  }
  // A sunken pond with a stepped bank and actual transparent water geometry.
  const pond = new THREE.Group(); pond.position.set(-2, 0.12, 3.85); island.add(pond);
  box(pond, [3.1, 0.13, 1.35], [0, 0, 0], 'stone #c9d6b1');
  box(pond, [2.8, 0.08, 1.08], [0, 0.06, 0], 'plain #49b6b9');
  const pondSurface = box(pond, [2.8, 0.035, 1.08], [0, 0.12, 0], pondWater);
  pondSurface.castShadow = false;
  for (const [x, z] of [[-1.46, -0.5], [1.47, 0.2], [0.3, 0.66], [-0.9, 0.66]]) box(pond, [0.42, 0.22, 0.35], [x, 0.07, z], 'stone #c2cdac');
  for (const [x, z] of [[-0.75, 0.2], [0.4, -0.25]]) {
    box(pond, [0.34, 0.025, 0.27], [x, 0.15, z], 'plain #69a465');
    box(pond, [0.12, 0.08, 0.12], [x, 0.2, z], 'plain #ffc6c1');
  }

  // Flowers and little grass blades are meshes, with no image textures.
  function sprout(x, z, h, bloom, color) {
    box(island, [0.045, h, 0.045], [x, 0.13 + h / 2, z], sway('plain #5aae1c'));
    if (bloom) {
      box(island, [0.16, 0.08, 0.16], [x, 0.16 + h, z], sway(`plain ${['#fff2ba', '#e9f6e8', '#e8a0ab', '#e5534b', '#7f9be8', '#f4d23c'][color]}`));
      box(island, [0.075, 0.085, 0.075], [x, 0.17 + h, z], sway('plain #e7ba58'));
    } else box(island, [0.07, h * 0.8, 0.035], [x + 0.075, 0.13 + h * 0.4, z], sway('plain #66bb24')).rotation.z = -0.25;
  }
  for (let i = 0; i < 90; i++) {
    const x = (random() - 0.5) * 14.5, z = (random() - 0.5) * 8.3;
    if (x > 0.6 && x < 5.9 && z > -3 && z < 2.6 || x > -4.1 && x < 4.8 && z > 1.65 && z < 4.6 || Math.hypot(x + 4.45, z - 1.05) < 1.2) continue;
    sprout(x, z, 0.12 + random() * 0.2, i % 3 === 0, i % 7 % 3);
  }
  // The new land adds poppies, cornflowers and dandelions to the original three blooms.
  for (const { x, z, height, kind } of scenery.flowers) sprout(x, z, height, kind < 0.4, Math.floor(kind * 6 / 0.4) % 6);
  // Garden beds beside the glass house.
  for (const z of [-1.7, -0.65, 0.4]) {
    box(island, [1.2, 0.2, 0.7], [7.4, 0.22, z], 'oak_planks #b89568');
    box(island, [1.02, 0.04, 0.5], [7.4, 0.34, z], 'dirt #8c7860');
    for (const x of [7.1, 7.45, 7.75]) box(island, [0.2, 0.24, 0.25], [x, 0.48, z], 'leaves #70ac57');
  }
  // Quiet block clouds and distant green shoals give the space a horizon.
  const clouds = new THREE.Group(); scene.add(clouds);
  const cloudMaterial = new THREE.MeshStandardMaterial({ color: '#f9ffff', roughness: 0.85 });
  for (const [x, y, z, scale] of [[-13, 7, -15, 0.7], [3, 9, -20, 0.65], [14, 8, -15, 0.75]]) {
    const cloud = new THREE.Group(); cloud.position.set(x, y, z); cloud.scale.setScalar(scale); clouds.add(cloud);
    box(cloud, [4, 0.5, 1.45], [0, 0, 0], cloudMaterial);
    box(cloud, [2.4, 0.65, 1.7], [-0.4, 0.42, 0], cloudMaterial);
    box(cloud, [1, 0.45, 1.1], [-0.6, 0.95, 0], cloudMaterial);
  }
  // Low clouds drift with the wind between the camera and the island, thinning out whenever they cover the character.
  const lowClouds = [];
  for (let i = 0; i < 7; i++) {
    const cloud = new THREE.Group(), material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, transparent: true, opacity: 0.5, depthWrite: false });
    const x = -42 + i * 13 + random() * 5, z = -20 + random() * 40, y = 6 + random() * 1.5, size = 3 + random() * 2.5;
    cloud.position.set(x, y, z); scene.add(cloud);
    for (const [w, h, d, dx, dy, dz] of [[size, 0.3, size * 0.65, 0, 0, 0], [size * 0.6, 0.3, size * 0.5, size * 0.3, 0.02, size * 0.35], [size * 0.5, 0.3, size * 0.45, -size * 0.45, -0.02, -size * 0.25]]) {
      box(cloud, [w, h, d], [dx, dy, dz], material).castShadow = false;
    }
    lowClouds.push({ cloud, material, x, opacity: 0.5 });
  }
  for (const [x, z, scale] of [[-30, -28, 1.5], [27, -30, 1.2], [2, -38, 2]]) {
    box(scene, [5 * scale, 0.5, 2.8 * scale], [x, -1.35, z], 'stone #9abfa0');
    box(scene, [4.4 * scale, 0.18, 2.4 * scale], [x, -1, z], 'grass_block #a5cc95');
  }
  // Fish leap out of the lakes and pond every few seconds and dive back in with a small splash.
  const fishSpots = waterTiles.filter(([x, z]) => lakes.some(([cx, cz, rx, rz]) => ((x - cx) / (rx - 1)) ** 2 + ((z - cz) / (rz - 1)) ** 2 <= 1));
  const fish = [];
  for (let i = 0; i < 9; i++) {
    const [x, z] = fishSpots[Math.floor(random() * fishSpots.length)], colour = ['#f08a3c', '#5aa0e0', '#c9d3d6'][i % 3];
    const leap = new THREE.Group(), body = new THREE.Group(); leap.add(body); island.add(leap);
    leap.position.set(x, -0.2, z); leap.rotation.y = random() * Math.PI * 2; leap.visible = false;
    box(body, [0.34, 0.14, 0.08], [0, 0, 0], `plain ${colour}`);
    box(body, [0.1, 0.13, 0.03], [-0.21, 0, 0], `plain ${colour}`);
    box(body, [0.08, 0.06, 0.02], [0.02, 0.09, 0], `plain ${colour}`);
    box(body, [0.02, 0.03, 0.085], [0.12, 0.02, 0], 'plain #1e2a2c');
    const splashMaterial = new THREE.MeshBasicMaterial({ color: '#f4ffff', transparent: true, opacity: 0, depthWrite: false });
    const splash = box(island, [0.45, 0.02, 0.45], [x, -0.17, z], splashMaterial); splash.castShadow = false;
    fish.push({ leap, body, splash, splashMaterial, x, z, period: 4 + random() * 5, offset: random() * 9 });
  }
  // A friendly dog naps beside the front steps. Clicking it cycles sleeping -> sitting -> standing (tail wagging).
  const dog = new THREE.Group(); dog.position.set(dogSpot[0], 0.12, dogSpot[1]); dog.rotation.y = -0.15; island.add(dog);
  const fur = 'wool #e9e6df';
  const dogParts = {};
  const part = (name, parent = dog) => { const group = new THREE.Group(); parent.add(group); dogParts[name] = group; return group; };
  box(part('body'), [0.6, 0.3, 0.32], [0, 0, 0], fur);
  box(dogParts.body, [0.06, 0.32, 0.34], [0.27, 0.02, 0], 'wool #c23b2e'); // collar
  const dogHead = part('head');
  box(dogHead, [0.3, 0.28, 0.3], [0, 0, 0], fur);
  box(dogHead, [0.14, 0.12, 0.16], [0.21, -0.06, 0], 'wool #d8d2c6');
  box(dogHead, [0.03, 0.05, 0.07], [0.29, -0.03, 0], 'plain #2a2522');
  for (const side of [-1, 1]) box(dogHead, [0.06, 0.1, 0.08], [-0.05, 0.18, side * 0.09], fur);
  const dogEyes = [-1, 1].map(side => box(dogHead, [0.012, 0.045, 0.045], [0.152, 0.05, side * 0.08], 'plain #2a2522'));
  for (const leg of ['fl', 'fr', 'bl', 'br']) box(part(leg), [0.1, 0.28, 0.1], [0, 0, 0], fur);
  box(part('tail'), [0.25, 0.08, 0.08], [-0.12, 0, 0], fur);
  const dogPoses = {
    sleep: { body: [0, 0.16, 0, 0, 0, 0], head: [0.36, 0.15, 0.04, 0, 0.25, -0.1], fl: [0.3, 0.05, 0.1, 0, 0, 1.57], fr: [0.3, 0.05, -0.1, 0, 0, 1.57], bl: [-0.2, 0.05, 0.12, 0, 0, 1.57], br: [-0.2, 0.05, -0.12, 0, 0, 1.57], tail: [-0.3, 0.07, 0.12, 0, -1, 0] },
    sit: { body: [-0.05, 0.36, 0, 0, 0, 0.55], head: [0.28, 0.72, 0, 0, 0, 0], fl: [0.17, 0.15, 0.1, 0, 0, 0], fr: [0.17, 0.15, -0.1, 0, 0, 0], bl: [-0.22, 0.07, 0.11, 0, 0, 1.5], br: [-0.22, 0.07, -0.11, 0, 0, 1.5], tail: [-0.36, 0.08, 0.06, 0, 0.4, 0] },
    stand: { body: [0, 0.42, 0, 0, 0, 0], head: [0.36, 0.6, 0, 0, 0, 0], fl: [0.2, 0.14, 0.1, 0, 0, 0], fr: [0.2, 0.14, -0.1, 0, 0, 0], bl: [-0.2, 0.14, 0.1, 0, 0, 0], br: [-0.2, 0.14, -0.1, 0, 0, 0], tail: [-0.3, 0.5, 0, 0, 0, -0.7] },
  };
  let dogPose = 'sleep';
  dog.traverse(mesh => { if (mesh.isMesh) mesh.userData.dog = true; });
  function poseDog(blend) {
    for (const [name, [x, y, z, rx, ry, rz]] of Object.entries(dogPoses[dogPose])) {
      const group = dogParts[name];
      group.position.lerp(new THREE.Vector3(x, y, z), blend);
      group.rotation.set(group.rotation.x + (rx - group.rotation.x) * blend, group.rotation.y + (ry - group.rotation.y) * blend, group.rotation.z + (rz - group.rotation.z) * blend);
    }
    dogEyes.forEach(eye => { eye.scale.y = dogPose === 'sleep' ? 0.012 : 0.045; });
  }
  poseDog(1); host.dataset.dog = dogPose;
  const bubbleMaterial = new THREE.MeshPhysicalMaterial({ color: '#efffff', transmission: 0.97, roughness: 0.03, thickness: 0.05, ior: 1.15, clearcoat: 1 });
  const bubbles = [];
  for (const [x, y, z, radius] of [[-7.5, 2.7, 3.9, 0.19], [7.3, 4.8, -1, 0.24], [0.5, 5.5, -3, 0.13]]) {
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 12), bubbleMaterial);
    bubble.position.set(x, y, z); scene.add(bubble); bubbles.push({ mesh: bubble, y });
  }

  // Batch static ground blocks by geometry and material (or shared per-face array); keep the interactive models independent.
  const batches = new Map(); // geometry -> material (or face array) -> meshes
  for (const mesh of [...island.children]) if (mesh.isMesh && materialList(mesh).every(m => m.isMeshStandardMaterial && !m.transparent && !m.transmission)) {
    if (!batches.has(mesh.geometry)) batches.set(mesh.geometry, new Map());
    const byMaterial = batches.get(mesh.geometry);
    if (!byMaterial.has(mesh.material)) byMaterial.set(mesh.material, []);
    byMaterial.get(mesh.material).push(mesh);
  }
  const shade = new THREE.Color();
  for (const [geometry, byMaterial] of batches) for (const [material, meshes] of byMaterial) {
    const batch = new THREE.InstancedMesh(geometry, material, meshes.length), tinted = meshes.some(m => m.userData.shade);
    meshes.forEach((mesh, i) => {
      mesh.updateMatrix(); batch.setMatrixAt(i, mesh.matrix); island.remove(mesh);
      if (tinted) batch.setColorAt(i, shade.setScalar(mesh.userData.shade ?? 1));
    });
    batch.castShadow = batch.receiveShadow = true; island.add(batch);
  }
  const qualityMaterials = new Map();
  scene.traverse(mesh => { if (mesh.isMesh) materialList(mesh).forEach(m => { if (m.transmission) qualityMaterials.set(m, { transmission: m.transmission, opacity: m.opacity, transparent: m.transparent }); }); });
  function applyQuality() {
    renderer.setPixelRatio(lowQuality ? 1 : Math.min(devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = !lowQuality;
    qualityMaterials.forEach((original, material) => {
      Object.assign(material, lowQuality ? { transmission: 0, transparent: true, opacity: 0.35 } : original);
      material.needsUpdate = true;
    });
    host.dataset.quality = lowQuality ? 'low' : 'normal';
    host.dataset.pixelRatio = String(renderer.getPixelRatio());
    document.querySelector('#eco-quality').setAttribute('aria-pressed', String(lowQuality));
  }
  applyQuality();
  const journey = new Journey(reducedMotion.matches || options.get('motion') === 'reduce');
  const navigation = new IslandNavigation();
  navigation.graph(); // build the static walk grid during load, not on the first click
  let actorY = 0.49;
  const points = () => ({ ...interactionPoints, door: navigation.zone === 'inside' ? doorway.outside : doorway.inside });
  const keys = new Set();
  let travelled = 0, approachTrigger = null, nearest = null;
  const prompt = document.querySelector('#room-prompt');
  function clearControls() { keys.clear(); navigation.cancel(); }
  function approach(key, trigger) {
    if (contextLost || journey.phase !== 'inside' || controlsPaused || !points()[key] || navigation.destination === key) return;
    approachTrigger = trigger || objectButtons[key];
    if (!navigation.plan(points()[key], key)) { prompt.textContent = 'This spot is not reachable. Choose another location.'; return; }
    if (journey.reduced) { navigation.position = [...points()[key]]; navigation.cancel(); navigation.updateZone(); finishApproach(key); }
    syncMotion(false);
  }
  function finishApproach(key) {
    if (key === 'door') renderer.domElement.focus({ preventScroll: true });
    else window.workshop?.open(key, approachTrigger);
  }
  window.workshop.request = approach;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', 'Move with WASD or arrow keys; hold Shift to run or Ctrl to crouch. Click the ground to walk, or an object to approach it. E or Enter to interact.');
  window.addEventListener('keydown', event => {
    if (contextLost || journey.phase !== 'inside' || controlsPaused || event.target.closest('input,textarea,select,dialog,details')) return;
    const key = event.key.toLowerCase();
    // Shift runs and Ctrl crouches while held, for keyboard and click-to-walk alike.
    if ((key === 'shift' || key === 'control') && !keys.has(key)) { keys.add(key); syncMotion(false); }
    if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)) { event.preventDefault(); if (!keys.has(key)) { keys.add(key); navigation.cancel(); syncMotion(false); } }
    if (!event.repeat && ['e','enter'].includes(key) && nearest && event.target === renderer.domElement) { event.preventDefault(); approach(nearest); }
    if (key === 'escape') clearControls();
  });
  window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur', clearControls);
  const ui = Object.fromEntries(['intro', 'cue', 'inside', 'shortcuts', 'reduced', 'start', 'skip', 'direct', 'enter'].map(name => [name, document.querySelector(`#journey-${name}`)]));
  const sign = document.querySelector('#visitor-sign');
  const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  let elapsed = 0, previousTime = null, paused = journey.reduced;
  let span = 6.7, aspect = 1, width = 1, height = 1, shownPhase;
  let frameCount = 0, sampleStarted = null, crouchAmount = 0, viewRange = 1, zoom = 1, zoomShown = 1;
  const islandCentre = new THREE.Vector3((islandBounds.minX + islandBounds.maxX) / 2, 0.5, (islandBounds.minZ + islandBounds.maxZ) / 2);
  const viewRanges = [['Near', 0.75], ['Normal', 1], ['Far', 1.45]];
  const currentGait = () => journey.phase !== 'inside' ? 'walk' : keys.has('control') ? 'crouch' : keys.has('shift') ? 'run' : 'walk';
  const offset = new THREE.Vector3(13, 10.5, 18);
  const desiredTarget = new THREE.Vector3();
  let contextLost = false, controlsPaused = false, chestOpen = false, hoveredObject = null;
  crowns.forEach(crown => ownMaterials(crown));
  const occlusionRay = new THREE.Raycaster();
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), projected = new THREE.Vector3();
  function highlight(key) {
    if (hoveredObject === key) return;
    hoveredObject = key;
    Object.entries(interactive).forEach(([name, group]) => {
      objectButtons[name].classList.toggle('is-hovered', name === key);
      group.traverse(mesh => {
        if (!mesh.isMesh || mesh === embers) return;
        materialList(mesh).forEach(material => {
          material.emissive.set(name === key ? name === 'furnace' ? '#ff9c42' : '#84a745' : '#000000');
          material.emissiveIntensity = name === key ? 0.22 : 0;
        });
      });
    });
    renderer.domElement.style.cursor = key ? 'pointer' : '';
    render();
  }
  function pick(event) {
    if (journey.phase !== 'inside' || controlsPaused) return null;
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(island.children, true).find(hit => {
      for (let node = hit.object; node; node = node.parent) if (!node.visible) return false;
      return true;
    });
    return hit?.object.userData.workshop || null;
  }
  function dogHit(event) {
    if (controlsPaused || contextLost) return false;
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObject(dog, true).length > 0;
  }
  renderer.domElement.addEventListener('pointermove', event => {
    const key = pick(event); highlight(key);
    renderer.domElement.style.cursor = key || dogHit(event) ? 'pointer' : '';
  });
  renderer.domElement.addEventListener('pointerleave', () => highlight(null));
  renderer.domElement.addEventListener('click', event => {
    if (dogHit(event)) {
      dogPose = { sleep: 'sit', sit: 'stand', stand: 'sleep' }[dogPose];
      host.dataset.dog = dogPose; syncMotion(false);
      return;
    }
    const key = pick(event);
    if (key) approach(key);
    else if (journey.phase === 'inside' && !controlsPaused) {
      const point = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorHeight(navigation.position)), new THREE.Vector3());
      if (point) navigation.plan([point.x, point.z]);
      renderer.domElement.focus({ preventScroll: true }); syncMotion(false);
    }
  });
  Object.entries(objectButtons).forEach(([key, button]) => {
    button.addEventListener('pointerenter', () => highlight(key));
    button.addEventListener('pointerleave', () => highlight(null));
    button.addEventListener('focus', () => highlight(key));
    button.addEventListener('blur', () => highlight(null));
  });
  function updateFurnace(summary) {
    const lit = Boolean(summary?.lit);
    emberMaterial.color.set(lit ? '#ffbf5e' : '#3c352d');
    emberMaterial.emissiveIntensity = lit ? 1.6 : 0;
    furnaceLight.intensity = lit ? 2.5 : 0;
    fire.visible = lit;
    objectButtons.furnace.dataset.lit = host.dataset.furnaceLit = String(lit);
    if (summary) objectButtons.furnace.querySelector('small').textContent = summary.text;
    render();
  }
  function syncUI() {
    if (shownPhase === `${journey.phase}:${navigation.zone}`) return;
    shownPhase = `${journey.phase}:${navigation.zone}`;
    host.dataset.phase = journey.phase;
    ui.intro.hidden = journey.phase !== 'resting';
    sign.hidden = journey.phase !== 'door';
    ui.inside.hidden = journey.phase !== 'inside';
    document.querySelector('#workshop-objects').hidden = journey.phase !== 'inside';
    ui.shortcuts.hidden = journey.phase === 'inside';
    ui.skip.hidden = !['resting', 'waking', 'standing', 'walking'].includes(journey.phase);
    const cues = { waking: 'Waking up.', standing: 'Getting ready.', walking: 'Following the path to the eco workshop.', entering: 'Opening the door to your next chapter.' };
    ui.cue.textContent = cues[journey.phase] || '';
    ui.cue.hidden = !cues[journey.phase];
    if (journey.phase === 'inside') renderer.domElement.focus({ preventScroll: true });
    if (journey.phase === 'door' && !document.querySelector('#eco-scene').hidden) ui.enter.focus({ preventScroll: true });
  }
  function updateScene(dt = 0, snap = false) {
    navigation.updateZone();
    const desiredY = floorHeight(navigation.position);
    actorY += (desiredY - actorY) * (snap || journey.reduced ? 1 : 1 - Math.exp(-14 * dt));
    const { position, heading } = journey.phase === 'inside' ? { position: [navigation.position[0], actorY, navigation.position[1]], heading: navigation.heading } : journey.pose;
    if (journey.phase === 'walking') position[1] = floorHeight([position[0], position[2]]);
    host.dataset.zone = journey.phase === 'inside' ? navigation.zone : 'intro';
    character.position.set(...position);
    const turn = Math.atan2(Math.sin(heading - character.rotation.y), Math.cos(heading - character.rotation.y));
    character.rotation.y += turn * (snap ? 1 : 1 - Math.exp(-10 * dt));
    const standing = journey.phase === 'resting' || journey.phase === 'waking' ? 0 : journey.phase === 'standing' ? smooth(journey.progress) : 1;
    const awake = journey.phase === 'resting' ? 0 : journey.phase === 'waking' ? smooth(journey.progress) : 1;
    const stepping = journey.phase === 'walking' || journey.phase === 'entering' && journey.time > 0.65;
    const stride = journey.reduced ? 0 : travelled > 0.001 && journey.phase === 'inside' ? Math.sin(navigation.distance * 7) : stepping ? Math.sin(journey.time * (journey.phase === 'walking' ? 7.2 * introWalkSpeed : 9)) : 0;
    // Crouching folds the knees and drops the hips so the boots stay on the ground; running leans in and swings wider.
    const gait = currentGait();
    crouchAmount += ((gait === 'crouch' ? 1 : 0) - crouchAmount) * (snap || journey.reduced ? 1 : 1 - Math.exp(-12 * dt));
    const swing = gait === 'run' && travelled > 0.001 ? 1.45 : 1 - crouchAmount * 0.4;
    hips.position.y = 0.5 + standing * 0.4 + Math.abs(stride) * 0.025 * swing - crouchAmount * 0.18;
    torso.rotation.x = -0.17 * (1 - standing) + crouchAmount * 0.35 + (gait === 'run' && travelled > 0.001 ? 0.14 : 0);
    head.rotation.set(0.1 * (1 - awake) - crouchAmount * 0.25, 0, -0.15 * (1 - awake));
    eyes.forEach(eye => { eye.scale.x = 0.1 * (1 - awake * 0.5); eye.scale.y = 0.035 * (1 + awake * 1.5); });
    eyeWhites.forEach(eye => { eye.visible = awake > 0.5; });
    limbs.forEach(({ side, arm, thigh, shin }) => {
      thigh.rotation.x = -Math.PI / 2 * (1 - standing) + side * stride * 0.4 * swing - crouchAmount * 0.8;
      shin.rotation.x = Math.PI / 2 * (1 - standing) + Math.max(0, -side * stride) * 0.25 * swing + crouchAmount * 1.3;
      arm.rotation.x = -0.4 * (1 - standing) - side * stride * 0.3 * swing - crouchAmount * 0.3;
    });
    host.dataset.gait = gait;
    character.scale.y = 1 + (journey.phase === 'resting' ? Math.sin(elapsed * 1.6) * 0.008 : 0);
    door.rotation.y = journey.phase === 'inside' ? (navigation.zone === 'inside' || navigation.destination === 'door' || Math.hypot(position[0]-doorway.threshold[0], position[2]-doorway.threshold[1]) < 2 ? Math.PI / 2 : 0) : journey.phase === 'entering' ? smooth(journey.time / 0.65) * Math.PI / 2 : 0;
    let cutaway = journey.phase === 'inside' && navigation.zone === 'inside' || journey.phase === 'entering' && journey.time >= 1.3;
    chestLid.rotation.x += ((chestOpen ? -1.15 : 0) - chestLid.rotation.x) * (snap || journey.reduced ? 1 : 1 - Math.exp(-9 * dt));
    chestLid.position.z = -0.33 + Math.sin(-chestLid.rotation.x) * 0.17; // Slide the lid inward as it opens to clear the wall.
    // The dog eases into its new pose; while ambient motion is paused it changes pose at once.
    poseDog(snap || paused ? 1 : 1 - Math.exp(-8 * dt));
    if (!paused && dogPose === 'stand') dogParts.tail.rotation.y = Math.sin(elapsed * 12) * 0.5;
    dogParts.body.scale.y = dogPose === 'sleep' && !paused ? 1 + Math.sin(elapsed * 2.2) * 0.04 : 1;
    host.dataset.destination = navigation.destination || '';
    host.dataset.walking = String(navigation.route.length > 0);

    host.dataset.position = position.map(v => v.toFixed(2)).join(',');
    let desiredSpan;
    if (['resting', 'waking', 'standing'].includes(journey.phase)) {
      desiredTarget.set(outdoorRoute[0][0], 1.25, outdoorRoute[0][2]);
      desiredSpan = 6.7 + standing * 2.3;
    } else if (journey.phase === 'walking') {
      desiredTarget.set(position[0] + 0.7, position[1] + 0.9, position[2] - 0.35);
      desiredSpan = 7.2;
    } else {
      const inside = journey.phase === 'inside' ? 1 : journey.phase === 'entering' ? smooth(journey.progress) : 0;
      desiredTarget.set(3.4 - inside * 0.25, 1.3 - inside * 0.15, 1 - inside * 1.8);
      desiredSpan = 7.8 - inside * 2.1;
      if (journey.phase === 'inside') { desiredTarget.set(position[0], position[1] + 0.9, position[2] - 0.2); desiredSpan = navigation.zone === 'inside' ? 5.7 : 7.3; }
    }
    desiredSpan = Math.max(desiredSpan, (journey.phase === 'inside' && navigation.zone === 'inside' ? 5.8 : 7.8) / aspect);
    // Far out, the view drifts from the character to the island's centre so the whole island fits.
    desiredTarget.lerp(islandCentre, Math.max(0, Math.min(1, (zoom - 3) / 3)));
    const blend = snap || journey.reduced ? 1 : 1 - Math.exp(-3.5 * dt);
    target.lerp(desiredTarget, blend); span += (desiredSpan - span) * blend;
    // Zooming out past 1.5x also lifts the camera toward a high, steeper view; x/z keep their ratio so WASD still maps to the screen.
    zoomShown += (zoom - zoomShown) * blend;
    const tilt = Math.max(0, Math.min(1, (zoomShown - 1.5) / 2.5));
    offset.set(13 * (1 - 0.45 * tilt), 10.5 + 22 * tilt, 18 * (1 - 0.45 * tilt));
    const reach = Math.max(1, zoomShown);
    scene.fog.near = offset.length() + 8 * reach; scene.fog.far = offset.length() + 60 * reach;
    if (Math.hypot(target.x - shadowCenter.x, target.z - shadowCenter.z) > 3 * reach || Math.abs(sun.shadow.camera.right - 13 * reach) > 0.5) {
      shadowCenter.set(Math.round(target.x), 0, Math.round(target.z));
      sun.target.position.copy(shadowCenter); sun.position.set(shadowCenter.x - 9, 15, shadowCenter.z + 8);
      Object.assign(sun.shadow.camera, { left: -13 * reach, right: 13 * reach, top: 13 * reach, bottom: -13 * reach, far: 40 + 20 * (reach - 1) });
      sun.shadow.camera.updateProjectionMatrix();
    }
    camera.left = -span * zoomShown * aspect / 2; camera.right = span * zoomShown * aspect / 2;
    camera.top = span * zoomShown / 2; camera.bottom = -span * zoomShown / 2;
    camera.position.copy(target).add(offset); camera.lookAt(target);
    camera.setViewOffset(width, height, 0, height * 0.035, width, height);
    camera.updateProjectionMatrix();
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const headPosition = character.position.clone().add(new THREE.Vector3(0, 1.85, 0));
    occlusionRay.set(camera.position, headPosition.clone().sub(camera.position).normalize());
    occlusionRay.far = camera.position.distanceTo(headPosition) - 0.15;
    if (journey.phase === 'inside' && occlusionRay.intersectObjects([roof, frontWall, rightWall, backWall, leftWall], true).length) cutaway = true;
    roof.visible = frontWall.visible = rightWall.visible = backWall.visible = leftWall.visible = pendant.visible = !cutaway;
    host.dataset.cutaway = String(cutaway);
    const blockingCrowns = new Set(occlusionRay.intersectObjects(crowns, true).map(hit => hit.object.parent));
    crowns.forEach(crown => crown.traverse(mesh => {
      if (!mesh.isMesh) return;
      const blocked = journey.phase === 'inside' && blockingCrowns.has(crown);
      materialList(mesh).forEach(material => { material.transparent = blocked; material.opacity = blocked ? 0.24 : 1; material.depthWrite = !blocked; });
    }));
    // A low cloud over the character thins out quickly, so it only ever veils the view.
    const blockingClouds = new Set(occlusionRay.intersectObjects(lowClouds.map(c => c.cloud), true).map(hit => hit.object.parent));
    lowClouds.forEach(entry => {
      const goal = blockingClouds.has(entry.cloud) ? 0.12 : 0.5;
      entry.opacity += (goal - entry.opacity) * (snap || journey.reduced ? 1 : 1 - Math.exp(-6 * dt));
      entry.material.opacity = entry.opacity;
    });
    if (journey.phase === 'inside') Object.entries(objectButtons).forEach(([key, button]) => {
      button.hidden = key !== 'door' && navigation.zone === 'outside';
      if (key === 'door') { button.querySelector('strong').textContent = navigation.zone === 'inside' ? 'Explore island' : 'Enter workshop'; }
      projected.set(...labelAnchors[key]); house.localToWorld(projected); projected.project(camera);
      button.style.left = `${Math.max(55, Math.min(width - 55, (projected.x + 1) * width / 2))}px`;
      button.style.top = `${Math.max(95, Math.min(height - 145, (1 - projected.y) * height / 2))}px`;
    });
    if (journey.phase === 'inside' && !controlsPaused) {
      const nearbyPoints = navigation.zone === 'inside' ? { ...interactionPoints, door: [3.85,1.35] } : { door: [3.85,2.9] };
      nearest = Object.keys(nearbyPoints).sort((a,b) => Math.hypot(...nearbyPoints[a].map((v,i) => v-navigation.position[i])) - Math.hypot(...nearbyPoints[b].map((v,i) => v-navigation.position[i])))[0];
      if (Math.hypot(...nearbyPoints[nearest].map((v,i) => v-navigation.position[i])) > 0.85) nearest = null;
      const name = key => key === 'door' ? 'the doorway' : objectButtons[key].querySelector('strong').textContent;
      const text = navigation.destination ? `Walking to ${name(navigation.destination)} · Esc to cancel` : nearest ? nearest === 'door' ? navigation.zone === 'inside' ? 'Doorway · E / Enter to explore the island' : 'Doorway · E / Enter to enter the workshop' : `${name(nearest)} · E / Enter to open` : 'WASD / arrows to move · Shift run · Ctrl crouch · Click the ground or an object';
      if (prompt.textContent !== text) prompt.textContent = text;
      host.dataset.destination = navigation.destination || ''; host.dataset.nearby = nearest || '';
    }
    syncUI();
  }
  function render() { animateFurnace(elapsed, !paused); renderer.render(scene, camera); }
  function resize() {
    const bounds = host.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    ({ width, height } = bounds);
    aspect = width / height; renderer.setSize(width, height);
    updateScene(0, true); render();
  }
  function animate(time) {
    const dt = previousTime === null ? 0 : Math.min((time - previousTime) / 1000, 1);
    previousTime = time;
    if (!paused) {
      elapsed += dt;
      // Wind blows in gusts every so often; plants lean in the shader and tree crowns rock with it.
      const gust = Math.max(0, Math.sin(elapsed * 0.21) + 0.6 * Math.sin(elapsed * 0.53 + 1.7) - 0.55);
      wind.uTime.value = elapsed; wind.uWind.value = 0.05 + gust * 0.32;
      crowns.forEach((crown, i) => { crown.rotation.z = Math.sin(elapsed * 0.7 + i) * 0.012 + gust * 0.03 * (0.6 + 0.4 * Math.sin(elapsed * 2.1 + i)); });
      lowClouds.forEach(({ cloud, x }) => { cloud.position.x = (x + elapsed * 0.45 + 50) % 100 - 50; });
      pondSurface.position.y = 0.12 + Math.sin(elapsed * 1.1) * 0.007;
      // Each fish leaps in a short arc once per period, pitching nose-up then nose-down, with a splash at each end.
      for (const f of fish) {
        const u = ((elapsed + f.offset) % f.period) / 0.9;
        f.leap.visible = u < 1;
        if (u < 1) {
          const heading = f.leap.rotation.y;
          f.leap.position.set(f.x + Math.cos(heading) * (u - 0.5) * 1.2, -0.22 + 0.95 * Math.sin(Math.PI * u), f.z - Math.sin(heading) * (u - 0.5) * 1.2);
          f.body.rotation.z = (0.5 - u) * 2.2;
        }
        f.splashMaterial.opacity = u < 0.2 ? 0.6 * (1 - u / 0.2) : u > 0.85 && u < 1.25 ? 0.6 * (1 - Math.abs(u - 1) / 0.25) : 0;
        f.splash.position.x = f.x + Math.cos(f.leap.rotation.y) * (u > 0.6 ? 0.6 : -0.6);
        f.splash.position.z = f.z - Math.sin(f.leap.rotation.y) * (u > 0.6 ? 0.6 : -0.6);
      }
      lake.position.y = Math.sin(elapsed * 1.1 + 1) * 0.007;
      waterHighlights.position.x = Math.sin(elapsed * 0.35) * 0.18;
      shine.opacity = 0.28 + Math.sin(elapsed * 0.65) * 0.07;
      clouds.position.x = Math.sin(elapsed * 0.04) * 0.6;
      bubbles.forEach(({ mesh, y }, i) => { mesh.position.y = y + Math.sin(elapsed * 0.65 + i) * 0.12; });
    }
    if (!controlsPaused) journey.advance(dt);
    travelled = 0;
    if (journey.phase === 'inside' && !controlsPaused) {
      const before = navigation.distance;
      const vertical = Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'));
      const horizontal = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
      if (vertical || horizontal) {
        const scale = gaits[currentGait()] * Math.min(dt, 0.12) / Math.hypot(vertical, horizontal) / Math.hypot(offset.x, offset.z);
        navigation.move((-offset.x * vertical + offset.z * horizontal) * scale, (-offset.z * vertical - offset.x * horizontal) * scale);
      } else {
        const arrived = navigation.advance(dt, gaits[currentGait()]);
        if (arrived) {
          const face = house.localToWorld(new THREE.Vector3(...labelAnchors[arrived]));
          navigation.heading = Math.atan2(face.x - navigation.position[0], face.z - navigation.position[1]);
          finishApproach(arrived);
        }
      }
      travelled = navigation.distance - before;
    }
    updateScene(dt); render();
    sampleStarted ??= time; frameCount++;
    if (time - sampleStarted >= 2000) {
      host.dataset.fps = String(Math.round(frameCount * 1000 / (time - sampleStarted)));
      host.dataset.drawCalls = String(renderer.info.render.calls);
      frameCount = 0; sampleStarted = time;
    }
    if (paused && !journey.moving && !keys.size && !navigation.route.length && Math.abs(chestLid.rotation.x - (chestOpen ? -1.15 : 0)) < 0.001) syncMotion(false);
  }
  function syncMotion(snap = true) {
    previousTime = null; frameCount = 0; sampleStarted = null;
    const visible = !contextLost && !document.hidden && !document.querySelector('#eco-scene').hidden;
    renderer.setAnimationLoop(visible && (!paused || journey.moving || keys.size || navigation.route.length || Math.abs(chestLid.rotation.x - (chestOpen ? -1.15 : 0)) > 0.001) ? animate : null);
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.textContent = paused ? 'Resume ambient motion' : 'Pause ambient motion';
    ui.reduced.hidden = !journey.reduced;
    host.dataset.reducedMotion = String(journey.reduced);
    document.querySelector('#eco-reduce').setAttribute('aria-pressed', String(journey.reduced));
    if (visible) { updateScene(0, snap); render(); }
  }
  for (const [button, action] of [[ui.start, 'start'], [ui.skip, 'skip'], [ui.direct, 'direct'], [ui.enter, 'enter']]) {
    button.disabled = false;
    button.addEventListener('click', () => { if (journey[action]()) syncMotion(journey.reduced || action === 'skip' || action === 'direct'); });
  }
  document.querySelector('#eco-quality').addEventListener('click', () => { lowQuality = !lowQuality; applyQuality(); resize(); syncMotion(false); });
  // View range cycles how much of the world the camera frames, without changing its angle.
  const rangeButton = document.querySelector('#eco-range');
  const setZoom = (value, label) => {
    zoom = Math.max(0.6, Math.min(9, value));
    rangeButton.textContent = `View range: ${label ?? `${zoom.toFixed(1)}×`}`;
    host.dataset.zoom = zoom.toFixed(2);
    syncMotion(false);
  };
  rangeButton.addEventListener('click', () => {
    viewRange = (viewRange + 1) % viewRanges.length;
    setZoom(viewRanges[viewRange][1], viewRanges[viewRange][0]);
  });
  // Mouse wheel (with or without Ctrl, which also covers trackpad pinch) zooms smoothly, out to a high view of the whole island.
  renderer.domElement.addEventListener('wheel', event => {
    event.preventDefault();
    setZoom(zoom * Math.exp(event.deltaY * (event.ctrlKey ? 0.004 : 0.0012)));
  }, { passive: false });
  // Screenshot: render a fresh frame and read the canvas in the same task, before the buffer is cleared.
  document.querySelector('#eco-shot').addEventListener('click', () => {
    render();
    const link = document.createElement('a');
    link.href = renderer.domElement.toDataURL('image/png');
    link.download = `minejob-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    link.click();
  });
  document.querySelector('#eco-reduce').addEventListener('click', () => { journey.setReduced(!journey.reduced); paused = journey.reduced; clearControls(); syncMotion(); });
  motionButton.addEventListener('click', () => { paused = !paused; syncMotion(false); });
  reducedMotion.addEventListener('change', () => { paused = reducedMotion.matches || options.get('motion') === 'reduce'; journey.setReduced(paused); syncMotion(); });
  document.addEventListener('workshop-panel', event => {
    controlsPaused = event.detail.open; clearControls();
    host.dataset.controlsPaused = String(controlsPaused);
    highlight(null); syncMotion(false);
  });
  document.addEventListener('workshop-chest', event => { chestOpen = event.detail.open; host.dataset.chestOpen = String(chestOpen); syncMotion(false); });
  document.addEventListener('workshop-tasks', event => updateFurnace(event.detail));
  document.addEventListener('visibilitychange', () => { clearControls(); syncMotion(); });
  window.addEventListener('hashchange', () => { clearControls(); resize(); syncMotion(); });
  window.addEventListener('resize', resize);
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); contextLost = true; clearControls(); renderer.setAnimationLoop(null);
    document.querySelector('#scene-options').open = true;
    document.querySelector('#workshop-objects').hidden = true;
    status.textContent = 'The 3D view paused. Reload to restore it, or open Your materials to continue.';
    status.hidden = false;
    [ui.start, ui.skip, ui.direct, ui.enter].forEach(button => { button.disabled = true; });
  });
  renderer.compile(scene, camera); // compile every material up front, so zooming out to new parts of the island does not stall
  resize(); syncMotion(); updateFurnace(window.furnaceState?.()); status.hidden = true; host.dataset.ready = 'true';
} catch (error) {
  if (options.get('view') !== '2d') console.error('MineJob scene unavailable:', error);
  document.querySelector('#scene-options').open = true;
  host.replaceChildren();
  document.querySelector('#journey-intro').hidden = true;
  document.querySelector('#journey-shortcuts').hidden = true;
  status.textContent = options.get('view') === '2d' ? 'Form view enabled. Use the top-right menu to upload materials or prepare applications.' : '3D is unavailable on this device. Use the top-right menu to upload materials or prepare applications.';
  motionButton.hidden = true;
  document.querySelector('#eco-quality').hidden = document.querySelector('#eco-reduce').hidden = true;
  document.querySelector('#eco-range').hidden = document.querySelector('#eco-shot').hidden = true;
}
