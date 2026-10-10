import { outdoorRoute, Journey } from './journey.js';
import { IslandNavigation, interactionPoints, doorway, islandTiles, floorHeight } from './room-navigation.js';
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
  scene.background = new THREE.Color('#afd9f2');
  scene.fog = new THREE.Fog('#afd9f2', 32, 85);
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
  scene.add(sun);

  const camera = new THREE.OrthographicCamera(-12, 12, 8, -8, 0.1, 150);
  const target = new THREE.Vector3(0, 0.8, 0);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const materials = new Map();
function pixelTexture(hex) {
  const size = 16, c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const light = (max + min) / 510, sat = max === 0 ? 0 : (max - min) / max;
  let kind = 'flat';  // flat 表示云、玻璃框、衣服等，保持原色
  if (light > 0.82) kind = 'flat';
  else if (g > r && g >= b && sat > 0.2) kind = 'grass';
  else if (r > b + 30 && sat > 0.18) kind = light < 0.5 ? 'dirt' : 'plank';
  else if (sat < 0.3) kind = 'stone';
  // 每种材质向 Minecraft 的标准色靠拢，mix 越大越像，越小越保留原来的柔和色
  const mc = { grass: [104, 168, 60], dirt: [134, 96, 67], plank: [168, 134, 80], stone: [128, 128, 128], flat: [r, g, b] };
  const mix = kind === 'flat' ? 0 : 0.55;
  const base = [r, g, b].map((v, i) => v * (1 - mix) + mc[kind][i] * mix);
  const amp = { grass: 0.12, dirt: 0.14, plank: 0.06, stone: 0.1, flat: 0.04 }[kind];
  let s = n;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let k = 1 + (rnd() - 0.5) * 2 * amp;
    const d = rnd();
    if (kind === 'grass') k *= d < 0.14 ? 0.72 : d > 0.92 ? 1.15 : 1;
    if (kind === 'dirt') k *= d < 0.18 ? 0.68 : d > 0.92 ? 1.2 : 1;
    if (kind === 'plank') k *= (y % 4 === 3 ? 0.78 : 1) * (d < 0.1 ? 0.92 : 1);
    if (kind === 'stone') k *= d < 0.2 ? 0.8 : d > 0.9 ? 1.12 : 1;
    const [R, G, B] = base.map(v => Math.max(0, Math.min(255, v * k)) | 0);
    ctx.fillStyle = `rgb(${R},${G},${B})`;
    ctx.fillRect(x, y, 1, 1);
  }
  if (kind !== 'flat') { ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.strokeRect(0.5, 0.5, size - 1, size - 1); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  return t;
}
function matte(color, roughness = 0.85) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ map: pixelTexture(color), roughness }));
  return materials.get(color);
}
  function box(parent, size, position, material) {
    const mesh = new THREE.Mesh(cube, typeof material === 'string' ? matte(material) : material);
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
  const grasses = ['#83b954', '#8abd59', '#91c365', '#9acb6c', '#80b259'];
  const soils = ['#bba77c', '#c6b48c', '#b7a181', '#a99474'];
  // A stepped shoreline, with every visible edge built from solid geometry.
  for (const [x, z] of islandTiles) {
      const edge = Math.abs(x) >= 7 || Math.abs(z) >= 4;
      const depth = edge ? 0.7 + random() * 0.22 : 1.12;
      box(island, [1, depth, 1], [x, -depth / 2 - 0.12, z], soils[Math.floor(random() * soils.length)]);
      box(island, [1, 0.22, 1], [x, -0.01, z], grasses[Math.floor(random() * grasses.length)]);
      if (edge && random() > 0.55) box(island, [0.92, 0.4, 0.92], [x, -depth - 0.27, z], '#a5b9ae');
  }
  const seaMaterial = new THREE.MeshPhysicalMaterial({ color: '#48b6d0', roughness: 0.23, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.13 });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), seaMaterial);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -1.55;
  sea.receiveShadow = true;
  scene.add(sea);
  const waterHighlights = new THREE.Group();
  scene.add(waterHighlights);
  const shine = new THREE.MeshBasicMaterial({ color: '#e2fffa', transparent: true, opacity: 0.35, depthWrite: false });
  for (let i = 0; i < 60; i++) {
    const x = (random() - 0.5) * 48, z = (random() - 0.5) * 35;
    if (Math.abs(x) < 9 && Math.abs(z) < 6) continue;
    const glint = box(waterHighlights, [0.4 + random() * 1.1, 0.008, 0.045], [x, -1.53, z], shine);
    glint.castShadow = glint.receiveShadow = false;
  }

  const crowns = [];
  function tree(x, z, scale = 1) {
    const tree = new THREE.Group();
    tree.position.set(x, 0.1, z);
    tree.scale.setScalar(scale);
    island.add(tree);
    box(tree, [0.62, 3.1, 0.62], [0, 1.5, 0], '#9a7450');
    box(tree, [0.08, 2.8, 0.63], [-0.32, 1.45, 0], '#b18b60');
    box(tree, [1.1, 0.35, 0.44], [0.32, 2.6, 0], '#9a7450').rotation.z = 0.45;
    const crown = new THREE.Group();
    crown.position.y = 3.1;
    tree.add(crown);
    for (const [size, position, color] of [
      [[3.25, 1.25, 2.8], [0, 0, 0], '#64a74b'],
      [[2.65, 1.0, 2.35], [-0.3, 1.02, -0.08], '#7fbb55'],
      [[1.7, 0.65, 1.65], [-0.35, 1.83, -0.1], '#9ccc65'],
      [[1.05, 0.9, 1.4], [1.5, 0.2, 0.28], '#72b34e'],
      [[1.1, 0.75, 1.45], [-1.48, 0.12, 0.1], '#91c961'],
    ]) box(crown, size, position, color);
    for (let i = 0; i < 20; i++) {
      box(crown, [0.48, 0.25, 0.48], [(random() - 0.5) * 2.8, random() * 1.4, (random() - 0.5) * 2.4], i % 2 ? '#9acb67' : '#75b851');
    }
    crowns.push(crown);
    return tree;
  }
  tree(-1.8, 0.6, 1.12);
  tree(-6, -3.45, 0.68);
  tree(7.5, -3.9, 0.7);

  // Original block adventurer. Bent knees and a tilted head read as resting.
  const character = new THREE.Group();
  character.position.set(...outdoorRoute[0]);
  character.rotation.y = 0.28;
  island.add(character);
  const hips = new THREE.Group(); character.add(hips);
  const torso = new THREE.Group(); hips.add(torso);
  box(torso, [0.64, 0.72, 0.38], [0, 0.36, 0], '#38adb0');
  box(torso, [0.68, 0.07, 0.41], [0, 0, 0], '#257c88');
  const head = new THREE.Group();
  head.position.set(0, 1.02, 0.05);
  head.rotation.z = -0.15;
  head.rotation.x = 0.1;
  torso.add(head);
  box(head, [0.55, 0.55, 0.55], [0, 0, 0], '#d7ad7e');
  box(head, [0.57, 0.14, 0.58], [0, 0.23, -0.01], '#634c3b');
  box(head, [0.57, 0.32, 0.12], [0, 0.03, -0.23], '#634c3b');
  box(head, [0.15, 0.25, 0.11], [-0.21, 0.1, 0.23], '#634c3b');
  const eyes = [], eyeWhites = [];
  for (const x of [-0.13, 0.13]) {
    eyeWhites.push(box(head, [0.15, 0.10, 0.02], [x, -0.03, 0.282], '#fff5e5'));
    eyes.push(box(head, [0.1, 0.035, 0.025], [x, -0.03, 0.3], '#634c3b'));
  }
  box(head, [0.13, 0.025, 0.027], [0, -0.17, 0.282], '#ab785e');
  const limbs = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * 0.44, 0.62, 0); torso.add(arm);
    box(arm, [0.24, 0.24, 0.26], [0, -0.12, 0], '#38adb0');
    box(arm, [0.22, 0.56, 0.24], [0, -0.4, 0], '#d7ad7e');
    const thigh = new THREE.Group(); thigh.position.x = side * 0.18; hips.add(thigh);
    box(thigh, [0.27, 0.42, 0.28], [0, -0.21, 0], '#536c98');
    const shin = new THREE.Group(); shin.position.y = -0.42; thigh.add(shin);
    box(shin, [0.27, 0.4, 0.26], [0, -0.2, 0], '#536c98');
    box(shin, [0.3, 0.16, 0.38], [0, -0.42, 0.04], '#4a575b');
    limbs.push({ side, arm, thigh, shin });
  }
  // A small satchel, left beside the tree instead of used as a UI prop.
  box(island, [0.42, 0.48, 0.28], [-1.9, 0.35, 1.95], '#cc9c58');
  box(island, [0.45, 0.09, 0.31], [-1.9, 0.63, 1.95], '#a9804c');

  const house = new THREE.Group();
  house.position.set(3.15, 0.12, -0.8);
  house.scale.set(1.6, 1, 1.6);
  island.add(house);
  const frontWall = new THREE.Group(), rightWall = new THREE.Group(), backWall = new THREE.Group(), leftWall = new THREE.Group();
  house.add(frontWall, rightWall, backWall, leftWall);
  const wood = matte('#d6ba8d');
  const paleWood = matte('#f0dfbb');
  const frame = matte('#eaf5df', 0.4);
  const glass = new THREE.MeshPhysicalMaterial({ color: '#d6fff3', transmission: 0.82, roughness: 0.09, thickness: 0.08, ior: 1.45, metalness: 0, clearcoat: 1 });
  box(house, [4.75, 0.28, 3.95], [0, 0.1, 0], '#c9bb9a');
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
  box(door, [0.06, 0.3, 0.08], [1.03, 1.08, 0.08], '#8aa59b');
  box(house, [1.65, 0.15, 0.5], [0.3, 0.11, 2.03], '#e7d8b5');
  box(house, [2.1, 0.11, 0.5], [0.3, 0.035, 2.36], '#e7d8b5');
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
    for (let i = 1; i <= 4; i++) box(roof, [0.84, 0.008, 0.014], [x, 0.206, -1.37 + i * 0.255], '#6293ab');
    box(roof, [0.016, 0.008, 1.28], [x, 0.207, -0.73], '#6293ab');
  }
  // Visible interior: a worktable, planting shelf, and a warm pendant.
  const table = new THREE.Group(); house.add(table);
  box(table, [1.5, 0.12, 0.65], [-0.8, 1.1, -0.68], wood);
  for (const x of [-1.4, -0.22]) for (const z of [-0.9, -0.43]) box(table, [0.09, 0.75, 0.09], [x, 0.69, z], '#a38463');
  box(table, [0.47, 0.04, 0.32], [-0.9, 1.19, -0.58], '#fffcec');
  box(table, [0.48, 0.34, 0.04], [-0.8, 1.36, -0.78], '#527b77');
  box(table, [0.42, 0.28, 0.015], [-0.8, 1.36, -0.749], '#b9efe1');
  box(table, [0.55, 0.12, 0.5], [-0.8, 0.75, 0.06], '#73a99a');
  box(house, [1.15, 0.12, 0.43], [1.25, 1.12, -1.25], wood);
  const pendant = new THREE.Group(); house.add(pendant);
  box(pendant, [0.055, 0.45, 0.055], [0.3, 2.7, -0.15], '#b4c2a3');
  const lamp = new THREE.MeshStandardMaterial({ color: '#fff6c2', emissive: '#ffe6a3', emissiveIntensity: 0.6, roughness: 0.5 });
  box(pendant, [0.42, 0.17, 0.42], [0.3, 2.47, -0.15], lamp);

  function plant(parent, x, y, z, scale = 1) {
    const plant = new THREE.Group();
    plant.position.set(x, y, z); plant.scale.setScalar(scale); parent.add(plant);
    box(plant, [0.32, 0.3, 0.32], [0, 0.15, 0], '#eed8ae');
    box(plant, [0.37, 0.08, 0.37], [0, 0.31, 0], '#f8e6bf');
    box(plant, [0.05, 0.42, 0.05], [0, 0.54, 0], '#558e56');
    box(plant, [0.28, 0.12, 0.19], [-0.12, 0.52, 0], '#82bd5c').rotation.z = -0.4;
    box(plant, [0.29, 0.12, 0.19], [0.1, 0.67, 0], '#69a854').rotation.z = 0.4;
  }
  plant(house, 1, 1.2, -1.25, 0.7);
  plant(house, 1.5, 1.2, -1.25, 0.65);
  plant(house, -1.8, 0.37, -1.1, 0.7);

  const storageChest = new THREE.Group(); storageChest.position.set(-1.48, 0.36, 0.35); house.add(storageChest);
  box(storageChest, [0.88, 0.56, 0.66], [0, 0.28, 0], '#b8894f');
  for (const x of [-0.38, 0.38]) box(storageChest, [0.08, 0.55, 0.69], [x, 0.28, 0], '#657568');
  const chestLid = new THREE.Group(); chestLid.position.set(0, 0.56, -0.33); storageChest.add(chestLid);
  box(chestLid, [0.91, 0.18, 0.69], [0, 0.09, 0.33], '#d3a565');
  for (const x of [-0.38, 0.38]) box(chestLid, [0.08, 0.18, 0.72], [x, 0.09, 0.33], '#657568');
  box(chestLid, [0.11, 0.22, 0.06], [0, -0.02, 0.69], '#fff0b5');
  const board = new THREE.Group(); board.position.set(-0.74, 2.35, -1.59); house.add(board);
  box(board, [1.38, 0.95, 0.13], [0, 0, 0], '#a7804d');
  box(board, [1.2, 0.77, 0.05], [0, 0, 0.08], '#d1b77c');
  for (const [x, y, color] of [[-0.33,0.12,'#fff4cf'],[0.29,0.1,'#cdecd4'],[0,-0.22,'#e5f0d1']]) {
    box(board, [0.37, 0.28, 0.025], [x, y, 0.12], color);
    box(board, [0.035, 0.035, 0.025], [x, y + 0.1, 0.14], '#708e58');
  }
  const furnace = new THREE.Group(); furnace.position.set(1.57, 0.36, 0.87); house.add(furnace);
  box(furnace, [0.78, 0.88, 0.7], [0, 0.44, 0], '#85958e');
  box(furnace, [0.66, 0.1, 0.64], [0, 0.91, 0], '#a7b5a9');
  box(furnace, [0.53, 0.38, 0.035], [0, 0.38, 0.365], '#354a42');
  const emberMaterial = new THREE.MeshStandardMaterial({ color: '#3c352d', emissive: '#ffad39', emissiveIntensity: 0, roughness: 0.8 });
  const embers = box(furnace, [0.38, 0.12, 0.025], [0, 0.25, 0.389], emberMaterial);
  for (const x of [-0.19, 0, 0.19]) box(furnace, [0.025, 0.31, 0.06], [x, 0.38, 0.4], '#70827a');
  const furnaceLight = new THREE.PointLight('#ffc275', 0, 2.3); furnaceLight.position.set(0, 0.45, 0.6); furnace.add(furnaceLight);
  const anvil = new THREE.Group(); anvil.position.set(-0.5, 0.36, 0.6); house.add(anvil);
  box(anvil, [0.55, 0.37, 0.48], [0, 0.185, 0], '#ad926b');
  box(anvil, [0.43, 0.08, 0.35], [0, 0.41, 0], '#536b69');
  box(anvil, [0.22, 0.2, 0.24], [0, 0.54, 0], '#687f7a');
  box(anvil, [0.67, 0.13, 0.3], [0.04, 0.68, 0], '#8fa5a0');
  box(anvil, [0.16, 0.08, 0.19], [0.43, 0.65, 0], '#8fa5a0');

  const doorwayMarker = new THREE.Group(); house.add(doorwayMarker);
  box(doorwayMarker, [0.65, 0.025, 0.38], [0.44, 0.4, 1.7], '#a0d9a5');
  box(doorwayMarker, [0.09, 0.028, 0.24], [0.44, 0.416, 1.7], '#f5fff0');
  door.traverse(mesh => { if (mesh.isMesh) mesh.userData.workshop = 'door'; });
  const interactive = { chest: storageChest, table, board, furnace, anvil, door: doorwayMarker };
  const labelAnchors = { chest: [-1.48,1.23,0.45], table: [-1.15,1.62,-0.4], board: [-0.74,2.96,-1.59], furnace: [1.65,1.45,1.02], anvil: [-0.3,1.3,1.13], door: [0.44,1.0,1.74] };
  const objectButtons = Object.fromEntries(Object.keys(interactive).map(key => [key, document.querySelector(`[data-workshop="${key}"]`)]));
  Object.entries(interactive).forEach(([key, group]) => group.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.userData.workshop = key;
    if (mesh !== embers) mesh.material = mesh.material.clone();
  }));

  // Limestone stepping stones connect the resting spot and the workshop.
  for (const [x, z, width] of [[-1.05,2.1,0.7], [-0.8,2.55,0.7], [0.3,2.65,0.85], [1.4,2.75,0.85], [2.5,2.85,0.85], [3.6,2.65,0.8]]) {
    box(island, [width, 0.08, 0.48], [x, 0.1, z], '#ede5c6');
  }
  // A sunken pond with a stepped bank and actual transparent water geometry.
  const pond = new THREE.Group(); pond.position.set(-2, 0.12, 3.85); island.add(pond);
  box(pond, [3.1, 0.13, 1.35], [0, 0, 0], '#c9d6b1');
  box(pond, [2.8, 0.08, 1.08], [0, 0.06, 0], '#49b6b9');
  const pondWater = new THREE.MeshPhysicalMaterial({ color: '#8befe0', transmission: 0.45, thickness: 0.12, roughness: 0.12, clearcoat: 1 });
  const pondSurface = box(pond, [2.8, 0.035, 1.08], [0, 0.12, 0], pondWater);
  pondSurface.castShadow = false;
  for (const [x, z] of [[-1.46, -0.5], [1.47, 0.2], [0.3, 0.66], [-0.9, 0.66]]) box(pond, [0.42, 0.22, 0.35], [x, 0.07, z], '#c2cdac');
  for (const [x, z] of [[-0.75, 0.2], [0.4, -0.25]]) {
    box(pond, [0.34, 0.025, 0.27], [x, 0.15, z], '#69a465');
    box(pond, [0.12, 0.08, 0.12], [x, 0.2, z], '#ffc6c1');
  }

  // Flowers and little grass blades are meshes, with no image textures.
  for (let i = 0; i < 90; i++) {
    const x = (random() - 0.5) * 14.5, z = (random() - 0.5) * 8.3;
    if (x > 0.6 && x < 5.9 && z > -3 && z < 2.6 || x > -4.1 && x < 4.8 && z > 1.65 && z < 4.6 || Math.hypot(x + 4.45, z - 1.05) < 1.2) continue;
    const h = 0.12 + random() * 0.2;
    box(island, [0.045, h, 0.045], [x, 0.13 + h / 2, z], '#689b47');
    if (i % 3 === 0) {
      const flowerColor = ['#fff2ba', '#e9f6e8', '#e8a0ab'][i % 7 % 3];
      box(island, [0.16, 0.08, 0.16], [x, 0.16 + h, z], flowerColor);
      box(island, [0.075, 0.085, 0.075], [x, 0.17 + h, z], '#e7ba58');
    } else box(island, [0.07, h * 0.8, 0.035], [x + 0.075, 0.13 + h * 0.4, z], '#75a54e').rotation.z = -0.25;
  }
  // Garden beds beside the glass house.
  for (const z of [-1.7, -0.65, 0.4]) {
    box(island, [1.2, 0.2, 0.7], [7.4, 0.22, z], '#b89568');
    box(island, [1.02, 0.04, 0.5], [7.4, 0.34, z], '#8c7860');
    for (const x of [7.1, 7.45, 7.75]) box(island, [0.2, 0.24, 0.25], [x, 0.48, z], '#70ac57');
  }
  // Quiet block clouds and distant green shoals give the space a horizon.
  const clouds = new THREE.Group(); scene.add(clouds);
  const cloudMaterial = matte('#f9ffff');
  for (const [x, y, z, scale] of [[-13, 7, -15, 0.7], [3, 9, -20, 0.65], [14, 8, -15, 0.75]]) {
    const cloud = new THREE.Group(); cloud.position.set(x, y, z); cloud.scale.setScalar(scale); clouds.add(cloud);
    box(cloud, [4, 0.5, 1.45], [0, 0, 0], cloudMaterial);
    box(cloud, [2.4, 0.65, 1.7], [-0.4, 0.42, 0], cloudMaterial);
    box(cloud, [1, 0.45, 1.1], [-0.6, 0.95, 0], cloudMaterial);
  }
  for (const [x, z, scale] of [[-17, -18, 1.5], [17, -22, 1.2], [1, -29, 2]]) {
    box(scene, [5 * scale, 0.5, 2.8 * scale], [x, -1.35, z], '#9abfa0');
    box(scene, [4.4 * scale, 0.18, 2.4 * scale], [x, -1, z], '#a5cc95');
  }
  const bubbleMaterial = new THREE.MeshPhysicalMaterial({ color: '#efffff', transmission: 0.97, roughness: 0.03, thickness: 0.05, ior: 1.15, clearcoat: 1 });
  const bubbles = [];
  for (const [x, y, z, radius] of [[-7.5, 2.7, 3.9, 0.19], [7.3, 4.8, -1, 0.24], [0.5, 5.5, -3, 0.13]]) {
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 12), bubbleMaterial);
    bubble.position.set(x, y, z); scene.add(bubble); bubbles.push({ mesh: bubble, y });
  }

  // Batch static ground blocks by material; keep the interactive models independent.
  const batches = new Map();
  for (const mesh of [...island.children]) if (mesh.isMesh && mesh.material.isMeshStandardMaterial && !mesh.material.transparent && !mesh.material.transmission) {
    if (!batches.has(mesh.material)) batches.set(mesh.material, []);
    batches.get(mesh.material).push(mesh);
  }
  for (const [material, meshes] of batches) {
    const batch = new THREE.InstancedMesh(cube, material, meshes.length);
    meshes.forEach((mesh, i) => { mesh.updateMatrix(); batch.setMatrixAt(i, mesh.matrix); island.remove(mesh); });
    batch.castShadow = batch.receiveShadow = true; island.add(batch);
  }
  const qualityMaterials = new Map();
  scene.traverse(mesh => { if (mesh.isMesh && mesh.material.transmission) qualityMaterials.set(mesh.material, { transmission: mesh.material.transmission, opacity: mesh.material.opacity, transparent: mesh.material.transparent }); });
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
  renderer.domElement.setAttribute('aria-label', 'Move with WASD or arrow keys. Click the ground to walk, or an object to approach it. E or Enter to interact.');
  window.addEventListener('keydown', event => {
    if (contextLost || journey.phase !== 'inside' || controlsPaused || event.target.closest('input,textarea,select,dialog,details')) return;
    const key = event.key.toLowerCase();
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
  let frameCount = 0, sampleStarted = null;
  const offset = new THREE.Vector3(13, 10.5, 18);
  const desiredTarget = new THREE.Vector3();
  let contextLost = false, controlsPaused = false, chestOpen = false, hoveredObject = null;
  crowns.forEach(crown => crown.traverse(mesh => { if (mesh.isMesh) mesh.material = mesh.material.clone(); }));
  const occlusionRay = new THREE.Raycaster();
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), projected = new THREE.Vector3();
  function highlight(key) {
    if (hoveredObject === key) return;
    hoveredObject = key;
    Object.entries(interactive).forEach(([name, group]) => {
      objectButtons[name].classList.toggle('is-hovered', name === key);
      group.traverse(mesh => {
        if (!mesh.isMesh || mesh === embers) return;
        mesh.material.emissive.set(name === key ? '#84a745' : '#000000');
        mesh.material.emissiveIntensity = name === key ? 0.22 : 0;
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
  renderer.domElement.addEventListener('pointermove', event => highlight(pick(event)));
  renderer.domElement.addEventListener('pointerleave', () => highlight(null));
  renderer.domElement.addEventListener('click', event => {
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
    furnaceLight.intensity = lit ? 1.8 : 0;
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
    const stride = journey.reduced ? 0 : travelled > 0.001 && journey.phase === 'inside' ? Math.sin(navigation.distance * 7) : stepping ? Math.sin(journey.time * 9) : 0;
    hips.position.y = 0.5 + standing * 0.4 + Math.abs(stride) * 0.025;
    torso.rotation.x = -0.17 * (1 - standing);
    head.rotation.set(0.1 * (1 - awake), 0, -0.15 * (1 - awake));
    eyes.forEach(eye => { eye.scale.x = 0.1 * (1 - awake * 0.5); eye.scale.y = 0.035 * (1 + awake * 1.5); });
    eyeWhites.forEach(eye => { eye.visible = awake > 0.5; });
    limbs.forEach(({ side, arm, thigh, shin }) => {
      thigh.rotation.x = -Math.PI / 2 * (1 - standing) + side * stride * 0.4;
      shin.rotation.x = Math.PI / 2 * (1 - standing) + Math.max(0, -side * stride) * 0.25;
      arm.rotation.x = -0.4 * (1 - standing) - side * stride * 0.3;
    });
    character.scale.y = 1 + (journey.phase === 'resting' ? Math.sin(elapsed * 1.6) * 0.008 : 0);
    door.rotation.y = journey.phase === 'inside' ? (navigation.zone === 'inside' || navigation.destination === 'door' || Math.hypot(position[0]-doorway.threshold[0], position[2]-doorway.threshold[1]) < 2 ? Math.PI / 2 : 0) : journey.phase === 'entering' ? smooth(journey.time / 0.65) * Math.PI / 2 : 0;
    let cutaway = journey.phase === 'inside' && navigation.zone === 'inside' || journey.phase === 'entering' && journey.time >= 1.3;
    chestLid.rotation.x += ((chestOpen ? -1.15 : 0) - chestLid.rotation.x) * (snap || journey.reduced ? 1 : 1 - Math.exp(-9 * dt));
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
    const blend = snap || journey.reduced ? 1 : 1 - Math.exp(-3.5 * dt);
    target.lerp(desiredTarget, blend); span += (desiredSpan - span) * blend;
    camera.left = -span * aspect / 2; camera.right = span * aspect / 2;
    camera.top = span / 2; camera.bottom = -span / 2;
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
      mesh.material.transparent = blocked; mesh.material.opacity = blocked ? 0.24 : 1; mesh.material.depthWrite = !blocked;
    }));
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
      const text = navigation.destination ? `Walking to ${name(navigation.destination)} · Esc to cancel` : nearest ? nearest === 'door' ? navigation.zone === 'inside' ? 'Doorway · E / Enter to explore the island' : 'Doorway · E / Enter to enter the workshop' : `${name(nearest)} · E / Enter to open` : 'WASD / arrows to move · Click the ground or an object';
      if (prompt.textContent !== text) prompt.textContent = text;
      host.dataset.destination = navigation.destination || ''; host.dataset.nearby = nearest || '';
    }
    syncUI();
  }
  function render() { renderer.render(scene, camera); }
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
      crowns.forEach((crown, i) => { crown.rotation.z = Math.sin(elapsed * 0.7 + i) * 0.012; });
      pondSurface.position.y = 0.12 + Math.sin(elapsed * 1.1) * 0.007;
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
        const scale = 1.65 * Math.min(dt, 0.12) / Math.hypot(vertical, horizontal) / Math.hypot(offset.x, offset.z);
        navigation.move((-offset.x * vertical + offset.z * horizontal) * scale, (-offset.z * vertical - offset.x * horizontal) * scale);
      } else {
        const arrived = navigation.advance(dt);
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
  resize(); syncMotion(); updateFurnace(window.furnaceState?.()); status.hidden = true; host.dataset.ready = 'true';
} catch (error) {
  if (options.get('view') !== '2d') console.error('MineStory scene unavailable:', error);
  document.querySelector('#scene-options').open = true;
  host.replaceChildren();
  document.querySelector('#journey-intro').hidden = true;
  document.querySelector('#journey-shortcuts').hidden = true;
  status.textContent = options.get('view') === '2d' ? 'Form view enabled. Use the top-right menu to upload materials or prepare applications.' : '3D is unavailable on this device. Use the top-right menu to upload materials or prepare applications.';
  motionButton.hidden = true;
  document.querySelector('#eco-quality').hidden = document.querySelector('#eco-reduce').hidden = true;
}
