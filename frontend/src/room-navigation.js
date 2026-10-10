// World-space footprints of the authored cabin. Character radius includes shoulders.
export const roomBounds = { minX: -0.21, maxX: 6.51, minZ: -3.52, maxZ: 1.92 };
export const roomObstacles = [
  { minX: 0.67, maxX: 3.07, minZ: -2.48, maxZ: -1.36 }, // desk
  { minX: 1.43, maxX: 2.31, minZ: -1.104, maxZ: -0.304 }, // chair
  { minX: 0.078, maxX: 1.486, minZ: -0.768, maxZ: 0.288 }, // chest
  { minX: 1.91, maxX: 3.166, minZ: -0.224, maxZ: 0.544 }, // anvil and horn
  { minX: 5.038, maxX: 6.286, minZ: 0.032, maxZ: 1.152 }, // furnace
  { minX: 4.23, maxX: 6.07, minZ: -3.144, maxZ: -2.456 }, // planting shelf
  { minX: 0.02, maxX: 0.52, minZ: -2.81, maxZ: -2.31 }, // planter
];
export const interactionPoints = { chest: [0.8, 0.9], table: [3.75, -1.9], board: [3.75, -1.1], furnace: [4.45, 0.55], anvil: [3.8, 0.8] };
export const islandBounds = { minX: -8.5, maxX: 8.5, minZ: -5.5, maxZ: 5.5 };
export const islandTiles = Array.from({ length: 17 * 11 }, (_, i) => [i % 17 - 8, Math.floor(i / 17) - 5])
  .filter(([x, z]) => !(Math.abs(x) === 8 && Math.abs(z) > 2 || Math.abs(x) > 6 && Math.abs(z) === 5));
const land = new Set(islandTiles.map(point => point.join(',')));
export const outdoorObstacles = [
  { minX: -2.17, maxX: -1.43, minZ: 0.23, maxZ: 0.97 }, // resting tree trunk
  { minX: -6.24, maxX: -5.76, minZ: -3.69, maxZ: -3.21 },
  { minX: 7.25, maxX: 7.75, minZ: -4.15, maxZ: -3.65 },
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
    const step = 0.18, nodes = [], lookup = new Map();
    // ponytail: a small fixed island uses a grid; cache the graph if the map grows.
    const bounds = this.bounds;
    for (let iz = 0; iz * step <= bounds.maxZ - bounds.minZ; iz++) {
      for (let ix = 0; ix * step <= bounds.maxX - bounds.minX; ix++) {
        const p = [bounds.minX + ix * step, bounds.minZ + iz * step];
        if (this.valid(p)) { const node = { p, ix, iz, previous: null }; nodes.push(node); lookup.set(`${ix},${iz}`, node); }
      }
    }
    const nearest = p => [...nodes].sort((a, b) => Math.hypot(a.p[0] - p[0], a.p[1] - p[1]) - Math.hypot(b.p[0] - p[0], b.p[1] - p[1])).find(n => this.segment(p, n.p));
    const start = nearest(this.position), end = nearest(point);
    if (!start || !end) return false;
    const queue = [start], visited = new Set([start]);
    for (let i = 0; i < queue.length && !visited.has(end); i++) {
      const node = queue[i];
      for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const neighbor = lookup.get(`${node.ix + dx},${node.iz + dz}`);
        if (neighbor && !visited.has(neighbor) && this.segment(node.p, neighbor.p)) { neighbor.previous = node; visited.add(neighbor); queue.push(neighbor); }
      }
    }
    if (!visited.has(end)) return false;
    let path = [[...point]];
    for (let node = end; node; node = node.previous) path.unshift(node.p);
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
    if (![-r, r].every(dx => [-r, r].every(dz => land.has(`${Math.floor(x + dx + 0.5)},${Math.floor(z + dz + 0.5)}`)))) return false;
    return !islandObstacles.some(o => x > o.minX - r && x < o.maxX + r && z > o.minZ - r && z < o.maxZ + r);
  }
  updateZone() {
    const [x, z] = this.position;
    if (this.zone === 'inside' && z > 2.45) this.zone = 'outside';
    if (this.zone === 'outside' && x > roomBounds.minX && x < roomBounds.maxX && z < 1.5 && z > roomBounds.minZ) this.zone = 'inside';
  }
}
