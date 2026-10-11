import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomNavigation, IslandNavigation, interactionPoints, roomBounds, roomObstacles, doorway, outdoorObstacles, islandTiles, islandBounds, coreTiles, pondTiles, waterTiles, bridgeTiles, groundKind, screensCore, gaits, scenery } from '../src/room-navigation.js';
import { Journey, outdoorRoute, indoorRoute, routeLength, introWalkSpeed } from '../src/journey.js';

const walk = (navigation, point) => {
  if (!navigation.plan(point)) return false;
  for (let i = 0; i < 6000 && navigation.route.length; i++) {
    navigation.advance(1 / 60); navigation.updateZone();
    assert.ok(navigation.valid(navigation.position));
  }
  return navigation.route.length === 0 && Math.hypot(...point.map((v, i) => v - navigation.position[i])) < 0.002;
};

test('terrain is deterministic and independent of module state', async () => {
  const again = await import('../src/room-navigation.js?reload');
  assert.deepEqual(again.islandTiles, islandTiles);
  assert.deepEqual(again.pondTiles, pondTiles);
  assert.deepEqual(again.scenery, scenery);
  assert.deepEqual(again.outdoorObstacles, outdoorObstacles);
});

test('connected land is about 11x the original island and keeps the whole core', () => {
  const land = new Set(islandTiles.map(p => p.join(',')));
  assert.equal(coreTiles.length, 171, 'Original island area');
  const ratio = islandTiles.length / coreTiles.length;
  assert.ok(ratio >= 10 && ratio <= 13, `area ratio ${ratio}`);
  for (const tile of coreTiles) assert.ok(land.has(tile.join(',')), `core tile ${tile} kept`);
  // Every land tile is 4-connected to the cabin core.
  const seen = new Set(['0,0']), queue = [[0, 0]];
  while (queue.length) {
    const [x, z] = queue.pop();
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const k = `${x + dx},${z + dz}`;
      if (land.has(k) && !seen.has(k)) { seen.add(k); queue.push([x + dx, z + dz]); }
    }
  }
  assert.equal(seen.size, land.size);
  // Only the lake, river and pond interrupt the land: no other enclosed water.
  const water = new Set(), open = [[Math.floor(islandBounds.minX) - 1, 0]];
  const inBox = (x, z) => x >= islandBounds.minX - 1.5 && x <= islandBounds.maxX + 1.5 && z >= islandBounds.minZ - 1.5 && z <= islandBounds.maxZ + 1.5;
  while (open.length) {
    const [x, z] = open.pop(), k = `${x},${z}`;
    if (!inBox(x, z) || land.has(k) || water.has(k)) continue;
    water.add(k); open.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]);
  }
  const pond = new Set(pondTiles.map(p => p.join(',')));
  for (let x = Math.ceil(islandBounds.minX); x <= islandBounds.maxX; x++) for (let z = Math.ceil(islandBounds.minZ); z <= islandBounds.maxZ; z++) {
    const k = `${x},${z}`;
    if (!land.has(k) && !water.has(k)) assert.ok(pond.has(k), `unexpected enclosed hole at ${k}`);
  }
  assert.ok(waterTiles.length >= 40 && waterTiles.every(([x, z]) => Math.abs(x) > 9 || Math.abs(z) > 6), 'Inland water lies in the new land');
  assert.equal(pondTiles, waterTiles);
  // The river reaches the sea: some water tile borders a tile that is neither land nor inland water.
  const inlandWater = new Set(waterTiles.map(p => p.join(',')));
  assert.ok(waterTiles.some(([x, z]) => [[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dz]) => water.has(`${x + dx},${z + dz}`) && !inlandWater.has(`${x + dx},${z + dz}`))), 'River mouth opens to the sea');
  assert.ok(bridgeTiles.some(([x]) => x < 0) && bridgeTiles.some(([x]) => x > 0) && bridgeTiles.every(([x, z]) => land.has(`${x},${z}`) && groundKind(x, z) === 'bridge'), 'Both rivers have a bridge');
});

test('spawn, intro route, doorway and interaction destinations are unchanged', () => {
  assert.deepEqual(outdoorRoute[0], [-1.1, 0.12, 2.1]);
  assert.deepEqual(outdoorRoute.at(-1), [3.85, 0.315, 2.65]);
  assert.ok(Math.abs(routeLength(outdoorRoute) / introWalkSpeed - 2.75) < 0.01, 'Opening walk takes about 2.75 s');
  assert.deepEqual(indoorRoute.at(-1), [4.19, 0.49, -1.04]);
  assert.deepEqual(doorway, { inside: [3.85, 1.1], outside: [3.85, 3.6], threshold: [3.85, 1.92] });
  assert.deepEqual(interactionPoints, { chest: [0.8, 0.9], table: [3.75, -1.9], board: [3.75, -1.1], furnace: [4.45, 0.55], anvil: [3.8, 0.8] });
  const navigation = new IslandNavigation();
  for (const point of [...Object.values(interactionPoints), doorway.inside, doorway.outside, ...outdoorRoute.map(([x, , z]) => [x, z])]) assert.ok(navigation.valid(point), `${point} stays clear`);
  for (const { x, z } of scenery.trees) assert.ok(Math.abs(x) > 9 || Math.abs(z) > 6, 'New trees stay out of the core, routes and approaches');
  // Nor do they stand between the camera (looking along -13,-18) and the core, which would cover the intro.
  for (const { x, z } of scenery.trees) for (let t = 0; t <= 9; t += 0.5) assert.ok(Math.abs(x - 13 / 22.2 * t) > 9 || Math.abs(z - 18 / 22.2 * t) > 6, `tree ${x},${z} screens the core`);
  for (const { x, z, kind } of scenery.blocks) assert.ok(!screensCore(x, z, kind === 'haystack' ? 2.1 : 1), `block ${x},${z} screens the core`);
  assert.ok(scenery.trees.length >= 8 && scenery.blocks.length >= 15 && scenery.canes.length >= 4 && scenery.lilies.length >= 6);
  for (const { x, z } of [...scenery.blocks, ...scenery.canes, ...scenery.mushrooms]) assert.ok(Math.abs(x) > 8.5 || Math.abs(z) > 5.5, 'New scenery stays out of the core');
  for (const { x, z } of scenery.flowers) assert.ok(Math.abs(x) > 8.5 || Math.abs(z) > 5.5, 'New decoration stays out of the core');
});

test('the expanded land is reachable, with no wall at the former shoreline', () => {
  const navigation = new IslandNavigation(doorway.outside);
  navigation.zone = 'outside';
  const far = islandTiles.filter(([x, z]) => (Math.abs(x) > 9 || Math.abs(z) > 6) && (x * 7 + z * 3) % 11 === 0).filter(p => navigation.valid(p));
  assert.ok(far.length >= 15);
  for (const point of far) assert.ok(walk(navigation, point), `reach ${point}`);
  assert.ok(walk(navigation, doorway.outside));
  // Keyboard movement crosses every side of the old 17x11 boundary.
  for (const [start, dx, dz, check] of [
    [[-7, 0], -4, 0, p => p[0] < -9], [[7.5, 2.5], 4, 0, p => p[0] > 9],
    [[0, -4.5], 0, -4, p => p[1] < -6], [[-4, 4.5], 0, 4, p => p[1] > 6],
  ]) {
    const mover = new IslandNavigation(start);
    assert.ok(mover.valid(start), `${start}`);
    mover.move(dx, dz);
    assert.ok(check(mover.position), `crossed old shore from ${start}: ${mover.position}`);
  }
});

test('new shoreline, pond and tree trunks block movement without tunnelling', () => {
  const r = 0.45;
  const pondEdge = Math.max(...waterTiles.filter(([x, z]) => z === -2 && x < 0).map(([x]) => x)) + 0.5;
  const mover = new IslandNavigation([pondEdge + 1, pondEdge + 1.5, pondEdge + 2, pondEdge + 3].map(x => [x, -2]).find(p => new IslandNavigation().valid(p)));
  mover.move(-6, 0);
  assert.ok(mover.valid(mover.position) && mover.position[0] >= pondEdge + r - 0.051, `stopped at pond: ${mover.position}`);
  for (const { x, z, scale } of scenery.trees) {
    const tree = new IslandNavigation([x + 2, z]);
    assert.ok(tree.valid(tree.position));
    tree.move(-4, 0);
    assert.ok(tree.position[0] >= x + 0.37 * scale + r - 0.051, `stopped at trunk ${x},${z}: ${tree.position}`);
    assert.equal(tree.plan([x, z]), false);
  }
  for (const { x, z, size } of [...scenery.blocks, ...scenery.canes]) {
    assert.equal(new IslandNavigation().valid([x, z]), false, `solid ${x},${z}`);
    const mover = new IslandNavigation([x, z - 2.5]);
    if (!mover.valid(mover.position)) continue;
    mover.move(0, 5);
    assert.ok(mover.position[1] <= z - size / 2 - r + 0.051 || Math.abs(mover.position[0] - x) > size / 2 + r - 0.051, `stopped at block ${x},${z}: ${mover.position}`);
  }
  // The river blocks wading but the bridge carries the walker across it.
  const river = waterTiles.filter(([x, z]) => z === -7 && x < 0);
  const west = Math.min(...river.map(([x]) => x)) - 1.5, east = Math.max(...river.map(([x]) => x)) + 1.5;
  const wader = new IslandNavigation([east, -7]);
  wader.move(west - east, 0);
  assert.ok(wader.position[0] >= Math.max(...river.map(([x]) => x)) + 0.5 + r - 0.051, `stopped at river: ${wader.position}`);
  const crossing = new IslandNavigation([east, -7]);
  const westEdge = Math.min(...waterTiles.filter(([x, z]) => z === -15 && x < 0).map(([x]) => x));
  const far = [1.5, 2, 2.5, 3, 3.5].map(d => [westEdge - d, -15]).find(p => new IslandNavigation().valid(p));
  assert.ok(new IslandNavigation().valid(far) && crossing.plan(far), `plan to ${far}`);
  let onBridge = false;
  for (let i = 0; i < 6000 && crossing.route.length; i++) {
    crossing.advance(1 / 60);
    onBridge ||= groundKind(Math.round(crossing.position[0]), Math.round(crossing.position[1])) === 'bridge';
  }
  assert.ok(crossing.route.length === 0 && onBridge, 'The shortest way over the river uses the bridge');
  for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1],[0.7,0.7],[-0.7,0.7],[0.7,-0.7],[-0.7,-0.7]]) {
    const shore = new IslandNavigation([-4, 1]);
    shore.move(dx * 40, dz * 40);
    assert.ok(shore.valid(shore.position), `shore stop ${dx},${dz}`);
    const [x, z] = shore.position;
    assert.ok(x > islandBounds.minX && x < islandBounds.maxX && z > islandBounds.minZ && z < islandBounds.maxZ);
  }
});

test('doorway round trips keep every functional destination reachable', () => {
  const navigation = new IslandNavigation();
  for (const outdoor of [[-12, 5], [12, -3]]) {
    assert.ok(walk(navigation, doorway.outside)); assert.equal(navigation.zone, 'outside');
    assert.ok(walk(navigation, outdoor), `${outdoor}`);
    assert.ok(walk(navigation, doorway.inside)); assert.equal(navigation.zone, 'inside');
    for (const point of Object.values(interactionPoints)) assert.ok(walk(navigation, point), `${point}`);
  }
});

test('every object can be reached from entry and from every other object without intersecting furniture', () => {
  for (const start of [[4.19, -1.04], ...Object.values(interactionPoints)]) {
    for (const [key, target] of Object.entries(interactionPoints)) {
      const navigation = new RoomNavigation(start);
      assert.ok(navigation.plan(target, key), `${start} -> ${key}`);
      let arrived;
      for (let i = 0; i < 1500 && navigation.route.length; i++) {
        arrived = navigation.advance(1 / 60) || arrived;
        assert.ok(navigation.valid(navigation.position));
      }
      assert.equal(arrived, key);
      assert.ok(Math.hypot(...target.map((v, i) => v - navigation.position[i])) < 0.002);
    }
  }
});

test('leave, explore and return through the doorway without restarting the introduction', () => {
  const journey = new Journey(); journey.direct();
  const navigation = new IslandNavigation();
  const travel = point => {
    assert.ok(navigation.plan(point));
    for (let i = 0; i < 3000 && navigation.route.length; i++) {
      navigation.advance(1 / 60); navigation.updateZone();
      assert.ok(navigation.valid(navigation.position));
    }
    assert.equal(navigation.route.length, 0);
    assert.ok(Math.hypot(...point.map((v, i) => v - navigation.position[i])) < 0.002);
    assert.equal(journey.phase, 'inside');
    assert.equal(journey.start(), false);
  };
  travel(doorway.outside);
  assert.equal(navigation.zone, 'outside');
  for (const point of [[-4,1], [-4,-2], [-4,-4.8], [2,-4.8], [-6,0]]) travel(point);
  travel(doorway.inside);
  assert.equal(navigation.zone, 'inside');
  for (const point of Object.values(interactionPoints)) travel(point);
});

test('island shoreline, pond, tree trunks and solid house walls block movement', () => {
  const navigation = new IslandNavigation(doorway.outside);
  for (const obstacle of outdoorObstacles) assert.equal(navigation.valid([(obstacle.minX + obstacle.maxX) / 2, (obstacle.minZ + obstacle.maxZ) / 2]), false);
  const tipX = [-3, -2, -1, 0, 1, 2].find(x => navigation.valid([x, Math.max(...islandTiles.filter(([tx]) => tx === x).map(([, z]) => z)) - 0.6]));
  const tip = Math.max(...islandTiles.filter(([x]) => x === tipX).map(([, z]) => z));
  assert.ok(tipX !== undefined, 'Inland of the south tip is walkable');
  assert.equal(navigation.valid([tipX, tip + 0.3]), false, 'The whole footprint, not only its centre, must stay over land at the irregular shore');
  assert.equal(navigation.valid([-0.21,-1]), false);
  assert.equal(navigation.valid([1,1.92]), false);
  assert.equal(navigation.valid([3.85,1.92]), true, 'Only the real doorway crosses the front wall');
  navigation.move(100,100);
  assert.ok(navigation.valid(navigation.position));
  assert.equal(navigation.plan([-2,3.85]), false, 'No click-to-walk into water');
  assert.equal(navigation.plan([islandBounds.maxX + 1, 0]), false, 'No click-to-walk off the island');
  assert.equal(navigation.plan([islandBounds.minX - 0.2, -2]), false, 'No click-to-walk into the sea beside the new pond');
  assert.equal(navigation.plan([-14, -2.5]), false, 'No click-to-walk into the lake');
  assert.equal(navigation.plan([15, 3.5]), false, 'No click-to-walk into the eastern lake');
});
test('long moves do not tunnel through furniture or leave the room; cancellation clears destination', () => {
  const navigation = new RoomNavigation();
  navigation.move(-20, 0);
  assert.ok(navigation.valid(navigation.position));
  assert.ok(navigation.position[0] >= roomObstacles[0].maxX + navigation.radius - 0.051);
  navigation.move(30, 30);
  assert.ok(navigation.valid(navigation.position));
  assert.ok(navigation.position[0] <= roomBounds.maxX - navigation.radius);
  assert.equal(navigation.plan([-20, 30], 'chest'), false);
  assert.ok(navigation.plan(interactionPoints.table, 'table'));
  navigation.cancel();
  assert.equal(navigation.destination, null);
  assert.equal(navigation.route.length, 0);
});

test('running and crouching only change speed, never collision or the base walk', () => {
  assert.equal(gaits.walk, 1.65, 'Walk speed unchanged');
  assert.ok(gaits.run > gaits.walk && gaits.crouch < gaits.walk);
  const times = Object.fromEntries(Object.entries(gaits).map(([gait, speed]) => {
    const navigation = new IslandNavigation(doorway.outside);
    assert.ok(navigation.plan([-4, 1]));
    let frames = 0;
    for (; frames < 6000 && navigation.route.length; frames++) { navigation.advance(1 / 60, speed); assert.ok(navigation.valid(navigation.position)); }
    assert.ok(Math.hypot(navigation.position[0] + 4, navigation.position[1] - 1) < 0.002, `${navigation.position}`);
    return [gait, frames];
  }));
  assert.ok(times.run < times.walk && times.walk < times.crouch, JSON.stringify(times));
});
