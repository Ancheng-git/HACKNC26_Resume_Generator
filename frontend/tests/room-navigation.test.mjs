import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomNavigation, IslandNavigation, interactionPoints, roomBounds, roomObstacles, doorway, outdoorObstacles } from '../src/room-navigation.js';
import { Journey } from '../src/journey.js';

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
  assert.equal(navigation.valid([8,5]), false, 'The notched shoreline is not a rectangular bounding box');
  assert.equal(navigation.valid([-0.21,-1]), false);
  assert.equal(navigation.valid([1,1.92]), false);
  assert.equal(navigation.valid([3.85,1.92]), true, 'Only the real doorway crosses the front wall');
  navigation.move(100,100);
  assert.ok(navigation.valid(navigation.position));
  assert.equal(navigation.plan([-2,3.85]), false, 'No click-to-walk into water');
  assert.equal(navigation.plan([9,0]), false, 'No click-to-walk off the island');
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
