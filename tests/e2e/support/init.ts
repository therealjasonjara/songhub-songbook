import type { Metrics } from './globals';
/**
 * Runs in the page before any of its scripts (page.addInitScript). Records, on `window.__m`: when the search worker said
 * `ready`, when the first song row was drawn, and the long tasks and slow input events. Nothing here changes behaviour.
 */
export function installMetrics(): void {
  const m: Metrics = (window.__m = { longtasks: [], events: [], ready: null, firstRows: null });
  const Orig = window.Worker;
  window.Worker = class extends Orig {
    constructor(...args: ConstructorParameters<typeof Worker>) {
      super(...args);
      this.addEventListener('message', (e: MessageEvent<{ type?: string } | null>) => {
        if (e.data && e.data.type === 'ready') m.ready = performance.now();
      });
    }
  };
  new PerformanceObserver((list) => list.getEntries().forEach((e) => m.longtasks.push({ start: e.startTime, dur: e.duration }))).observe({
    type: 'longtask',
    buffered: true,
  });
  new PerformanceObserver((list) => list.getEntries().forEach((e) => m.events.push({ name: e.name, start: e.startTime, dur: e.duration }))).observe({
    type: 'event',
    durationThreshold: 16,
    buffered: true,
  } as PerformanceObserverInit);
  new MutationObserver(() => {
    if (m.firstRows === null && document.querySelector('main ul[aria-label="Song results"] > li')) m.firstRows = performance.now();
  }).observe(document, { childList: true, subtree: true });
}
