'use client';

import { useState, useSyncExternalStore } from 'react';
import { createNavStore, type NavState, type NavStore } from '@/lib/query-url';

export interface Navigation extends NavState {
  setQuery: NavStore['setQuery'];
  openArtist: NavStore['openArtist'];
  closeArtist: NavStore['closeArtist'];
  dropArtist: NavStore['dropArtist'];
}

/** The search text (`?q=`) and the open artist (`?artist=`), mirrored to the address bar (see `lib/query-url.ts`). */
export function useNavigation(): Navigation {
  const [store] = useState(() => createNavStore());
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return { ...state, setQuery: store.setQuery, openArtist: store.openArtist, closeArtist: store.closeArtist, dropArtist: store.dropArtist };
}
