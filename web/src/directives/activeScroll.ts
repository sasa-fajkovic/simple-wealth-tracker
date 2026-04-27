import type { Directive, DirectiveBinding } from 'vue'

/**
 * v-active-scroll
 *
 * Auto-scrolls a horizontally-scrollable container so its active child
 * button (PrimeVue SelectButton: `[aria-pressed="true"]`) is centered
 * within the visible strip.
 *
 * Apply to a `.wt-control-strip` (or any `overflow-x: auto` container)
 * that wraps a SelectButton group:
 *
 *   <div class="wt-control-strip" v-active-scroll>
 *     <SelectButton … />
 *   </div>
 *
 * Behavior:
 *  - On mount: positions the active pill into view without animation.
 *  - On selection change (aria-pressed mutation): smooth-scrolls the
 *    new active pill into view.
 *  - Only scrolls the strip itself; never the document.
 *  - No-op if the strip is wider than its content (nothing to scroll).
 */

const observers = new WeakMap<HTMLElement, MutationObserver>()

function scrollActiveIntoView(strip: HTMLElement, smooth: boolean): void {
  if (strip.scrollWidth <= strip.clientWidth) return
  const active = strip.querySelector<HTMLElement>('[aria-pressed="true"]')
  if (!active) return
  const target = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2
  const max = strip.scrollWidth - strip.clientWidth
  strip.scrollTo({
    left: Math.max(0, Math.min(max, target)),
    behavior: smooth ? 'smooth' : 'auto',
  })
}

export const vActiveScroll: Directive<HTMLElement, void> = {
  mounted(el: HTMLElement, _binding: DirectiveBinding<void>) {
    requestAnimationFrame(() => scrollActiveIntoView(el, false))

    const observer = new MutationObserver(() => {
      scrollActiveIntoView(el, true)
    })
    observer.observe(el, {
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-pressed'],
    })
    observers.set(el, observer)
  },
  unmounted(el: HTMLElement) {
    observers.get(el)?.disconnect()
    observers.delete(el)
  },
}
