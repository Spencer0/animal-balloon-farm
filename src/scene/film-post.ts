import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { isWebGPURenderer, webgpuKit, type FarmRenderer, type FilmPost, type FilmPostOptions } from '../render/backend'
import { createGradeShader } from './cutscene-kit'

/**
 * The cutscenes' shared picture chain: depth of field, bloom, tone map, then
 * the storybook film grade. WebGL builds it from three's EffectComposer passes;
 * WebGPU builds the same chain as one node graph (`render/webgpu/kit.ts`).
 */
export function createFilmPost(
  renderer: FarmRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  options: FilmPostOptions,
): FilmPost {
  const nodeKit = webgpuKit()
  if (nodeKit) return nodeKit.createFilmPost(renderer, scene, camera, options)
  if (isWebGPURenderer(renderer)) throw new Error('WebGPU renderer without its node kit')

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType }))
  composer.setPixelRatio(renderer.getPixelRatio())
  composer.addPass(new RenderPass(scene, camera))
  const bokeh = new BokehPass(scene, camera, { focus: 2, aperture: 0.0016, maxblur: 0.007 })
  composer.addPass(bokeh)
  const bokehUniforms = bokeh.uniforms as Record<'focus' | 'aperture' | 'maxblur', THREE.IUniform<number>>
  const bloom = new UnrealBloomPass(new THREE.Vector2(options.width, options.height), options.bloomStrength, options.bloomRadius, options.bloomThreshold)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())
  const grade = new ShaderPass(createGradeShader(options.name))
  composer.addPass(grade)

  return {
    includesOverlay: false,
    render(): void {
      composer.render()
    },
    setSize(cssWidth, cssHeight): void {
      composer.setPixelRatio(renderer.getPixelRatio())
      composer.setSize(cssWidth, cssHeight)
      grade.uniforms['aspect'].value = cssWidth / Math.max(1, cssHeight)
    },
    setFocus(distance, aperture): void {
      bokehUniforms.focus.value = distance
      bokehUniforms.aperture.value = aperture
    },
    setBloomThreshold(threshold): void {
      bloom.threshold = threshold
    },
    setGrade(values): void {
      grade.uniforms['time'].value = values.time
      grade.uniforms['letterbox'].value = values.letterbox
      grade.uniforms['fadeBlack'].value = values.fadeBlack
      grade.uniforms['fadeWhite'].value = values.fadeWhite
    },
    dispose(): void {
      bokeh.dispose()
      bloom.dispose()
      grade.dispose()
      composer.dispose()
    },
  }
}

/** The room-lit environment the cutscenes' PBR materials reflect. */
export function createFilmEnvironment(renderer: FarmRenderer): { texture: THREE.Texture; dispose(): void } {
  const nodeKit = webgpuKit()
  if (nodeKit) return nodeKit.createRoomEnvironment(renderer)
  if (isWebGPURenderer(renderer)) throw new Error('WebGPU renderer without its node kit')
  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const texture = pmrem.fromScene(room, 0.04).texture
  room.dispose()
  return {
    texture,
    dispose(): void {
      texture.dispose()
      pmrem.dispose()
    },
  }
}
