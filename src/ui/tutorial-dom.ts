import "./tutorial-dom.css";
import { nudgeVisible, TUTORIAL_TEXT, tutorialStep, type TutorialSignals, type TutorialStep } from "../game/tutorial";

/**
 * The tutorial's text bubble. The glows themselves live where they point (the
 * balloon glows behind its shed icon, the shed marks its own tab and seed), so
 * this only owns the small speech bubble floating above the balloon and the
 * clock that brings it back every ten seconds. It never takes the pointer.
 */

export interface TutorialDom {
  readonly step: TutorialStep;
  /** Advance the trail; `anchor` is where the bubble's tail should point (CSS px). */
  update(signals: TutorialSignals, anchor: { x: number; y: number }): void;
  dispose(): void;
}

export function createTutorialDom(): TutorialDom {
  const bubble = document.createElement("div");
  bubble.className = "tu-bubble";
  bubble.setAttribute("aria-hidden", "true");
  document.body.append(bubble);

  let step: TutorialStep = "done";
  let stepStartedAt = performance.now();

  return {
    get step() {
      return step;
    },
    update(signals, anchor) {
      const next = tutorialStep(signals);
      if (next !== step) {
        step = next;
        stepStartedAt = performance.now();
      }
      // Wall-clock, not frame time: the game caps its frame delta, which would stretch the ten seconds on a slow machine.
      const seconds = (performance.now() - stepStartedAt) / 1000;
      // Only the shed gets the repeating bubble; later steps are marked by glow alone.
      const show = step === "open-shed" && nudgeVisible(seconds);
      if (step === "open-shed") {
        bubble.textContent = TUTORIAL_TEXT["open-shed"];
        // The bubble hangs above the anchor with its tail pointing down at it.
        // Keep the whole bubble on screen, then slide the tail back onto the anchor.
        bubble.style.left = `${anchor.x}px`;
        bubble.style.top = `${anchor.y}px`;
        const width = bubble.offsetWidth || 0;
        if (width > 0) {
          const left = Math.min(
            Math.max(anchor.x - width / 2, 8),
            Math.max(8, window.innerWidth - width - 8),
          );
          bubble.style.left = `${left + width / 2}px`;
          const tailX = Math.min(Math.max(anchor.x - left, 18), Math.max(18, width - 18));
          bubble.style.setProperty("--tu-tail-x", `${tailX}px`);
        }
      }
      bubble.dataset["show"] = String(show);
    },
    dispose() {
      bubble.remove();
    },
  };
}
