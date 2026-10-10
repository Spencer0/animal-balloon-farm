import * as THREE from 'three'
import type { GardenBounds } from '../game/farm-expansion'

/**
 * Ground variation: broad tonal patches, dry and lush areas, and a soft
 * dusty fade where the farm meets the meadow.
 *
 * The meadow, outer lawn and gravel apron are single flat colours. They are
 * huge `ShapeGeometry` planes whose UVs are in metres, so a tiled texture
 * averages to one flat colour in the distance. The variation is therefore
 * computed per fragment from *world position* (value noise), which costs no
 * extra geometry, textures or draw calls and never repeats visibly.
 *
 * It only ever multiplies or mixes `diffuseColor`, so it composes with vertex
 * colours (the painted lawn, the soil depth rings) and with lighting/shadows.
 */

export type GroundVariationKind = 'meadow' | 'lawn' | 'soil' | 'gravel'

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

/** Per-kind tuning: x tone, y dry/lush, z dust fade, w pebbles, plus gravel's feathered rim. */
const KIND_PARAMS: Record<GroundVariationKind, { tone: number; patches: number; dust: number; pebbles: number; feather: number }> = {
  meadow: { tone: 0.34, patches: 1.0, dust: 0.62, pebbles: 0, feather: 0 },
  lawn: { tone: 0.14, patches: 0.6, dust: 0, pebbles: 0, feather: 0 },
  soil: { tone: 0.2, patches: 0, dust: 0, pebbles: 0, feather: 0 },
  gravel: { tone: 0.1, patches: 0, dust: 0, pebbles: 1, feather: 1 },
}

const GLSL_HEAD = /* glsl */ `
varying vec3 vGvWorld;
varying vec3 vGvLocal;
uniform vec2 uGvHalf;
uniform float uGvOrganic;
uniform float uGvLocalSpace;
uniform vec4 uGvParams;
uniform float uGvFeather;
uniform float uGvPaint;
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
float gvFbm(vec2 p) {
  return gvNoise(p) * 0.55 + gvNoise(p * 2.03 + 17.1) * 0.3 + gvNoise(p * 4.1 + 3.7) * 0.15;
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
  // Gravel is authored in the starter plot's local space and scaled with the
  // farm; its distance must come from local coordinates to stay a fixed width.
  vec2 fp = uGvLocalSpace > 0.5 ? vec2(vGvLocal.x, -vGvLocal.y) : gp;
  float d = gvFarmDistance(fp);

  float broad = gvFbm(gp * 0.042 + vec2(11.0, 7.0));
  float mid = gvFbm(gp * 0.14 + vec2(3.0, 29.0));
  float fine = gvNoise(gp * 1.7);
  vec3 c = diffuseColor.rgb;

  // Light and dark swaths, a gentle dapple on top.
  c *= 1.0 + ((mid - 0.5) * 1.6 + (broad - 0.5) * 0.9 + (fine - 0.5) * 0.35) * uGvParams.x;

  // Sun-bleached and lush areas shift hue, not just brightness.
  float dryAmount = smoothstep(0.55, 0.74, broad) * uGvParams.y;
  float lushAmount = smoothstep(0.58, 0.8, gvNoise(gp * 0.3 + vec2(40.0, 5.0))) * uGvParams.y;
  c = mix(c, c * uGvDry, dryAmount);
  c = mix(c, c * uGvLush, lushAmount);

  // Worn ground fades out from the farm edge, broken up so it never reads as a ring.
  float rim = gvNoise(gp * 1.9) * 0.6 + gvNoise(gp * 5.3 + 9.0) * 0.4;
  float worn = 1.0 - smoothstep(0.8, 2.6 + rim * 2.6, d);
  c = mix(c, uGvDust * (0.86 + fine * 0.3), worn * uGvParams.z);

  // Gravel grit.
  vec2 cell = floor(gp * 18.0);
  float pebble = step(0.8, gvHash(cell)) * uGvParams.w;
  c *= 1.0 + pebble * (gvHash(cell + 7.1) - 0.55) * 0.5;

  diffuseColor.rgb = c;
  // Painted lawn alpha is stored per vertex and interpolated across triangles,
  // so its contour follows the mesh diagonals. Wobble the contour with noise,
  // weighted by a*(1-a) so unpainted and fully painted ground never move, then
  // ease the ramp so the rim is round rather than faceted.
  if (uGvPaint > 0.5) {
    float a = diffuseColor.a;
    float wob = gvNoise(gp * 2.3) * 0.6 + gvNoise(gp * 6.1 + 5.0) * 0.4 - 0.5;
    a = clamp(a + wob * 1.3 * (a * (1.0 - a) * 4.0), 0.0, 1.0);
    diffuseColor.a = smoothstep(0.06, 0.94, a);
  }
  // Feathered outer rim so the gravel dissolves into the dust, not a cut line.
  diffuseColor.a *= 1.0 - uGvFeather * smoothstep(0.5, 1.14, d + (rim - 0.5) * 0.7);
}
`

/**
 * Patch a standard material in place. Safe to call once per material; the
 * program cache key is per kind so different kinds do not share a program.
 */
export function applyGroundVariation(material: THREE.MeshStandardMaterial, options: GroundVariationOptions): void {
  const params = KIND_PARAMS[options.kind]
  const previous = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer)
    shader.uniforms.uGvHalf = { value: options.bounds.half }
    shader.uniforms.uGvOrganic = options.bounds.organic
    shader.uniforms.uGvLocalSpace = { value: options.localSpace ? 1 : 0 }
    shader.uniforms.uGvParams = { value: new THREE.Vector4(params.tone, params.patches, params.dust, params.pebbles) }
    shader.uniforms.uGvFeather = { value: params.feather }
    shader.uniforms.uGvPaint = { value: options.kind === 'lawn' ? 1 : 0 }
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
      .replace('#include <common>', `#include <common>\n${GLSL_HEAD}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${GLSL_BODY}`)
  }
  material.customProgramCacheKey = () => `ground-variation-${options.kind}-${options.localSpace ? 'local' : 'world'}`
  material.needsUpdate = true
}
