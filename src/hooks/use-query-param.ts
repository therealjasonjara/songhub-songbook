'use client';

import { useState, useSyncExternalStore } from 'react';
import { createQueryStore } from '@/lib/query-url';

/** The search text, mirrored to `?q=` (see `lib/query-url.ts` for why this is not `useSearchParams`). */
export function useQueryParam(): [string, (text: string) => void] {
  const [store] = useState(() => createQueryStore());
  const text = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return [text, store.set];
}
