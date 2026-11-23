'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { SearchOffIcon } from '@/components/icons';
import { fitWithEllipsis } from '@/lib/fit-text';

export interface NoResultsProps {
  /** The text the guest typed, echoed back. */
  query: string;
}

const BEFORE = 'Nothing matches "';
const AFTER = '".';

/**
 * Empty state (docs/SHARED_COMPONENTS.md, component 7). No buttons: the search box stays focused.
 * A long query is cut by measuring, so the ellipsis is followed directly by the closing quote and period
 * (CSS `text-overflow` would leave up to a letter's width of gap before them).
 */
export function NoResults({ query }: NoResultsProps) {
  const line = useRef<HTMLParagraphElement>(null);
  const [shown, setShown] = useState(query);

  useLayoutEffect(() => {
    const el = line.current;
    if (!el) return;
    let context: CanvasRenderingContext2D | null = null;
    function fit() {
      // No layout (a test DOM): nothing to measure, show it all.
      if (!el || el.clientWidth === 0) {
        setShown(query);
        return;
      }
      context ??= document.createElement('canvas').getContext('2d');
      const canvas = context;
      if (!canvas) {
        setShown(query);
        return;
      }
      const style = getComputedStyle(el);
      canvas.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const room = el.clientWidth - 1;
      setShown(fitWithEllipsis(query, (candidate) => canvas.measureText(`${BEFORE}${candidate}${AFTER}`).width <= room));
    }
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    // The width of the text changes when the web font arrives.
    void document.fonts?.ready.then(fit);
    return () => observer.disconnect();
  }, [query]);

  return (
    <section aria-labelledby="no-results-title" className="flex min-w-0 flex-col items-center text-center">
      <SearchOffIcon size={48} className="text-text-muted" />
      <h2 id="no-results-title" className="mt-4 text-[20px] leading-7 font-bold text-text">
        No songs found
      </h2>
      <p ref={line} className="mt-4 w-full max-w-full min-w-0 overflow-hidden text-base leading-6 whitespace-nowrap text-text-secondary">
        {BEFORE}
        {shown}
        {AFTER}
      </p>
      <p className="mt-2 text-[14px] leading-5 text-text-muted">Check the spelling, or try fewer words.</p>
    </section>
  );
}
