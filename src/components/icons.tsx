import type { ReactElement, SVGProps } from 'react';

/** Inline SVG icons (no icon font, no CDN). They take their colour from `currentColor` and are decorative: the control that holds them carries the accessible name. */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height' | 'children'> {
  /** Width and height in px. */
  size?: number;
}

function Svg({ size = 24, children, ...rest }: IconProps & { children: ReactElement | ReactElement[] }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Two beamed notes (filled). Used at 24px in the header and 48px on the home state. */
export function MusicNoteIcon(props: IconProps) {
  return (
    <Svg {...props} fill="currentColor" stroke="none">
      <circle cx="7" cy="18.5" r="3" />
      <circle cx="17" cy="16.5" r="3" />
      <path d="M8 6h2v12.5H8zM18 3.8h2v12.7h-2z" />
      <path d="M8 6.2 20 3.8v3.9L8 10.1z" />
    </Svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4.5 4.5" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m9 6 6 6-6 6" />
    </Svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m15 6-6 6 6 6" />
    </Svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
    </Svg>
  );
}

/** Magnifier with an x in the lens (the empty state, 48px, muted). */
export function SearchOffIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4.5 4.5M8.5 8.5l5 5M13.5 8.5l-5 5" />
    </Svg>
  );
}
