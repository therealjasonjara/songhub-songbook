import { AppHeader } from '@/components/app-header';
import { SearchApp } from '@/components/search-app';

/** One centred column (about 560px on large screens), full width on phones; safe-area insets respected. */
export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
      <AppHeader />
      <main className="flex-1">
        <SearchApp />
      </main>
    </div>
  );
}
