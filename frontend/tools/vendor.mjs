import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Keep the browser runtime local; no CDN or bundler is needed for this scene.
export async function copyThree(root) {
  const target = resolve(root, 'src/vendor');
  await mkdir(target, { recursive: true });
  for (const file of ['three.module.js', 'three.core.js']) {
    await cp(resolve(root, 'node_modules/three/build', file), resolve(target, file));
  }
  await cp(resolve(root, 'node_modules/three/examples/jsm/environments/RoomEnvironment.js'), resolve(target, 'RoomEnvironment.js'));
  await cp(resolve(root, 'node_modules/three/LICENSE'), resolve(target, 'THREE-LICENSE.txt'));
}
