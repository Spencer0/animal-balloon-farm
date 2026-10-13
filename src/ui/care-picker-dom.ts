import "./care-picker-dom.css";
import type { CareGameKind } from "../game/care-minigames";
import type { PlantId } from "../game/plants";

/**
 * The debug picker for the care minigames (`?gardenDebug=1&careGames=1`): every
 * game grouped by plant type, with the plants that play it. Built games are
 * buttons; unbuilt ones are greyed. It is a debug tool, so it is only mounted by
 * the garden harness, and it is hidden while a game is on screen.
 */

export interface CarePickerGame {
  readonly kind: CareGameKind;
  readonly chore: string;
  readonly built: boolean;
  readonly species: readonly { readonly id: PlantId; readonly name: string }[];
}

export interface CarePickerGroup {
  readonly type: string;
  readonly games: readonly CarePickerGame[];
}

export interface CarePicker {
  show(): void;
  hide(): void;
  dispose(): void;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function createCarePicker(
  groups: readonly CarePickerGroup[],
  onPick: (kind: CareGameKind, species: PlantId) => void,
): CarePicker {
  const overlay = document.createElement("div");
  overlay.className = "cp-overlay";
  overlay.hidden = true;
  const panel = document.createElement("div");
  panel.className = "cp-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Care minigames");
  panel.innerHTML =
    `<div class="cp-head"><h1 class="cp-title">Care minigames</h1><button type="button" class="cp-x" aria-label="Close">&times;</button></div>` +
    `<p class="cp-hint">Tap a plant to play its game on the stage. Greyed games are not built yet.</p>` +
    groups.map((group) =>
      `<section class="cp-group"><h2>${escapeHtml(group.type)}</h2>` +
      group.games.map((game) =>
        `<div class="cp-row"><div class="cp-game">${escapeHtml(game.chore)} <small>(${escapeHtml(game.kind)})</small></div>` +
        `<div class="cp-plants">` + game.species.map((plant) =>
          `<button type="button" class="cp-btn" data-kind="${game.kind}" data-species="${plant.id}"${game.built ? "" : " disabled"}>${escapeHtml(plant.name)}</button>`,
        ).join("") +
        `</div></div>`,
      ).join("") +
      `</section>`,
    ).join("") +
    `<button type="button" class="cp-btn cp-close">Back to the farm</button>`;
  const closeFarm = (): void => { overlay.hidden = true; };
  overlay.append(panel);
  document.body.append(overlay);

  const onClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>("button[data-kind]");
    if (button && !button.disabled) {
      onPick(button.dataset.kind as CareGameKind, button.dataset.species as PlantId);
      return;
    }
    if (target?.closest(".cp-close, .cp-x")) closeFarm();
  };
  overlay.addEventListener("click", onClick);

  return {
    show(): void {
      overlay.hidden = false;
      overlay.scrollTop = 0;
    },
    hide(): void {
      overlay.hidden = true;
    },
    dispose(): void {
      overlay.removeEventListener("click", onClick);
      overlay.remove();
    },
  };
}
