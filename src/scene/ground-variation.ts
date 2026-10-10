import * as THREE from 'three'
import type { GardenBounds } from '../game/farm-expansion'

/**
 * Ground variation: broad tonal patches, dry and lush areas, and a soft
 * dusty fade where the farm meets the meadow.
 *
 * The meadow, outer lawn and gravel apron are single flat colours. They are
 * huge `ShapeGeometry` planes whose UVs are in metres, so a tiled texture
 * averages to one flat colour in the distance. Variation is therefore looked
 * up by *world position* instead.
 *
 * Cost matters because the ground covers most of the screen and CI renders in
 * software. The slow-moving patches are baked once into a small texture (one
 * fetch per pixel); the only per-pixel noise left is gated to the few places
 * that need it (near the farm edge, on partly painted grass, on gravel).
 *
 * It only ever multiplies or mixes `diffuseColor`, so it composes with vertex
 * colours (the painted lawn, the soil depth rings) and with lighting/shadows.
 */

export type GroundVariationKind = 'meadow' | 'lawn' | 'soil' | 'gravel'

/** World metres the baked field covers; matches the 520 m ground planes. */
export const GROUND_FIELD_EXTENT = 520
const GROUND_FIELD_SIZE = 512

export interface GroundVariationOptions {
  kind: GroundVariationKind
  /**
   * Farm edge the dust fade is measured from. Pass the live bounds vector from
   * {@link createGroundVariationBounds} for world-space ground, or a fixed
   * vector for geometry authored in the starter plot's local space.
   */
  bounds: GroundVariationBounds
  /** Distance is measured in the mesh's local space (the scaled gravel apron). */
  localSpace?: boolean
}

export interface GroundVariationBounds {
  readonly half: THREE.Vector2
  readonly organic: { value: number }
  set(bounds: GardenBounds): void
}

export function createGroundVariationBounds(initial: GardenBounds): GroundVariationBounds {
  const half = new THREE.Vector2()
  const organic = { value: 0 }
  const handle: GroundVariationBounds = {
    half,
    organic,
    set(bounds) {
      half.set(bounds.halfWidth, bounds.halfDepth)
      organic.value = bounds.footprint === 'organic' ? 1 : 0
    },
  }
  handle.set(initial)
  return handle
}

// ------------------------------------------------------------ baked field --

function fract(value: number): number {
  return value - Math.floor(value)
}

function hash(x: number, y: number): number {
  let px = fract(x * 123.34)
  let py = fract(y * 456.21)
  const shift = px * (px + 45.32) + py * (py + 45.32)
  px += shift
  py += shift
  return fract(px * py)
}

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  let fx = x - ix
  let fy = y - iy
  fx = fx * fx * (3 - 2 * fx)
  fy = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy)
  const b = hash(ix + 1, iy)
  const c = hash(ix, iy + 1)
  const d = hash(ix + 1, iy + 1)
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy
}

function fbm(x: number, y: number): number {
  return valueNoise(x, y) * 0.55 + valueNoise(x * 2.03 + 17.1, y * 2.03 + 17.1) * 0.3 + valueNoise(x * 4.1 + 3.7, y * 4.1 + 3.7) * 0.15
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * One texel of the field at a world position: tone, dry and lush amounts, each
 * 0..1. Tone is stored centred (0.5 = unchanged) so the shader can scale it.
 */
export function sampleGroundField(x: number, z: number): { tone: number; dry: number; lush: number } {
  const broad = fbm(x * 0.042 + 11, z * 0.042 + 7)
  const mid = fbm(x * 0.14 + 3, z * 0.14 + 29)
  const tone = (mid - 0.5) * 1.6 + (broad - 0.5) * 0.9
  return {
    tone: Math.min(1, Math.max(0, tone * 0.5 + 0.5)),
    dry: smoothstep(0.55, 0.74, broad),
    lush: smoothstep(0.58, 0.8, valueNoise(x * 0.3 + 40, z * 0.3 + 5)),
  }
}

let groundField: THREE.DataTexture | null = null

/** The shared baked field. Immutable, so every ground material reuses one texture. */
export function getGroundVariationField(): THREE.DataTexture {
  if (groundField) return groundField
  const data = new Uint8Array(GROUND_FIELD_SIZE * GROUND_FIELD_SIZE * 4)
  const texel = GROUND_FIELD_EXTENT / GROUND_FIELD_SIZE
  for (let row = 0; row < GROUND_FIELD_SIZE; row += 1) {
    const z = (row + 0.5) * texel - GROUND_FIELD_EXTENT / 2
    for (let column = 0; column < GROUND_FIELD_SIZE; column += 1) {
      const x = (column + 0.5) * texel - GROUND_FIELD_EXTENT / 2
      const sample = sampleGroundField(x, z)
      const offset = (row * GROUND_FIELD_SIZE + column) * 4
      data[offset] = Math.round(sample.tone * 255)
      data[offset + 1] = Math.round(sample.dry * 255)
      data[offset + 2] = Math.round(sample.lush * 255)
      data[offset + 3] = 255
    }
  }
  const texture = new THREE.DataTexture(data, GROUND_FIELD_SIZE, GROUND_FIELD_SIZE, THREE.RGBAFormat)
  texture.name = 'Ground variation field'
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.generateMipmaps = false
  texture.needsUpdate = true
  groundField = texture
  return texture
}

// ----------------------------------------------------------------- shader --

/** Per-kind tuning and which effects compile in. */
const KINDS: Record<GroundVariationKind, {
  tone: number; patches: number; dust: number
  field: boolean; distance: boolean; pebbles: boolean; feather: boolean; paint: boolean
}> = {
  meadow: { tone: 0.34, patches: 1.0, dust: 0.62, field: true, distance: true, pebbles: false, feather: false, paint: false },
  lawn: { tone: 0.14, patches: 0.6, dust: 0, field: true, distance: false, pebbles: false, feather: false, paint: true },
  soil: { tone: 0.2, patches: 0, dust: 0, field: true, distance: false, pebbles: false, feather: false, paint: false },
  gravel: { tone: 0, patches: 0, dust: 0, field: false, distance: true, pebbles: true, feather: true, paint: false },
}

const GLSL_HEAD = /* glsl */ `
varying vec3 vGvWorld;
varying vec3 vGvLocal;
uniform sampler2D uGvField;
uniform float uGvExtent;
uniform vec2 uGvHalf;
uniform float uGvOrganic;
uniform float uGvLocalSpace;
uniform vec4 uGvParams;
uniform vec3 uGvDry;
uniform vec3 uGvLush;
uniform vec3 uGvDust;

float gvHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float gvNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gvHash(i), gvHash(i + vec2(1.0, 0.0)), f.x),
             mix(gvHash(i + vec2(0.0, 1.0)), gvHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Port of farmEdgeDistance (src/game/farm-footprint.ts): negative is farmland.
float gvFarmDistance(vec2 p) {
  vec2 n = p / uGvHalf;
  float a = atan(n.y, n.x);
  float f = uGvOrganic > 0.5
    ? 0.93 + 0.035 * sin(a * 3.0 + 0.4) + 0.025 * sin(a * 5.0 - 0.8) + 0.01 * cos(a * 7.0)
    : 1.0;
  float r = length(vec2(cos(a) * uGvHalf.x, sin(a) * uGvHalf.y));
  return (length(n) - f) * r;
}
`

const GLSL_BODY = /* glsl */ `
{
  vec2 gp = vGvWorld.xz;
  vec3 c = diffuseColor.rgb;

#ifdef GV_FIELD
  // Baked light/dark swaths and dry/lush areas: one fetch, no per-pixel noise.
  vec3 field = texture2D(uGvField, gp / uGvExtent + 0.5).rgb;
  c *= 1.0 + (field.r - 0.5) * 2.0 * uGvParams.x;
  c = mix(c, c * uGvDry, field.g * uGvParams.y);
  c = mix(c, c * uGvLush, field.b * uGvParams.y);
#endif

#ifdef GV_DISTANCE
  // Gravel is authored in the starter plot's local space and scaled with the
  // farm; its distance must come from local coordinates to stay a fixed width.
  vec2 fp = uGvLocalSpace > 0.5 ? vec2(vGvLocal.x, -vGvLocal.y) : gp;
  float d = 100.0;
  float rim = 0.5;
  // Cheap lower bound first: the edge factor is at most 1 and the radius at
  // least min(half), so most of the meadow skips the trig and noise below.
  float lowerBound = (length(fp / uGvHalf) - 1.0) * min(uGvHalf.x, uGvHalf.y);
  if (lowerBound < 5.4) {
    d = gvFarmDistance(fp);
    rim = gvNoise(gp * 1.9) * 0.6 + gvNoise(gp * 5.3 + 9.0) * 0.4;
    // Worn ground fades out from the farm edge, broken up so it never reads as a ring.
    float worn = 1.0 - smoothstep(0.8, 2.6 + rim * 2.6, d);
    float grit = 0.86 + gvNoise(gp * 1.7) * 0.3;
    c = mix(c, uGvDust * grit, worn * uGvParams.z);
  }
#endif

#ifdef GV_PEBBLES
  vec2 cell = floor(gp * 18.0);
  float pebble = step(0.8, gvHash(cell));
  c *= 1.0 + pebble * (gvHash(cell + 7.1) - 0.55) * 0.5;
#endif

  diffuseColor.rgb = c;

#ifdef GV_PAINT
  // Painted lawn alpha is stored per vertex and interpolated across triangles,
  // so its contour follows the mesh diagonals. Wobble the contour with noise,
  // weighted by a*(1-a) so unpainted and fully painted ground never move, then
  // ease the ramp so the rim is round rather than faceted. Only partly painted
  // pixels (the rim) pay for the noise.
  float a = diffuseColor.a;
  if (a > 0.002 && a < 0.998) {
    float wob = gvNoise(gp * 2.3) * 0.6 + gvNoise(gp * 6.1 + 5.0) * 0.4 - 0.5;
    a = clamp(a + wob * 1.3 * (a * (1.0 - a) * 4.0), 0.0, 1.0);
    diffuseColor.a = smoothstep(0.06, 0.94, a);
  }
#endif

#ifdef GV_FEATHER
  // Feathered outer rim so the gravel dissolves into the dust, not a cut line.
  diffuseColor.a *= 1.0 - smoothstep(0.5, 1.14, d + (rim - 0.5) * 0.7);
#endif
}
`

/**
 * Patch a standard material in place. Safe to call once per material; the
 * program cache key is per kind so different kinds do not share a program.
 */
export function applyGroundVariation(material: THREE.MeshStandardMaterial, options: GroundVariationOptions): void {
  const kind = KINDS[options.kind]
  const defines = [
    kind.field ? '#define GV_FIELD' : '',
    kind.distance ? '#define GV_DISTANCE' : '',
    kind.pebbles ? '#define GV_PEBBLES' : '',
    kind.feather ? '#define GV_FEATHER' : '',
    kind.paint ? '#define GV_PAINT' : '',
  ].filter(Boolean).join('\n')
  const previous = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer)
    shader.uniforms.uGvField = { value: kind.field ? getGroundVariationField() : null }
    shader.uniforms.uGvExtent = { value: GROUND_FIELD_EXTENT }
    shader.uniforms.uGvHalf = { value: options.bounds.half }
    shader.uniforms.uGvOrganic = options.bounds.organic
    shader.uniforms.uGvLocalSpace = { value: options.localSpace ? 1 : 0 }
    shader.uniforms.uGvParams = { value: new THREE.Vector4(kind.tone, kind.patches, kind.dust, 0) }
    shader.uniforms.uGvDry = { value: new THREE.Vector3(1.14, 1.03, 0.7) }
    shader.uniforms.uGvLush = { value: new THREE.Vector3(0.88, 1.08, 0.88) }
    shader.uniforms.uGvDust = { value: new THREE.Color('#cdb883') }

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGvWorld;\nvarying vec3 vGvLocal;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvGvLocal = transformed;\nvGvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${defines}\n${GLSL_HEAD}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${GLSL_BODY}`)
  }
  material.customProgramCacheKey = () => `ground-variation-${options.kind}-${options.localSpace ? 'local' : 'world'}`
  material.needsUpdate = true
}
