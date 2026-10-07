import * as THREE from 'three';
import { SELL_BURST_DURATION, sellBurstFrame } from '../game/sell-animation';

export interface SellBurst {
  readonly root: THREE.Object3D;
  /** Advance the placeholder; returns false once it has finished. */
  update(deltaSeconds: number): boolean;
  dispose(): void;
}

const SPARK_COUNT = 12;

/**
 * Placeholder farewell: a gold ring that expands and fades on the ground, a
 * "+N coins" tag that rises, and a fizz of sparks. World-space (added to the
 * farm scene, not the UI layer) so it pops exactly where the animal stood.
 */
export function createSellBurst(position: THREE.Vector3, price: number): SellBurst {
  const root = new THREE.Group();
  root.name = 'Sell farewell burst';
  root.position.copy(position);

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#e8b64c'),
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), ringMaterial);
  ring.name = 'Sell burst ring';
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.2;
  root.add(ring);

  const label = document.createElement('canvas');
  label.width = 280;
  label.height = 96;
  const labelContext = label.getContext('2d');
  if (!labelContext) throw new Error('2D canvas context unavailable for the sell burst');
  labelContext.font = 'bold 44px Georgia, "Times New Roman", serif';
  labelContext.textAlign = 'center';
  labelContext.textBaseline = 'middle';
  labelContext.lineWidth = 7;
  labelContext.strokeStyle = '#fff4d5';
  labelContext.strokeText(`+${price}`, 140, 38);
  labelContext.fillStyle = '#7c4a1e';
  labelContext.fillText(`+${price}`, 140, 38);
  labelContext.font = 'italic 24px Georgia, serif';
  labelContext.fillText('coins', 140, 74);
  const labelTexture = new THREE.CanvasTexture(label);
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  const tagMaterial = new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthWrite: false });
  const tag = new THREE.Sprite(tagMaterial);
  tag.name = 'Sell burst tag';
  tag.scale.set(5, 1.7, 1);
  tag.position.y = 2.4;
  root.add(tag);

  const sparkDirections: THREE.Vector3[] = [];
  for (let index = 0; index < SPARK_COUNT; index += 1) {
    const angle = (index / SPARK_COUNT) * Math.PI * 2 + Math.random() * 0.5;
    const direction = new THREE.Vector3(
      Math.cos(angle),
      0.55 + Math.random() * 0.5,
      Math.sin(angle),
    ).normalize();
    sparkDirections.push(direction);
  }
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_COUNT * 3), 3));
  const sparkMaterial = new THREE.PointsMaterial({
    color: new THREE.Color('#f6d47c'),
    size: 0.4,
    transparent: true,
    depthWrite: false,
  });
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
  sparks.name = 'Sell burst sparks';
  sparks.position.y = 1;
  sparks.frustumCulled = false;
  root.add(sparks);

  let elapsed = 0;
  return {
    root,
    update(deltaSeconds: number): boolean {
      elapsed += Math.max(0, deltaSeconds);
      const frame = sellBurstFrame(elapsed);
      ring.scale.setScalar(Math.max(0.001, frame.ringScale));
      ringMaterial.opacity = frame.ringAlpha;
      tag.position.y = 2.4 + frame.textRise;
      tagMaterial.opacity = frame.textAlpha;
      const positions = sparkGeometry.getAttribute('position') as THREE.BufferAttribute;
      for (let index = 0; index < SPARK_COUNT; index += 1) {
        const direction = sparkDirections[index];
        positions.setXYZ(
          index,
          direction.x * frame.sparkSpread,
          direction.y * frame.sparkSpread,
          direction.z * frame.sparkSpread,
        );
      }
      positions.needsUpdate = true;
      sparkMaterial.opacity = frame.sparkAlpha;
      return elapsed < SELL_BURST_DURATION;
    },
    dispose(): void {
      ring.geometry.dispose();
      ringMaterial.dispose();
      labelTexture.dispose();
      tagMaterial.dispose();
      sparkGeometry.dispose();
      sparkMaterial.dispose();
    },
  };
}
