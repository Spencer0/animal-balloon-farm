import "./options-dom.css";
import { createFpsMeter, fpsTone } from "../game/fps-meter";

/** The "Show FPS" readout. Costs nothing while hidden: `frame` returns before measuring. */
export interface FpsCounter {
  setVisible(visible: boolean): void;
  /** Call once per rendered frame with the requestAnimationFrame timestamp. */
  frame(nowMs: number): void;
  dispose(): void;
}

export function createFpsCounter(): FpsCounter {
  const meter = createFpsMeter();
  const element = document.createElement("div");
  element.className = "fps-counter";
  element.hidden = true;
  element.setAttribute("aria-hidden", "true");
  document.body.append(element);
  let visible = false;

  return {
    setVisible(next: boolean): void {
      if (visible === next) return;
      visible = next;
      element.hidden = !next;
      // A fresh window, so the time spent hidden never reads as one giant frame.
      meter.reset();
      if (next) {
        element.textContent = "-- FPS";
        delete element.dataset["tone"];
      }
    },
    frame(nowMs: number): void {
      if (!visible) return;
      const reading = meter.frame(nowMs);
      if (!reading) return;
      element.dataset["tone"] = fpsTone(reading.fps);
      element.textContent = `${Math.round(reading.fps)} FPS`;
      const worst = document.createElement("small");
      worst.textContent = `worst ${Math.round(reading.worstFrameMs)}ms`;
      element.append(worst);
    },
    dispose(): void {
      element.remove();
    },
  };
}
