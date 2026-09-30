// Prints the world-space bounds and node names of a .glb, so the UI prop
// orientation convention can be checked without opening a 3D viewer.
//
//   node scripts/inspect-glb.mjs public/assets/ui/ui-button.glb
//
// Expected convention for the props in public/assets/ui: in Three.js terms the
// exported prop has width along +X, height along +Y and its painted face toward
// +Z. Anything else means the authoring or export step drifted.
import { readFile } from 'node:fs/promises'

/** @typedef {{ min: number[], max: number[] }} Bounds */
/** @typedef {number[]} Matrix4 */

const path = process.argv[2]
if (!path) {
  console.error('usage: node scripts/inspect-glb.mjs <file.glb>')
  process.exit(1)
}

const buffer = await readFile(path)
if (buffer.toString('ascii', 0, 4) !== 'glTF') throw new Error(`${path} is not a glb`)

const jsonLength = buffer.readUInt32LE(12)
const json = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength))

/** @type {any[]} */
const nodes = json.nodes ?? []
/** @type {any[]} */
const meshes = json.meshes ?? []
/** @type {any[]} */
const accessors = json.accessors ?? []

/**
 * @param {number} index
 * @returns {Bounds | null}
 */
function nodeBounds(index) {
  const node = nodes[index]
  const mesh = meshes[node.mesh]
  if (!mesh) return null
  /** @type {number[] | null} */
  let min = null
  /** @type {number[] | null} */
  let max = null
  for (const primitive of mesh.primitives) {
    const accessor = accessors[primitive.attributes.POSITION]
    if (!accessor?.min || !accessor?.max) continue
    min = min ? min.map((value, i) => Math.min(value, accessor.min[i])) : [...accessor.min]
    max = max ? max.map((value, i) => Math.max(value, accessor.max[i])) : [...accessor.max]
  }
  return min && max ? { min, max } : null
}

/** @param {number[]} t */
function translation(t) {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t[0], t[1], t[2], 1]
}

/**
 * @param {Matrix4} a
 * @param {Matrix4} b
 * @returns {Matrix4}
 */
function multiply(a, b) {
  const out = new Array(16).fill(0)
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      let sum = 0
      for (let k = 0; k < 4; k += 1) sum += a[row * 4 + k] * b[k * 4 + col]
      out[row * 4 + col] = sum
    }
  }
  return out
}

/**
 * Composes translation * rotation * scale for the node shapes we author.
 * @param {number} index
 * @param {Matrix4 | null} parent
 * @returns {Matrix4}
 */
function worldMatrix(index, parent) {
  const node = nodes[index]
  const t = node.translation ?? [0, 0, 0]
  const r = node.rotation ?? [0, 0, 0, 1]
  const s = node.scale ?? [1, 1, 1]
  const [x, y, z, w] = r
  const rot = [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0,
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0,
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0,
    0, 0, 0, 1,
  ]
  const scale = [s[0], 0, 0, 0, 0, s[1], 0, 0, 0, 0, s[2], 0, 0, 0, 0, 1]
  const composed = multiply(multiply(translation(t), rot), scale)
  return parent ? multiply(parent, composed) : composed
}

/**
 * @param {Matrix4} matrix
 * @param {number[]} v
 * @returns {number[]}
 */
function apply(matrix, v) {
  return [
    matrix[0] * v[0] + matrix[4] * v[1] + matrix[8] * v[2] + matrix[12],
    matrix[1] * v[0] + matrix[5] * v[1] + matrix[9] * v[2] + matrix[13],
    matrix[2] * v[0] + matrix[6] * v[1] + matrix[10] * v[2] + matrix[14],
  ]
}

const worldMin = [Infinity, Infinity, Infinity]
const worldMax = [-Infinity, -Infinity, -Infinity]

/**
 * @param {number} index
 * @param {Matrix4 | null} parent
 * @param {number} depth
 */
function walk(index, parent, depth) {
  const bounds = nodeBounds(index)
  if (bounds) {
    const matrix = worldMatrix(index, parent)
    // Transform all eight corners: node scale lives on the node, not baked into
    // the accessor bounds, so using only min/max would drop every scaled part.
    for (let corner = 0; corner < 8; corner += 1) {
      const point = apply(matrix, [
        corner & 1 ? bounds.max[0] : bounds.min[0],
        corner & 2 ? bounds.max[1] : bounds.min[1],
        corner & 4 ? bounds.max[2] : bounds.min[2],
      ])
      for (let axis = 0; axis < 3; axis += 1) {
        worldMin[axis] = Math.min(worldMin[axis], point[axis])
        worldMax[axis] = Math.max(worldMax[axis], point[axis])
      }
    }
    const size = bounds.max.map((value, i) => (value - bounds.min[i]).toFixed(3))
    const centre = apply(matrix, bounds.min.map((value, i) => (value + bounds.max[i]) / 2))
    console.log(`${'  '.repeat(depth)}${nodes[index].name}  local ${size.join(' x ')}  centre ${centre.map((v) => v.toFixed(3)).join(', ')}`)
  }
  for (const child of nodes[index].children ?? []) walk(child, worldMatrix(index, parent), depth + 1)
}

for (const [index, node] of nodes.entries()) {
  if ((node.children ?? []).length === 0) continue
  console.log(node.name)
  for (const child of node.children) walk(child, worldMatrix(index, null), 1)
}

const size = worldMax.map((value, i) => +(value - worldMin[i]).toFixed(3))
console.log(`\n${path}`)
console.log(`  world min ${worldMin.map((v) => +v.toFixed(3)).join(', ')}`)
console.log(`  world max ${worldMax.map((v) => +v.toFixed(3)).join(', ')}`)
console.log(`  world size (X width, Y height, Z depth) ${size.join(' x ')}`)
console.log('  expected: width > height for a wide prop, depth much smaller than width.')
