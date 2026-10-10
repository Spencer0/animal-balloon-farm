import * as THREE from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import type { ClipState } from '../game/cutscene-timeline'

/**
 * Staging pieces every cutscene shares: posing glTF actors from clip states,
 * the storybook film grade, and teardown. The films themselves live in
 * `intro-cutscene.ts` and `tool-unlock-cutscene.ts`.
 */

/** What the game loop needs from any film it is playing. */
export interface CutscenePlayer {
  readonly loaded: boolean
  readonly done: boolean
  load(): Promise<void>
  update(delta: number): void
  render(): void
  /** Jump to the last frame; the caller then hands back to the farm. */
  skip(): void
  /** Show the "press again to skip" hint. */
  flashSkipHint(): void
  /** Let the soundtrack start; browsers hold audio until a key or click. */
  resumeAudio(): void
  resize(cssWidth: number, cssHeight: number): void
  dispose(): void
}

export interface Actor {
  readonly root: THREE.Object3D
  readonly mixer: THREE.AnimationMixer
  readonly actions: Map<string, THREE.AnimationAction>
}

export function makeActor(gltf: GLTF): Actor {
  const mixer = new THREE.AnimationMixer(gltf.scene)
  const actions = new Map<string, THREE.AnimationAction>()
  for (const clip of gltf.animations) {
    const action = mixer.clipAction(clip)
    action.setLoop(THREE.LoopRepeat, Infinity)
    action.play()
    action.setEffectiveWeight(0)
    actions.set(clip.name, action)
  }
  return { root: gltf.scene, mixer, actions }
}

/**
 * Pose an actor from clip states. Times are set directly rather than advanced,
 * which is what makes a cutscene seekable.
 */
export function poseActor(actor: Actor, states: readonly ClipState[]): void {
  for (const action of actor.actions.values()) action.setEffectiveWeight(0)
  for (const state of states) {
    const action = actor.actions.get(state.clip)
    if (!action) continue
    const duration = action.getClip().duration
    action.time = state.loop ? state.time % duration : Math.min(state.time, Math.max(0, duration - 1e-4))
    action.setEffectiveWeight(state.weight)
  }
  actor.mixer.update(0)
}

export function prepareShadows(root: THREE.Object3D, cast = true): void {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = cast
      object.receiveShadow = true
    }
  })
}

/** Dispose every mesh's geometry, materials and textures under `root`. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose()
        material.dispose()
      }
    }
  })
}

/** A warm storybook grade with a lens vignette, grain, letterbox bars and fades. */
export function createGradeShader(name: string) {
  return {
    name,
    uniforms: {
      tDiffuse: { value: null as THREE.Texture | null },
      time: { value: 0 },
      aspect: { value: 16 / 9 },
      letterbox: { value: 0 },
      fadeBlack: { value: 1 },
      fadeWhite: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float time;
      uniform float aspect;
      uniform float letterbox;
      uniform float fadeBlack;
      uniform float fadeWhite;
      varying vec2 vUv;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

      void main() {
        vec2 centred = vUv - 0.5;
        vec2 offset = centred * 0.0028;
        vec3 colour = vec3(
          texture2D(tDiffuse, vUv + offset).r,
          texture2D(tDiffuse, vUv).g,
          texture2D(tDiffuse, vUv - offset).b
        );
        // A warm storybook lift in the shadows and a soft lens vignette.
        colour = mix(colour, colour * vec3(1.03, 1.0, 0.95) + vec3(0.012, 0.006, 0.0), 0.8);
        float vignette = smoothstep(1.0, 0.28, length(centred * vec2(aspect * 0.72, 1.0)));
        colour *= mix(0.7, 1.0, vignette);
        colour += (hash(vUv * vec2(1280.0, 720.0) + fract(time * 7.3)) - 0.5) * 0.03;
        colour = mix(colour, vec3(0.0), fadeBlack);
        if (vUv.y < letterbox || vUv.y > 1.0 - letterbox) colour = vec3(0.0);
        colour = mix(colour, vec3(1.0, 0.985, 0.95), fadeWhite);
        gl_FragColor = vec4(colour, 1.0);
      }
    `,
  }
}
