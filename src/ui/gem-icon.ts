/**
 * The star gem's icon, `assets/goods/good-gem.png`, for the DOM panels.
 *
 * The art is rendered separately from the code that shows it, so a missing file
 * must not leave a broken-image box next to the gem count: `armGemIcons`
 * swaps any icon that fails to load for a drawn CSS gem (`.gem-fallback`).
 */

export const GEM_ICON_URL = "assets/goods/good-gem.png";

/** An inline gem icon. Call `armGemIcons` on the container after setting its innerHTML. */
export function gemIconHtml(extraClass = ""): string {
  return `<img class="gem-icon ${extraClass}" src="${GEM_ICON_URL}" alt="" draggable="false" data-gem-icon />`;
}

export function armGemIcons(root: ParentNode): void {
  root.querySelectorAll("img[data-gem-icon]").forEach((icon) => {
    const swap = (): void => {
      const fallback = document.createElement("span");
      fallback.className = `${icon.className} gem-fallback`;
      fallback.setAttribute("aria-hidden", "true");
      icon.replaceWith(fallback);
    };
    if (icon instanceof HTMLImageElement && icon.complete && icon.naturalWidth === 0 && icon.src) {
      // Already failed before the listener could attach (a cached 404).
      swap();
      return;
    }
    icon.addEventListener("error", swap, { once: true });
  });
}
