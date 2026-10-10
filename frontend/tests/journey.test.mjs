import assert from 'node:assert/strict';
import { IslandNavigation } from '../src/room-navigation.js';
import { Journey, outdoorRoute, indoorRoute, routeLength, sampleRoute } from '../src/journey.js';

const journey = new Journey();
assert.equal(journey.enter(), false);
assert.equal(journey.start(), true);
assert.equal(journey.start(), false, 'Repeated starts must not reset the timeline');
journey.advance(2.4);
assert.equal(journey.phase, 'walking');
const seen = [];
for (let i = 0; i < 800 && journey.phase !== 'door'; i++) {
  journey.advance(1 / 60);
  const { position } = journey.pose;
  seen.push(position);
  assert.ok(position[0] >= -1.1 && position[0] <= 3.85);
  assert.ok(position[2] >= 2.1 && position[2] <= 2.85, 'Outdoor route stays in front of glazing and away from pond');
}
assert.equal(journey.phase, 'door');
assert.deepEqual(journey.pose.position, outdoorRoute.at(-1));
assert.ok(seen.length > 100, 'Walking must occur over multiple frames');
assert.equal(journey.enter(), true);
assert.equal(journey.enter(), false);
journey.advance(0.5);
assert.deepEqual(journey.pose.position, outdoorRoute.at(-1), 'Character waits for door clearance');
journey.advance(5);
assert.equal(journey.phase, 'inside');
assert.deepEqual(journey.pose.position, indoorRoute.at(-1));
assert.equal(journey.start(), false, 'Returning to scene cannot replay introduction');
assert.equal(journey.direct(), false);

const skip = new Journey(); skip.start(); skip.advance(0.3); skip.skip();
assert.equal(skip.phase, 'door'); skip.advance(100); assert.equal(skip.phase, 'door');
skip.enter(); skip.direct(); skip.advance(100); assert.equal(skip.phase, 'inside');
const reduced = new Journey(true); reduced.start(); assert.equal(reduced.phase, 'door');
reduced.enter(); assert.equal(reduced.phase, 'inside');
const changed = new Journey(); changed.start(); changed.setReduced(true); assert.equal(changed.phase, 'door');
changed.setReduced(false); changed.enter(); changed.setReduced(true); assert.equal(changed.phase, 'inside');
const direct = new Journey(); direct.direct(); assert.equal(direct.phase, 'inside');
assert.deepEqual(sampleRoute(outdoorRoute, routeLength(outdoorRoute) + 100).position, outdoorRoute.at(-1));
assert.deepEqual(sampleRoute(indoorRoute, -1).position, indoorRoute[0]);
console.log('Passed: ordered journey, route bounds, door clearance, duplicate guards, skip/direct entry and reduced motion.');

assert.ok(routeLength(outdoorRoute) / 1.25 >= 3 && routeLength(outdoorRoute) / 1.25 <= 5, 'Shorter route preserves the 1.25 units/s walk speed');
const terrain = new IslandNavigation();
for (let i = 1; i < outdoorRoute.length; i++) assert.ok(terrain.segment([outdoorRoute[i-1][0], outdoorRoute[i-1][2]], [outdoorRoute[i][0], outdoorRoute[i][2]]), 'Intro clears walls, trees and water');
