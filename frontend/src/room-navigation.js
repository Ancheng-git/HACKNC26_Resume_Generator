// World-space footprints of the authored cabin. Character radius includes shoulders.
export const roomBounds = { minX: -0.21, maxX: 6.51, minZ: -3.52, maxZ: 1.92 };
export const roomObstacles = [
  { minX: 0.078, maxX: 1.486, minZ: -0.768, maxZ: 0.288 }, // chest
  { minX: 1.91, maxX: 3.166, minZ: -0.224, maxZ: 0.544 }, // anvil and horn
  { minX: 5.038, maxX: 6.286, minZ: 0.032, maxZ: 1.152 }, // furnace
  { minX: 2.3, maxX: 3.25, minZ: -3.38, maxZ: -2.4 }, // crafting table, against the back wall
  { minX: 5.2, maxX: 6.24, minZ: -3.4, maxZ: -1.36 }, // bed, back-right corner
  { minX: 0.02, maxX: 0.5, minZ: -3.4, maxZ: -0.9 }, // bookshelves along the left wall
];
// Every gait shares the original walk speed as its base; Shift runs and Ctrl crouches while held.
export const gaits = { walk: 1.65, run: 2.9, crouch: 0.8 };
export const interactionPoints = { chest: [0.8, 0.9], table: [3.75, -1.9], board: [3.75, -1.1], furnace: [4.45, 0.55], anvil: [3.8, 0.8] };
// The original hand-built island stays as the playable core of the larger island.
export const coreTiles = Array.from({ length: 17 * 11 }, (_, i) => [i % 17 - 8, Math.floor(i / 17) - 5])
  .filter(([x, z]) => !(Math.abs(x) === 8 && Math.abs(z) > 2 || Math.abs(x) > 6 && Math.abs(z) === 5));
// Terrain has its own seeded stream, so texture noise or scene decoration never reshapes the land.
export function terrainRandom(seed = 2026) {
  return () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = Math.imul(seed ^ seed >>> 15, seed | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const key = (x, z) => `${x},${z}`;
const terrainSeed = terrainRandom();
const phase = [terrainSeed(), terrainSeed(), terrainSeed()].map(v => v * Math.PI * 2);
const ground = new Set(coreTiles.map(([x, z]) => key(x, z)));
// A gently irregular ellipse around the core: about 11 times the original walkable area.
const RX = 30, RZ = 22;
for (let x = -RX - 3; x <= RX + 3; x++) for (let z = -RZ - 3; z <= RZ + 3; z++) {
  const angle = Math.atan2(z / RZ, x / RX);
  const radius = 1 + 0.07 * Math.sin(3 * angle + phase[0]) + 0.05 * Math.sin(5 * angle + phase[1]) + 0.03 * Math.sin(7 * angle + phase[2]);
  if ((x / RX) ** 2 + (z / RZ) ** 2 <= radius * radius) ground.add(key(x, z));
}
const tilesOf = set => [...set].map(k => k.split(',').map(Number));
// Inland water: a big western lake draining north to the sea, an eastern lake draining south, and a small pond.
const inEllipse = (x, z, cx, cz, rx, rz) => ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 <= 1;
export const lakes = [[-19, -2.5, 7, 4.6], [15.5, 3.5, 5, 3.4], [12, -14, 3.2, 2.2]];
// Each river meanders two tiles wide from its lake to the coast; three `bridge` rows carry a plank crossing wide enough to walk.
export const rivers = [
  { course: z => -19.5 + 1.8 * Math.sin(z * 0.45 + phase[0]), from: -5, toward: -1, bridge: [-10, -11, -12] },
  { course: z => 15.5 + 1.6 * Math.sin(z * 0.5 + phase[1]), from: 5, toward: 1, bridge: [12, 13, 14] },
];
const water = new Set(), bridge = new Set();
for (const [x, z] of tilesOf(ground)) {
  if (lakes.some(([cx, cz, rx, rz]) => inEllipse(x, z, cx, cz, rx, rz))) water.add(key(x, z));
  // Bridge rows follow the middle row's course, so the deck is a straight, square crossing.
  for (const { course, from, toward, bridge: rows } of rivers) if ((z - from) * toward >= 0 && Math.abs(x - course(rows.includes(z) ? rows[1] : z)) <= 1) (rows.includes(z) ? bridge : water).add(key(x, z));
}
water.forEach(k => ground.delete(k));
bridge.forEach(k => ground.add(k));
// Drop any sliver the rivers cut off near their mouths, so every land tile stays reachable.
const reached = new Set(['0,0']), frontier = [[0, 0]];
while (frontier.length) {
  const [x, z] = frontier.pop();
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = key(x + dx, z + dz); if (ground.has(k) && !reached.has(k)) { reached.add(k); frontier.push([x + dx, z + dz]); } }
}
[...ground].filter(k => !reached.has(k)).forEach(k => ground.delete(k));
export const waterTiles = tilesOf(water);
export const pondTiles = waterTiles; // all inland water; the name predates the river
export const bridgeTiles = tilesOf(bridge);
export const islandTiles = tilesOf(ground);
const land = new Set(ground);
const cell = (x, z) => (x + 512) * 1024 + z + 512; // numeric keys keep the hot collision check cheap
const landCell = new Set(islandTiles.map(([x, z]) => cell(x, z)));
const inCore = (x, z) => Math.abs(x) <= 9 && Math.abs(z) <= 6;
const nearWater = (x, z) => [-1, 0, 1].some(dx => [-1, 0, 1].some(dz => water.has(key(x + dx, z + dz))));
// Beach sand rings the inland water; the bridge is planks; everything else is grass.
export const groundKind = (x, z) => bridge.has(key(x, z)) ? 'bridge' : nearWater(x, z) ? 'sand' : 'grass';
// Clear of water and shore by `margin` whole tiles in every direction.
const inland = (x, z, margin) => {
  for (let dx = -margin; dx <= margin; dx++) for (let dz = -margin; dz <= margin; dz++) if (!land.has(key(x + dx, z + dz))) return false;
  return true;
};
const newTiles = islandTiles.filter(([x, z]) => !inCore(x, z) && !bridge.has(key(x, z)));
const pickTile = () => newTiles[Math.floor(terrainSeed() * newTiles.length)];
// The camera looks along (-13, -18) from above; anything `height` tall within height / 0.47 in front of the core would cover the intro view.
export const screensCore = (x, z, height = 4.2) => Array.from({ length: Math.ceil(height / 0.47 / 0.5) + 1 }, (_, i) => i * 0.5)
  .some(t => inCore(x - 13 / 22.2 * t, z - 18 / 22.2 * t));
const nearBridge = (x, z) => bridgeTiles.some(([bx, bz]) => Math.hypot(bx - x, bz - z) < 3);
const solids = [];
const clear = (x, z, gap) => solids.every(s => Math.hypot(s.x - x, s.z - z) > gap);
const trees = [];
for (let i = 0; i < 900 && trees.length < 18; i++) {
  const [x, z] = pickTile(), kind = terrainSeed() < 0.35 ? 'birch' : 'oak', scale = 0.6 + terrainSeed() * 0.2;
  if (inland(x, z, 2) && !nearWater(x, z) && !screensCore(x, z) && !nearBridge(x, z) && trees.every(t => Math.hypot(t.x - x, t.z - z) > 5.5)) trees.push({ x, z, scale, kind });
}
solids.push(...trees);
// Big haystacks (2x2 bales, stacked) and pumpkin patches come first, so they get room; then single blocks.
const blocks = [], blockKinds = ['boulder', 'boulder', 'melon', 'bush', 'bush', 'bush'];
const place = (count, kinds, sizeOf, margin, gap, height) => {
  for (let i = 0, placed = 0; i < 1500 && placed < count; i++) {
    const [x, z] = pickTile(), kind = kinds[Math.floor(terrainSeed() * kinds.length)], turn = Math.floor(terrainSeed() * 4), size = sizeOf[kind];
    if (inland(x, z, margin) && !nearWater(x, z) && !screensCore(x, z, height) && !nearBridge(x, z) && clear(x, z, gap)) {
      const block = { x: x + 0.5 * (size > 1.5), z: z + 0.5 * (size > 1.5), kind, size, turn, seed: terrainSeed() };
      blocks.push(block); solids.push(block); placed++;
    }
  }
};
place(6, ['haystack'], { haystack: 2 }, 2, 5, 2.1);
place(6, ['pumpkins'], { pumpkins: 2.4 }, 2, 5, 1);
place(30, blockKinds, { boulder: 0.95, melon: 0.8, bush: 0.85 }, 1, 3, 1);
// Sugar cane on the beach, lily pads on the lake and pond.
const canes = [], lilies = [];
for (let i = 0; i < 600 && canes.length < 14; i++) {
  const [x, z] = pickTile();
  if (groundKind(x, z) === 'sand' && !nearBridge(x, z) && clear(x, z, 2.2)) { const cane = { x, z, height: 1.1 + terrainSeed() * 0.8, size: 0.45 }; canes.push(cane); solids.push(cane); }
}
for (let i = 0; i < 400 && lilies.length < 22; i++) {
  const [x, z] = waterTiles[Math.floor(terrainSeed() * waterTiles.length)];
  const lily = { x: x + terrainSeed() * 0.5 - 0.25, z: z + terrainSeed() * 0.5 - 0.25, turn: terrainSeed() * Math.PI };
  if (lakes.some(([cx, cz, rx, rz]) => inEllipse(x, z, cx, cz, rx - 0.5, rz - 0.5)) && lilies.every(l => Math.hypot(l.x - lily.x, l.z - lily.z) > 1.2)) lilies.push(lily);
}
// Scattered flowers, plus single-colour meadows that paint patches of the new land.
const flowers = [];
const flowerFits = (tx, tz, x, z) => (Math.abs(x) > 8.5 || Math.abs(z) > 5.5) && inland(tx, tz, 1) && groundKind(tx, tz) === 'grass' && solids.every(t => Math.hypot(t.x - x, t.z - z) > (t.size ?? 0.9) / 2 + 0.6);
for (let i = 0; i < 1600 && flowers.length < 380; i++) {
  const [tx, tz] = pickTile();
  const x = tx + terrainSeed() - 0.5, z = tz + terrainSeed() - 0.5, height = 0.12 + terrainSeed() * 0.2, kind = terrainSeed();
  if (flowerFits(tx, tz, x, z)) flowers.push({ x, z, height, kind });
}
for (let m = 0; m < 8; m++) {
  const [cx, cz] = pickTile(), colour = m % 6;
  for (let i = 0; i < 60; i++) {
    const a = terrainSeed() * Math.PI * 2, d = Math.sqrt(terrainSeed()) * 2.4, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, height = 0.14 + terrainSeed() * 0.16;
    if (flowerFits(Math.round(x), Math.round(z), x, z)) flowers.push({ x, z, height, kind: (colour + 0.5) * 0.4 / 6 });
  }
}
// Small mushrooms in the shade under the new trees.
const mushrooms = [];
for (let i = 0; i < 12; i++) {
  const t = trees[Math.floor(terrainSeed() * trees.length)], a = terrainSeed() * Math.PI * 2, d = 0.7 + terrainSeed() * 0.6;
  const x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d, red = terrainSeed() < 0.5;
  if ((Math.abs(x) > 9 || Math.abs(z) > 6) && land.has(key(Math.round(x), Math.round(z))) && groundKind(Math.round(x), Math.round(z)) === 'grass') mushrooms.push({ x, z, red });
}
export const scenery = { trees, blocks, canes, lilies, flowers, mushrooms };
const xs = islandTiles.map(([x]) => x), zs = islandTiles.map(([, z]) => z);
export const islandBounds = { minX: Math.min(...xs) - 0.5, maxX: Math.max(...xs) + 0.5, minZ: Math.min(...zs) - 0.5, maxZ: Math.max(...zs) + 0.5 };
// A dog naps on the grass just right of the front steps, clear of the doorway and the intro path.
export const dogSpot = [5.95, 3.05];
export const outdoorObstacles = [
  { minX: dogSpot[0] - 0.5, maxX: dogSpot[0] + 0.5, minZ: dogSpot[1] - 0.3, maxZ: dogSpot[1] + 0.3 }, // dog
  { minX: -2.17, maxX: -1.43, minZ: 0.23, maxZ: 0.97 }, // resting tree trunk
  { minX: -6.24, maxX: -5.76, minZ: -3.69, maxZ: -3.21 },
  { minX: 7.25, maxX: 7.75, minZ: -4.15, maxZ: -3.65 },
  ...trees.map(({ x, z, scale }) => ({ minX: x - 0.37 * scale, maxX: x + 0.37 * scale, minZ: z - 0.37 * scale, maxZ: z + 0.37 * scale })),
  ...[...blocks, ...canes].map(({ x, z, size }) => ({ minX: x - size / 2, maxX: x + size / 2, minZ: z - size / 2, maxZ: z + size / 2 })),
  { minX: -3.55, maxX: -0.45, minZ: 3.175, maxZ: 4.525 }, // pond, including bank
  { minX: -2.13, maxX: -1.67, minZ: 1.79, maxZ: 2.11 }, // satchel
  ...[-1.7, -0.65, 0.4].map(z => ({ minX: 6.8, maxX: 8, minZ: z - 0.35, maxZ: z + 0.35 })),
];
const walls = [
  { minX: -0.32, maxX: -0.1, minZ: -3.63, maxZ: 2.03 },
  { minX: 6.4, maxX: 6.62, minZ: -3.63, maxZ: 2.03 },
  { minX: -0.21, maxX: 6.51, minZ: -3.63, maxZ: -3.41 },
  { minX: -0.21, maxX: 2.61, minZ: 1.81, maxZ: 2.03 },
  { minX: 4.65, maxX: 6.51, minZ: 1.81, maxZ: 2.03 },
];
export const doorway = { inside: [3.85, 1.1], outside: [3.85, 3.6], threshold: [3.85, 1.92] };
export function floorHeight([x, z]) {
  if (x >= -0.394 && x <= 6.694 && z >= -3.68 && z <= 2.08) return 0.49;
  if (x >= -0.65 && x <= 6.95 && z >= -3.96 && z <= 2.36) return 0.37;
  if (x >= 2.31 && x <= 4.95 && z >= 2.048 && z <= 2.848) return 0.315;
  if (x >= 1.95 && x <= 5.31 && z >= 2.576 && z <= 3.376) return 0.22;
  return 0.12;
}
const graphs = new Map();
export class RoomNavigation {
  constructor(position = [4.19, -1.04], radius = 0.45) {
    this.position = [...position]; this.radius = radius; this.heading = Math.PI;
    this.route = []; this.destination = null; this.distance = 0;
  }
  get bounds() { return roomBounds; }
  valid([x, z]) {
    const r = this.radius, b = roomBounds;
    return x >= b.minX + r && x <= b.maxX - r && z >= b.minZ + r && z <= b.maxZ - r &&
      !roomObstacles.some(o => x > o.minX - r && x < o.maxX + r && z > o.minZ - r && z < o.maxZ + r);
  }
  segment(a, b) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.06));
    for (let i = 1; i <= steps; i++) if (!this.valid(a.map((v, axis) => v + (b[axis] - v) * i / steps))) return false;
    return true;
  }
  move(dx, dz) {
    const before = [...this.position];
    // Small substeps prevent tunnelling; separate axes let the avatar slide along furniture.
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.05));
    for (let i = 0; i < steps; i++) {
      const x = [this.position[0] + dx / steps, this.position[1]];
      if (this.valid(x)) this.position = x;
      const z = [this.position[0], this.position[1] + dz / steps];
      if (this.valid(z)) this.position = z;
    }
    const travelled = Math.hypot(this.position[0] - before[0], this.position[1] - before[1]);
    if (travelled > 0.0001) this.heading = Math.atan2(this.position[0] - before[0], this.position[1] - before[1]);
    this.distance += travelled;
    return travelled;
  }
  cancel() { this.route = []; this.destination = null; }
  plan(point, destination = null) {
    this.cancel();
    if (!this.valid(point)) return false;
    if (this.segment(this.position, point)) { this.route = [[...point]]; this.destination = destination; return true; }
    const { nodes, neighbors, cols, step } = this.graph(), bounds = this.bounds;
    const nearest = p => {
      // Look near the point first; scan everything only if nothing nearby has a clear line.
      const cx = Math.round((p[0] - bounds.minX) / step), cz = Math.round((p[1] - bounds.minZ) / step), near = [];
      for (let dz = -9; dz <= 9; dz++) for (let dx = -9; dx <= 9; dx++) if (nodes.has((cz + dz) * cols + cx + dx)) near.push((cz + dz) * cols + cx + dx);
      const byDistance = list => list.sort((a, b) => Math.hypot(nodes.get(a)[0] - p[0], nodes.get(a)[1] - p[1]) - Math.hypot(nodes.get(b)[0] - p[0], nodes.get(b)[1] - p[1]));
      return byDistance(near).find(n => this.segment(p, nodes.get(n))) ?? byDistance([...nodes.keys()]).find(n => this.segment(p, nodes.get(n)));
    };
    const start = nearest(this.position), end = nearest(point);
    if (start === undefined || end === undefined) return false;
    const queue = [start], previous = new Map([[start, null]]);
    for (let i = 0; i < queue.length && !previous.has(end); i++) {
      for (const next of neighbors.get(queue[i])) if (!previous.has(next)) { previous.set(next, queue[i]); queue.push(next); }
    }
    if (!previous.has(end)) return false;
    let path = [[...point]];
    for (let node = end; node !== null; node = previous.get(node)) path.unshift(nodes.get(node));
    // Remove unnecessary grid corners only when the whole shortcut is collision-free.
    let anchor = this.position;
    while (path.length) {
      let index = path.length - 1;
      while (index > 0 && !this.segment(anchor, path[index])) index--;
      this.route.push(path[index]); anchor = path[index]; path = path.slice(index + 1);
    }
    this.destination = destination;
    return true;
  }
  // Static walk grid, built once per navigation type and radius, since walls and terrain never move.
  graph() {
    const id = `${this.constructor.name}:${this.radius}`;
    if (graphs.has(id)) return graphs.get(id);
    const step = 0.18, bounds = this.bounds, nodes = new Map(), neighbors = new Map();
    const cols = Math.floor((bounds.maxX - bounds.minX) / step) + 1, rows = Math.floor((bounds.maxZ - bounds.minZ) / step) + 1;
    for (let iz = 0; iz < rows; iz++) for (let ix = 0; ix < cols; ix++) {
      const p = [bounds.minX + ix * step, bounds.minZ + iz * step];
      if (this.valid(p)) nodes.set(iz * cols + ix, p);
    }
    // Every blocked region is wider than 0.9 (radius on both sides), so adjacent free cells 0.18 apart are always mutually reachable.
    for (const [index, p] of nodes) neighbors.set(index, [index + 1, index - 1, index + cols, index - cols]
      .filter(n => nodes.has(n) && Math.abs(nodes.get(n)[0] - p[0]) + Math.abs(nodes.get(n)[1] - p[1]) < step * 1.5));
    graphs.set(id, { nodes, neighbors, cols, step });
    return graphs.get(id);
  }
  advance(seconds, speed = 1.65) {
    let budget = Math.max(0, seconds) * speed;
    while (this.route.length && budget > 0) {
      const next = this.route[0], dx = next[0] - this.position[0], dz = next[1] - this.position[1], distance = Math.hypot(dx, dz);
      if (distance < 0.001) { this.route.shift(); continue; }
      const travel = Math.min(distance, budget);
      this.move(dx / distance * travel, dz / distance * travel); budget -= travel;
      if (travel === distance) this.route.shift();
    }
    if (!this.route.length && this.destination) { const arrived = this.destination; this.destination = null; return arrived; }
    return null;
  }
}

const islandObstacles = [...roomObstacles, ...outdoorObstacles, ...walls];
export class IslandNavigation extends RoomNavigation {
  zone = 'inside';
  get bounds() { return islandBounds; }
  valid([x, z]) {
    const r = this.radius;
    // The whole square footprint must stay over actual ground tiles, including notched corners.
    const x0 = Math.floor(x - r + 0.5), x1 = Math.floor(x + r + 0.5), z0 = Math.floor(z - r + 0.5), z1 = Math.floor(z + r + 0.5);
    if (!landCell.has(cell(x0, z0)) || !landCell.has(cell(x0, z1)) || !landCell.has(cell(x1, z0)) || !landCell.has(cell(x1, z1))) return false;
    return !islandObstacles.some(o => x > o.minX - r && x < o.maxX + r && z > o.minZ - r && z < o.maxZ + r);
  }
  updateZone() {
    const [x, z] = this.position;
    if (this.zone === 'inside' && z > 2.45) this.zone = 'outside';
    if (this.zone === 'outside' && x > roomBounds.minX && x < roomBounds.maxX && z < 1.5 && z > roomBounds.minZ) this.zone = 'inside';
  }
}
