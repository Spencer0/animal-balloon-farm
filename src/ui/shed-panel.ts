import * as THREE from "three";
import type { UIPanel } from "./ui-layer";
import type { UiCursorKind } from "./ui-cursor";
import { createUIViewport, fitAspectRect, rectContains, type DesignPoint, type DesignRect } from "./ui-viewport";

export interface ShedPanel extends UIPanel {
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  toggle(): void;
  setVisible(visible: boolean): void;
  setPlacementActive(active: boolean): void;
  setInteractEnabled(enabled: boolean): void;
  contains(point: DesignPoint): boolean;
  refresh(): void;
}

const SPREAD_WIDTH = 1280;
const SPREAD_HEIGHT = 720;
const SPREAD_MARGIN = 40;
const SHED_LOCAL = { x: 424, y: -280 };
const PLANE_SIZE = 168;
const SHED_HIT = { width: 180, height: 180 };

export function createShedPanel(
  cssWidth: number,
  cssHeight: number,
  onToggle?: (isOpen: boolean) => void,
): ShedPanel {
  const viewport = createUIViewport();
  viewport.resize(cssWidth, cssHeight);

  const object = new THREE.Group();
  object.name = "Shed launcher";

  const textureLoader = new THREE.TextureLoader();
  const spriteTexture = textureLoader.load(
    "assets/ui/shed-launcher.png",
    () => {
      spriteTexture.colorSpace = THREE.SRGBColorSpace;
      spriteTexture.needsUpdate = true;
      meshReady = true;
      layout();
    },
    undefined,
    () => {
      console.warn("[shed] launcher sprite failed to load");
    },
  );
  const spriteMaterial = new THREE.MeshBasicMaterial({
    map: spriteTexture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const shed = new THREE.Mesh(new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE), spriteMaterial);
  shed.name = "Shed sprite";
  object.add(shed);

  let isOpen = false;
  let visible = true;
  let interactEnabled = true;
  let placementActive = false;
  let hovered = false;
  let meshReady = false;
  let spread: DesignRect = { x: 0, y: 0, width: 1, height: 1 };
  let spreadScale = 1;
  let bobPhase = 0;

  function layout(): void {
    spread = fitAspectRect(viewport, SPREAD_WIDTH / SPREAD_HEIGHT, SPREAD_MARGIN);
    spreadScale = spread.width / SPREAD_WIDTH;
    const centreX = spread.x + spread.width / 2 + SHED_LOCAL.x * spreadScale;
    const centreY = spread.y + spread.height / 2 + SHED_LOCAL.y * spreadScale;
    shed.position.set(centreX, centreY, 1);
    shed.scale.setScalar(spreadScale);
    shed.visible = visible && meshReady && !isOpen;
  }

  function shedRect(): DesignRect {
    const centreX = spread.x + spread.width / 2 + SHED_LOCAL.x * spreadScale;
    const centreY = spread.y + spread.height / 2 + SHED_LOCAL.y * spreadScale;
    return {
      x: centreX - (SHED_HIT.width * spreadScale) / 2,
      y: centreY - (SHED_HIT.height * spreadScale) / 2,
      width: SHED_HIT.width * spreadScale,
      height: SHED_HIT.height * spreadScale,
    };
  }

  function containsPoint(point: DesignPoint): boolean {
    if (!visible || isOpen) return false;
    return rectContains(shedRect(), point);
  }

  function openShed(): void {
    if (isOpen) return;
    isOpen = true;
    layout();
    console.info("[shed] open");
    onToggle?.(true);
  }

  function closeShed(): void {
    if (!isOpen) return;
    isOpen = false;
    layout();
    console.info("[shed] close");
    onToggle?.(false);
  }

  layout();

  const panel: ShedPanel = {
    name: "shed",
    object,
    order: 8,
    get isOpen() {
      return isOpen;
    },
    open(): void {
      openShed();
    },
    close(): void {
      closeShed();
    },
    toggle(): void {
      if (isOpen) closeShed();
      else openShed();
    },
    setVisible(next: boolean): void {
      if (visible === next) return;
      visible = next;
      layout();
    },
    setPlacementActive(active: boolean): void {
      placementActive = active;
      spriteMaterial.color.set(active ? "#ffd98a" : "#ffffff");
    },
    setInteractEnabled(enabled: boolean): void {
      interactEnabled = enabled;
    },
    contains(point: DesignPoint): boolean {
      return containsPoint(point);
    },
    refresh(): void {
      layout();
    },
    pointerDown(point, event): boolean {
      if (!visible || isOpen || !interactEnabled || !meshReady) return false;
      if (!rectContains(shedRect(), point)) return false;
      event.preventDefault();
      openShed();
      return true;
    },
    pointerMove(point): boolean {
      hovered = visible && !isOpen && interactEnabled && rectContains(shedRect(), point);
      return hovered;
    },
    pointerUp(): boolean {
      return false;
    },
    cursor(point): UiCursorKind | undefined {
      if (!visible || isOpen || !interactEnabled) return undefined;
      return rectContains(shedRect(), point) ? "point" : undefined;
    },
    hitTest(point): boolean {
      return containsPoint(point);
    },
    update(delta: number): void {
      bobPhase += delta;
      const bob = Math.sin(bobPhase * 2.2) * 0.02 + 1;
      shed.scale.setScalar(spreadScale * (hovered && !isOpen ? 1.07 * bob : bob));
    },
    resize(width, height): void {
      viewport.resize(width, height);
      layout();
    },
    describe() {
      return { open: isOpen, ready: meshReady, rect: shedRect(), placementActive };
    },
    dispose(): void {
      shed.geometry.dispose();
      spriteTexture.dispose();
      spriteMaterial.dispose();
    },
  };

  return panel;
}
