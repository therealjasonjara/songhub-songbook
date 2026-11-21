'use client';

import { useEffect, useState } from 'react';

/**
 * The value once it has stayed the same for `delay` ms. `null` clears it on the next tick, so a new query starts
 * from silence and the next settled answer is announced once.
 */
export function useSettledValue(value: string | null, delay: number): string | null {
  const [settled, setSettled] = useState<string | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), value === null ? 0 : delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return value !== null && settled === value ? settled : null;
}
