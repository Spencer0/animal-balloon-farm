import "./chapter-dom.css";

/**
 * The chapter goal chip: "Chapter 2 · The Lay of the Land", the goal line and a
 * thin bar for how close the farm is to it. It is informational, so it never
 * takes pointer input. It only rewrites its text when something changed.
 */

export interface ChapterChipState {
  readonly number: number;
  readonly title: string;
  readonly goal: string;
  /** 0..1 toward the chapter's goal. */
  readonly progress: number;
}

export interface ChapterDom {
  setVisible(visible: boolean): void;
  update(state: ChapterChipState): void;
  dispose(): void;
}

export function createChapterDom(): ChapterDom {
  let visible = false;
  let lastKey = "";

  const chip = document.createElement("div");
  chip.className = "cp-chip";
  chip.hidden = true;
  chip.setAttribute("role", "status");

  const heading = document.createElement("div");
  heading.className = "cp-heading";
  const goal = document.createElement("div");
  goal.className = "cp-goal";
  const track = document.createElement("div");
  track.className = "cp-track";
  const fill = document.createElement("div");
  fill.className = "cp-fill";
  track.append(fill);
  chip.append(heading, goal, track);
  document.body.append(chip);

  return {
    setVisible(next) {
      if (next === visible) return;
      visible = next;
      chip.hidden = !next;
    },
    update(state) {
      const percent = Math.round(Math.max(0, Math.min(1, state.progress)) * 100);
      const key = `${state.number}|${state.title}|${state.goal}|${percent}`;
      if (key === lastKey) return;
      lastKey = key;
      heading.textContent = `Chapter ${state.number} · ${state.title}`;
      goal.textContent = state.goal;
      fill.style.width = `${percent}%`;
      track.setAttribute("aria-valuenow", String(percent));
    },
    dispose() {
      chip.remove();
    },
  };
}
