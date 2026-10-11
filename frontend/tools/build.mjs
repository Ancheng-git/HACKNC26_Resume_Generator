import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyThree } from './vendor.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await copyThree(root);
await rm(resolve(root, 'dist'), { recursive: true, force: true });
await mkdir(resolve(root, 'dist'));
await cp(resolve(root, 'src'), resolve(root, 'dist'), { recursive: true });
console.log('Built MineJob into dist/');
