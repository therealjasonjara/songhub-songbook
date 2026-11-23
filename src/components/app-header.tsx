'use client';

import { MoonIcon, MusicNoteIcon, SunIcon } from '@/components/icons';
import { useTheme } from '@/hooks/use-theme';

/**
 * 56px header (docs/SHARED_COMPONENTS.md, component 1). Scrolls away with the page. Wordmark and theme toggle only.
 * `min-h-14`, not `h-14`: at 56px nothing changes, but with large text or a very narrow screen the wordmark wraps
 * and the header grows instead of the wordmark running into the toggle (WCAG 1.4.4 / 1.4.10).
 */
export function AppHeader() {
  const { theme, toggle } = useTheme();
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <header className="flex min-h-14 items-center justify-between gap-2 border-b border-divider bg-bg pr-4 pl-4">
      <div className="flex min-w-0 items-center gap-2">
        <MusicNoteIcon size={24} className="shrink-0 text-accent" />
        <h1 className="min-w-0 text-[20px] leading-6">
          <span className="font-extrabold text-text">SongHub</span>
          <span className="font-normal text-text-secondary"> Songbook</span>
        </h1>
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        className="flex size-11 shrink-0 items-center justify-center rounded-button text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
      >
        {theme === 'dark' ? <SunIcon size={24} /> : <MoonIcon size={24} />}
      </button>
    </header>
  );
}
