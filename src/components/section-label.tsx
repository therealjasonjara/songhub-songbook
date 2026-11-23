export interface SectionLabelProps {
  children: string;
}

/** `ARTISTS` / `SONGS` strip (docs/SHARED_COMPONENTS.md, component 5): 32px, 12/16 600 uppercase, tracking 0.08em, muted, 16px inset. */
export function SectionLabel({ children }: SectionLabelProps) {
  return (
    <h2 className="m-0 flex h-8 items-center px-4 text-[12px] leading-4 font-semibold tracking-[0.08em] text-text-muted uppercase">{children}</h2>
  );
}
