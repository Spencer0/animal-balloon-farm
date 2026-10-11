import * as THREE from 'three'

/**
 * True for a material whose shading is patched at compile time (an
 * `onBeforeCompile` hook under WebGL, a node override under WebGPU, which marks
 * `userData.customShading`). Such a material only ever matches itself.
 */
export function hasCustomShading(material: THREE.Material): boolean {
  return Object.hasOwn(material, 'onBeforeCompile')
    || Object.hasOwn(material, 'customProgramCacheKey')
    || material.userData.customShading !== undefined
}

/**
 * Matte Standard materials (rough, non-metal, no maps that drive the PBR terms)
 * render the same as Lambert but skip the GGX specular term per pixel. Glossy,
 * metallic and map-driven materials stay Standard, so their highlights survive.
 */
export function isMatte(material: THREE.Material): material is THREE.MeshStandardMaterial {
  return material instanceof THREE.MeshStandardMaterial
    && !(material instanceof THREE.MeshPhysicalMaterial)
    && material.roughness >= 0.55
    && material.metalness <= 0.02
    && !material.roughnessMap
    && !material.metalnessMap
    && !material.envMap
    && !hasCustomShading(material)
}

/** Lambert twin of a matte Standard material, keeping the maps and flags that show. */
function lambertTwin(source: THREE.MeshStandardMaterial): THREE.MeshLambertMaterial {
  const lambert = new THREE.MeshLambertMaterial().copy(source as unknown as THREE.MeshLambertMaterial)
  lambert.normalMap = source.normalMap
  lambert.normalScale.copy(source.normalScale)
  lambert.aoMap = source.aoMap
  lambert.aoMapIntensity = source.aoMapIntensity
  lambert.emissiveMap = source.emissiveMap
  lambert.alphaMap = source.alphaMap
  lambert.vertexColors = source.vertexColors
  lambert.flatShading = source.flatShading
  return lambert
}

/**
 * Swap matte Standard materials under `root` for Lambert twins, once per source
 * material so shared materials stay shared (merging groups by material depends on it).
 * Call before merging or cloning; the sources keep their original materials.
 */
export function matteModel(root: THREE.Object3D): void {
  const twins = new Map<THREE.Material, THREE.Material>()
  const twinOf = (material: THREE.Material): THREE.Material => {
    if (!isMatte(material)) return material
    let twin = twins.get(material)
    if (!twin) {
      twin = lambertTwin(material)
      twins.set(material, twin)
    }
    return twin
  }
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.material = Array.isArray(object.material) ? object.material.map(twinOf) : twinOf(object.material)
  })
}

/**
 * Stop recomputing this object's matrix every frame. Only for objects whose
 * transform is final once placed; any later move must call `updateMatrix()`.
 */
export function freezeTransform(object: THREE.Object3D): void {
  object.matrixAutoUpdate = false
  object.updateMatrix()
}
