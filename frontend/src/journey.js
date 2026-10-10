// The authored route avoids the tree, pond, glazing and interior furniture.
export const outdoorRoute = [
  [-1.1, 0.12, 2.1], [-0.8, 0.12, 2.55], [0.3, 0.12, 2.65],
  [2.5, 0.22, 2.85], [3.85, 0.315, 2.65],
];
export const indoorRoute = [
  outdoorRoute.at(-1), [3.85, 0.34, 2.05], [3.85, 0.49, 1.4], [4.19, 0.49, -1.04],
];
const length = (a, b) => Math.hypot(...b.map((v, i) => v - a[i]));
export function routeLength(route) {
  return route.slice(1).reduce((sum, point, i) => sum + length(route[i], point), 0);
}
export function sampleRoute(route, distance) {
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], segment = length(a, b);
    if (distance <= segment || i === route.length - 1) {
      const t = Math.max(0, Math.min(1, distance / segment));
      return { position: t === 1 ? [...b] : a.map((v, axis) => v + (b[axis] - v) * t), heading: Math.atan2(b[0] - a[0], b[2] - a[2]) };
    }
    distance -= segment;
  }
}

const durations = { waking: 1.05, standing: 1.35, walking: routeLength(outdoorRoute) / 1.25, entering: 3.1 };
const next = { waking: 'standing', standing: 'walking', walking: 'door', entering: 'inside' };

export class Journey {
  phase = 'resting';
  time = 0;
  constructor(reduced = false) { this.reduced = reduced; }
  get moving() { return Object.hasOwn(durations, this.phase); }
  get progress() { return this.moving ? Math.min(1, this.time / durations[this.phase]) : 1; }
  setPhase(phase) { this.phase = phase; this.time = 0; }
  start() {
    if (this.phase !== 'resting') return false;
    this.setPhase(this.reduced ? 'door' : 'waking');
    return true;
  }
  skip() {
    if (!['resting', 'waking', 'standing', 'walking'].includes(this.phase)) return false;
    this.setPhase('door');
    return true;
  }
  enter() {
    if (this.phase !== 'door') return false;
    this.setPhase(this.reduced ? 'inside' : 'entering');
    return true;
  }
  direct() {
    if (this.phase === 'inside') return false;
    this.setPhase('inside');
    return true;
  }
  setReduced(reduced) {
    this.reduced = reduced;
    if (reduced && this.moving) this.setPhase(this.phase === 'entering' ? 'inside' : 'door');
  }
  advance(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    // Consume overshoot so the route is independent of display refresh rate.
    while (this.moving && seconds > 0) {
      const step = Math.min(seconds, durations[this.phase] - this.time);
      this.time += step; seconds -= step;
      if (this.time >= durations[this.phase] - 1e-9) this.setPhase(next[this.phase]);
    }
  }
  get pose() {
    if (['resting', 'waking', 'standing'].includes(this.phase)) return { position: outdoorRoute[0], heading: 0.28 };
    if (this.phase === 'walking') return sampleRoute(outdoorRoute, this.time * 1.25);
    if (this.phase === 'door') return sampleRoute(indoorRoute, 0);
    // Wait for the door to open before crossing its plane.
    const t = this.phase === 'inside' ? 1 : Math.max(0, (this.time - 0.65) / 2.45);
    return sampleRoute(indoorRoute, t * routeLength(indoorRoute));
  }
}
