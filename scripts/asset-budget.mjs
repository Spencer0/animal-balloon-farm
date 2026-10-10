// Asset budgets: fail `npm run check` when a model costs more than the frame
// can afford. Parses .glb JSON chunks directly (no three.js needed).
//
// Budgets were set from measured values plus headroom. Animals are capped at 25k
// tris: a crowd of 50 at 50-90k each made the CI software-rendered crowd ramp miss
// its frame budget, so the heavy species were decimated (art/blender/decimate_animals.py).
// A new species that blows past the animal cap is a modeling task (decimate, merge,
// drop hidden detail), not a number to bump without a crowd-ramp run proving the frame survives.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

const BUDGETS = [
  { dir: 'public/assets/animals', maxTris: 25_000, maxKb: 2500, label: 'animal' },
  { dir: 'public/assets/buildings', maxTris: 25_000, maxKb: 1100, label: 'building' },
  { dir: 'public/assets/cursors', maxTris: 25_000, maxKb: 700, label: 'cursor' },
  { dir: 'public/assets/props', maxTris: 8000, maxKb: 400, label: 'prop' },
  { dir: 'public/assets/ui', maxTris: 8000, maxKb: 500, label: 'ui prop' },
  // The intro film's cast and sets. Loaded only while the cutscene plays (never
  // during farming), so they are budgeted per scene rather than per crowd.
  { dir: 'public/assets/cutscenes', maxTris: 50_000, maxKb: 1000, label: 'cutscene' },
];
// Raised from 16 MB to 50 MB (Oct 2026) so animals can be built at full detail. The per-animal
// caps above still stand; this total only bounds the whole catalog's download.
const MAX_TOTAL_ANIMAL_KB = 50_000;

/** @param {string} path */
async function glbStats(path) {
  const buffer = await readFile(path);
  if (buffer.toString('ascii', 0, 4) !== 'glTF') throw new Error(`${path} is not a glb`);
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength));
  const accessors = json.accessors ?? [];
  let tris = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      const count = primitive.indices != null
        ? accessors[primitive.indices].count
        : accessors[primitive.attributes.POSITION].count;
      tris += Math.floor(count / 3);
    }
  }
  let embeddedTextureKb = 0;
  for (const image of json.images ?? []) {
    if (image.bufferView != null) embeddedTextureKb += (json.bufferViews[image.bufferView]?.byteLength ?? 0) / 1024;
  }
  return { tris, kb: buffer.length / 1024, embeddedTextureKb, images: (json.images ?? []).length };
}

const failures = [];
const rows = [];
for (const budget of BUDGETS) {
  let files = [];
  try {
    files = (await readdir(budget.dir)).filter((name) => name.endsWith('.glb'));
  } catch (rawError) {
    const error = /** @type {NodeJS.ErrnoException} */ (rawError);
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  for (const file of files) {
    const path = join(budget.dir, file);
    const { tris, kb, embeddedTextureKb, images } = await glbStats(path);
    const ok = tris <= budget.maxTris && kb <= budget.maxKb;
    rows.push({ path, kind: budget.label, tris, kb: Math.round(kb), over: ok ? '' : 'OVER' });
    if (!ok) failures.push(`${path}: ${tris} tris / ${Math.round(kb)}kb exceeds ${budget.label} budget (${budget.maxTris} tris / ${budget.maxKb}kb)`);
    void embeddedTextureKb;
    void images;
  }
}

let animalKb = 0;
try {
  for (const file of (await readdir('public/assets/animals')).filter((name) => name.endsWith('.glb'))) {
    animalKb += (await stat(join('public/assets/animals', file))).size / 1024;
  }
  if (animalKb > MAX_TOTAL_ANIMAL_KB) failures.push(`animals total ${Math.round(animalKb)}kb exceeds ${MAX_TOTAL_ANIMAL_KB}kb`);
} catch (rawError) {
  if (/** @type {NodeJS.ErrnoException} */ (rawError).code !== 'ENOENT') throw rawError;
}

console.log('path | kind | tris | kb');
for (const row of rows) console.log(`${row.path} | ${row.kind} | ${row.tris} | ${row.kb}${row.over ? ' | ' + row.over : ''}`);
console.log(`animals total: ${Math.round(animalKb)}kb / ${MAX_TOTAL_ANIMAL_KB}kb`);
if (failures.length) {
  console.error('\nASSET BUDGET FAILURES:');
  for (const failure of failures) console.error('  ' + failure);
  process.exitCode = 1;
} else {
  console.log('\nASSET BUDGETS PASS');
}
