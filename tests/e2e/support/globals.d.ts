/** What the init script (support/init.ts) records on `window` for the tests. */
export interface LongTask {
  start: number;
  dur: number;
}
export interface InputEvent2 {
  name: string;
  start: number;
  dur: number;
}
export interface Metrics {
  longtasks: LongTask[];
  events: InputEvent2[];
  /** performance.now() when the search worker said `ready` (null until then). */
  ready: number | null;
  /** performance.now() when the first song row appeared. */
  firstRows: number | null;
}

declare global {
  interface Window {
    __m: Metrics;
  }
}
