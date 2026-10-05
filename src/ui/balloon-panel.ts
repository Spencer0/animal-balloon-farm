import * as THREE from "three";
import { createUIViewport, type DesignPoint } from "./ui-viewport";
import type { UIPanel } from "./ui-layer";
import type { UiCursorKind } from "./ui-cursor";

export type BalloonQuadrant = "journal" | "shed" | "player" | "post";

export interface BalloonPanel extends UIPanel {
  setVisible(visible: boolean): void;
  setInteractEnabled(enabled: boolean): void;
  contains(point: DesignPoint): boolean;
  refresh(): void;
}

const RADIUS = 108;
const RIM = 10;
const ICON_SIZE = 62;
const EDGE_X = 150;
const EDGE_Y = 195;

const QUADRANT_COLORS: Record<BalloonQuadrant, string> = {
  journal: "#f0be4a",
  shed: "#5aa3a0",
  player: "#d95f43",
  post: "#b3a1cc",
};

const QUADRANT_ICONS: Record<BalloonQuadrant, string> = {
  journal: "assets/ui/nav-journal.png",
  shed: "assets/ui/nav-shed.png",
  player: "assets/ui/nav-player.png",
  post: "assets/ui/nav-post.png",
};

const QUADRANTS: readonly BalloonQuadrant[] = ["journal", "shed", "player", "post"];

function quadrantAt(centerX: number, centerY: number, point: DesignPoint): BalloonQuadrant | null {
  const dx = point.x - centerX;
  const dy = point.y - centerY;
  if (Math.hypot(dx, dy) > RADIUS + RIM) return null;
  let angle = Math.atan2(dy, dx);
  if (angle < 0) angle += Math.PI * 2;
  if (angle < Math.PI / 2) return "shed";
  if (angle < Math.PI) return "journal";
  if (angle < Math.PI * 1.5) return "player";
  return "post";
}

export function createBalloonPanel(
  cssWidth: number,
  cssHeight: number,
  onSelect?: (quadrant: BalloonQuadrant) => void,
): BalloonPanel {
  const viewport = createUIViewport();
  viewport.resize(cssWidth, cssHeight);

  const object = new THREE.Group();
  object.name = "Balloon nav";

  const rim = new THREE.Mesh(
    new THREE.CircleGeometry(RADIUS + RIM, 48),
    new THREE.MeshBasicMaterial({ color: "#4a3a2e", transparent: true, depthWrite: false, depthTest: false }),
  );
  rim.name = "Balloon rim";
  object.add(rim);

  const glow = new THREE.Mesh(
    new THREE.RingGeometry(RADIUS + 3, RADIUS + 18, 48),
    new THREE.MeshBasicMaterial({
      color: "#fff4d5", transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    }),
  );
  glow.name = "Balloon hover glow";
  object.add(glow);

  const sectors = new Map<BalloonQuadrant, THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>>();
  const baseColors = new Map<BalloonQuadrant, THREE.Color>();
  const starts: Record<BalloonQuadrant, number> = {
    shed: 0, journal: Math.PI / 2, player: Math.PI, post: Math.PI * 1.5,
  };
  let depth = 1;
  for (const quadrant of QUADRANTS) {
    const base = new THREE.Color(QUADRANT_COLORS[quadrant]);
    baseColors.set(quadrant, base);
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(RADIUS, 32, starts[quadrant], Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: base.clone(), transparent: true, depthWrite: false, depthTest: false }),
    );
    mesh.name = `Balloon quadrant ${quadrant}`;
    mesh.position.z = depth;
    depth += 1;
    sectors.set(quadrant, mesh);
    object.add(mesh);
  }

  const dividerMaterial = new THREE.MeshBasicMaterial({ color: "#fff4d5", transparent: true, depthWrite: false, depthTest: false });
  const dividerV = new THREE.Mesh(new THREE.PlaneGeometry(7, RADIUS * 2), dividerMaterial);
  dividerV.name = "Balloon divider";
  dividerV.position.z = 5;
  const dividerH = new THREE.Mesh(new THREE.PlaneGeometry(RADIUS * 2, 7), dividerMaterial);
  dividerH.name = "Balloon divider";
  dividerH.position.z = 5;
  object.add(dividerV, dividerH);

  const textureLoader = new THREE.TextureLoader();
  const icons = new Map<BalloonQuadrant, THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>();
  const iconTextures: THREE.Texture[] = [];
  let loadedIcons = 0;
  const iconAngles: Record<BalloonQuadrant, number> = {
    shed: Math.PI / 4, journal: Math.PI * 0.75, player: Math.PI * 1.25, post: Math.PI * 1.75,
  };
  for (const quadrant of QUADRANTS) {
    const texture = textureLoader.load(
      QUADRANT_ICONS[quadrant],
      () => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        loadedIcons += 1;
      },
      undefined,
      () => {
        console.warn(`[balloon] nav icon failed to load: ${QUADRANT_ICONS[quadrant]}`);
      },
    );
    iconTextures.push(texture);
    const icon = new THREE.Mesh(
      new THREE.PlaneGeometry(ICON_SIZE, ICON_SIZE),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false }),
    );
    icon.name = `Balloon icon ${quadrant}`;
    icon.position.z = 6;
    icons.set(quadrant, icon);
    object.add(icon);
  }

  const knot = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 20),
    new THREE.MeshBasicMaterial({ color: "#4a3a2e", transparent: true, depthWrite: false, depthTest: false }),
  );
  knot.name = "Balloon knot";
  knot.position.z = 1;
  object.add(knot);

  const stringCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, -RADIUS - 26, 0),
    new THREE.Vector3(14, -RADIUS - 62, 0),
    new THREE.Vector3(34, -RADIUS - 100, 0),
  );
  const stringLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(stringCurve.getPoints(20)),
    new THREE.LineBasicMaterial({ color: "#fff4d5", transparent: true, opacity: 0.85 }),
  );
  stringLine.name = "Balloon string";
  object.add(stringLine);

  let visible = true;
  let interactEnabled = true;
  let hovered: BalloonQuadrant | null = null;
  let centerX = 0;
  let centerY = 0;
  let bobPhase = Math.random() * Math.PI * 2;

  function layout(): void {
    centerX = viewport.right - EDGE_X;
    centerY = viewport.bottom + EDGE_Y;
    object.position.x = centerX;
    object.position.y = centerY;
    for (const quadrant of QUADRANTS) {
      const angle = iconAngles[quadrant];
      const icon = icons.get(quadrant);
      if (!icon) continue;
      icon.position.x = Math.cos(angle) * RADIUS * 0.55;
      icon.position.y = Math.sin(angle) * RADIUS * 0.55;
    }
    knot.position.x = 0;
    knot.position.y = -RADIUS - 12;
    object.visible = visible;
  }

  layout();

  const panel: BalloonPanel = {
    name: "balloon",
    object,
    order: 8,
    setVisible(next: boolean): void {
      if (visible === next) return;
      visible = next;
      layout();
    },
    setInteractEnabled(enabled: boolean): void {
      interactEnabled = enabled;
      if (!enabled) hovered = null;
    },
    contains(point: DesignPoint): boolean {
      if (!visible) return false;
      return quadrantAt(centerX, centerY, point) !== null;
    },
    refresh(): void {
      layout();
    },
    pointerDown(point, event): boolean {
      if (!visible || !interactEnabled) return false;
      const quadrant = quadrantAt(centerX, centerY, point);
      if (!quadrant) return false;
      event.preventDefault();
      onSelect?.(quadrant);
      return true;
    },
    pointerMove(point): boolean {
      const next = visible && interactEnabled ? quadrantAt(centerX, centerY, point) : null;
      hovered = next;
      return next !== null;
    },
    pointerUp(): boolean {
      return false;
    },
    cursor(point): UiCursorKind | undefined {
      if (!visible || !interactEnabled) return undefined;
      return quadrantAt(centerX, centerY, point) ? "point" : undefined;
    },
    hitTest(point): boolean {
      if (!visible) return false;
      return quadrantAt(centerX, centerY, point) !== null;
    },
    update(delta: number): void {
      bobPhase += delta;
      const bob = Math.sin(bobPhase * 2.2) * 0.015 + 1;
      object.scale.setScalar(bob);
      const glowTarget = hovered ? 0.5 + Math.sin(bobPhase * 6) * 0.12 : 0;
      const glowMaterial = glow.material as THREE.MeshBasicMaterial;
      glowMaterial.opacity += (glowTarget - glowMaterial.opacity) * Math.min(1, delta * 10);
      for (const quadrant of QUADRANTS) {
        const sector = sectors.get(quadrant);
        const icon = icons.get(quadrant);
        const base = baseColors.get(quadrant);
        if (!sector || !icon || !base) continue;
        const active = hovered === quadrant;
        const sectorMaterial = sector.material as THREE.MeshBasicMaterial;
        sectorMaterial.color.copy(base).lerp(new THREE.Color("#ffffff"), active ? 0.38 : 0);
        const iconTarget = active ? 1.16 : 1;
        icon.scale.setScalar(icon.scale.x + (iconTarget - icon.scale.x) * Math.min(1, delta * 10));
      }
    },
    resize(width, height): void {
      viewport.resize(width, height);
      layout();
    },
    describe() {
      return { center: { x: centerX, y: centerY }, radius: RADIUS, hovered, visible, ready: loadedIcons >= QUADRANTS.length };
    },
    dispose(): void {
      rim.geometry.dispose();
      (rim.material as THREE.Material).dispose();
      glow.geometry.dispose();
      (glow.material as THREE.Material).dispose();
      for (const sector of sectors.values()) {
        sector.geometry.dispose();
        (sector.material as THREE.Material).dispose();
      }
      dividerV.geometry.dispose();
      dividerH.geometry.dispose();
      dividerMaterial.dispose();
      for (const icon of icons.values()) {
        icon.geometry.dispose();
        (icon.material as THREE.Material).dispose();
      }
      for (const texture of iconTextures) texture.dispose();
      knot.geometry.dispose();
      (knot.material as THREE.Material).dispose();
      stringLine.geometry.dispose();
      (stringLine.material as THREE.Material).dispose();
    },
  };

  return panel;
}
