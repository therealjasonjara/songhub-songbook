'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { DEFAULT_THEME, applyTheme, nextTheme, readTheme, subscribeTheme } from '@/lib/theme';
import type { Theme } from '@/lib/tokens';

/** The session theme and a toggle. Dark on the server and on first paint, whatever the system setting says. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => DEFAULT_THEME);
  const toggle = useCallback(() => applyTheme(nextTheme(readTheme())), []);
  return { theme, toggle };
}
