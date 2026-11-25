/**
 * AppIcons.tsx
 *
 * Unified, professional, zero-dependency SVG icon system for ChessInReact Minimal.
 * Replaces all raw Unicode smartphone emojis with consistent, accessible, scalable vectors.
 * Styled after Lucide/Feather standards: 24x24 viewBox, stroke-width 2, round linecaps.
 */

import React from 'react';

export interface IIconProps {
  size?: number;
  className?: string;
  color?: string;
  style?: React.CSSProperties;
}

const baseSvg = (
  props: IIconProps,
  children: React.ReactNode,
  fillNone = true
) => (
  <svg
    width={props.size ?? 18}
    height={props.size ?? 18}
    viewBox="0 0 24 24"
    fill={fillNone ? 'none' : 'currentColor'}
    stroke={props.color ?? 'currentColor'}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={props.className}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...props.style }}
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const IconPlay: React.FC<IIconProps> = (p) =>
  baseSvg(p, <polygon points="5 3 19 12 5 21 5 3" fill={p.color ?? 'currentColor'} />);

export const IconPause: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <rect x="6" y="4" width="4" height="16" fill={p.color ?? 'currentColor'} />
      <rect x="14" y="4" width="4" height="16" fill={p.color ?? 'currentColor'} />
    </>
  );

export const IconBot: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8.01" y2="16" strokeWidth="3" />
      <line x1="16" y1="16" x2="16.01" y2="16" strokeWidth="3" />
    </>
  );

export const IconUsers: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  );

export const IconPuzzle: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <path d="M19.439 7.85c0-1.57.802-2.5 1.561-2.85V4.5A1.5 1.5 0 0 0 19.5 3h-2.5c-.35.759-1.28 1.561-2.85 1.561s-2.5-.802-2.85-1.561H8.8c-.35.759-1.28 1.561-2.85 1.561S3.45 3.759 3.1 3H2a1 1 0 0 0-1 1v1.1c.759.35 1.561 1.28 1.561 2.85s-.802 2.5-1.561 2.85V15a1 1 0 0 0 1 1h1.1c.35-.759 1.28-1.561 2.85-1.561s2.5.802 2.85 1.561h2.5c.35-.759 1.28-1.561 2.85-1.561s2.5.802 2.85 1.561H20a1 1 0 0 0 1-1v-4.3c-.759-.35-1.561-1.28-1.561-2.85z" />
    </>
  );

export const IconBookOpen: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </>
  );

export const IconBarChart: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </>
  );

export const IconSettings: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  );

export const IconGrid: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </>
  );

/**
 * Authentic Vector Rubber Duck for Duck Chess (Spec 13 § 2, RF-13-01).
 * Replaces the raw Unicode 🦆 smartphone emoji with a clean geometric icon.
 */
export const IconDuck: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      {/* Duck body & tail */}
      <path d="M4 14c0 3.5 3 6 7 6s8-2.5 8-6c0-1.5-.5-2.5-1.5-3.5C16.5 9.5 15 9 14 9H9c-2 0-5 2-5 5z" />
      {/* Duck head */}
      <circle cx="8" cy="7" r="3.5" />
      {/* Eye */}
      <circle cx="7" cy="6" r="0.75" fill="currentColor" />
      {/* Bill / Beak */}
      <path d="M4.5 7.5L2 8c0 1 1.5 1.5 2.5 1.5" />
    </>
  );

export const IconFreeze: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <line x1="12" y1="2" x2="12" y2="22" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
      <line x1="19.07" y1="4.93" x2="4.93" y2="19.07" />
      <circle cx="12" cy="12" r="2" />
    </>
  );

export const IconJump: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </>
  );

export const IconSwords: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
      <line x1="13" y1="19" x2="19" y2="13" />
      <line x1="16" y1="16" x2="20" y2="20" />
      <line x1="19" y1="21" x2="21" y2="19" />
      <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" />
      <line x1="5" y1="14" x2="9" y2="18" />
      <line x1="7" y1="17" x2="4" y2="20" />
      <line x1="3" y1="19" x2="5" y2="21" />
    </>
  );

export const IconTrophy: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.45 1-1 1H7" />
      <path d="M14 14.66V17c0 .55.45 1 1 1h2" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
    </>
  );

export const IconFlame: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </>
  );

export const IconClock: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </>
  );

export const IconCheck: React.FC<IIconProps> = (p) =>
  baseSvg(p, <polyline points="20 6 9 17 4 12" />);

export const IconX: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>
  );

export const IconChevronRight: React.FC<IIconProps> = (p) =>
  baseSvg(p, <polyline points="9 18 15 12 9 6" />);

export const IconChevronDown: React.FC<IIconProps> = (p) =>
  baseSvg(p, <polyline points="6 9 12 15 18 9" />);

export const IconChevronLeft: React.FC<IIconProps> = (p) =>
  baseSvg(p, <polyline points="15 18 9 12 15 6" />);

export const IconRotateCcw: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </>
  );

export const IconRotateCw: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </>
  );

export const IconFlag: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </>
  );

export const IconHandshake: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <path d="M18 11l-4-4a2 2 0 0 0-2.83 0L7 11" />
      <path d="M6 13l4 4a2 2 0 0 0 2.83 0L17 13" />
      <path d="M3 7l4 4" />
      <path d="M21 7l-4 4" />
    </>
  );

export const IconRefresh: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </>
  );

export const IconEye: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </>
  );

export const IconVolume2: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    </>
  );

export const IconVolumeX: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </>
  );

export const IconSun: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </>
  );

export const IconMoon: React.FC<IIconProps> = (p) =>
  baseSvg(p, <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />);

export const IconShield: React.FC<IIconProps> = (p) =>
  baseSvg(p, <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />);

export const IconTarget: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </>
  );

export const IconBox: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </>
  );

export const IconCastle: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <path d="M4 21V9l2-2h12l2 2v12H4z" />
      <path d="M4 9h16" />
      <path d="M9 21v-5a3 3 0 0 1 6 0v5" />
      <path d="M6 4v3" />
      <path d="M10 4v3" />
      <path d="M14 4v3" />
      <path d="M18 4v3" />
    </>
  );

export const IconSparkles: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <path d="M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4L12 2z" />
      <path d="M19 17l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" />
    </>
  );

export const IconCopy: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  );

export const IconCrown: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <path d="M3 8l4 6 5-8 5 8 4-6v11H3V8z" />
      <circle cx="3" cy="7" r="1" fill={p.color ?? 'currentColor'} />
      <circle cx="12" cy="5" r="1" fill={p.color ?? 'currentColor'} />
      <circle cx="21" cy="7" r="1" fill={p.color ?? 'currentColor'} />
    </>
  );

export const IconFinishFlag: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
      <line x1="10" y1="3" x2="10" y2="15" />
      <line x1="16" y1="4" x2="16" y2="16" />
    </>
  );

export const IconPortal: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <ellipse cx="12" cy="12" rx="9" ry="4.5" transform="rotate(-30 12 12)" />
      <ellipse cx="12" cy="12" rx="6" ry="3" transform="rotate(-30 12 12)" />
      <circle cx="12" cy="12" r="1.5" fill={p.color ?? 'currentColor'} />
    </>
  );

export const IconTrap: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <circle cx="12" cy="14" r="6" />
      <line x1="12" y1="8" x2="12" y2="4" />
      <line x1="15" y1="4" x2="9" y2="4" />
      <circle cx="12" cy="14" r="2" fill={p.color ?? 'currentColor'} />
    </>
  );

export const IconExplosion: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <path d="M12 2l2.5 5.5L20 6l-3.5 5 5 3-6 1.5L17 22l-5-4-5 4 1.5-6.5L2 14l5-3-3.5-5 5.5 1.5L12 2z" />
    </>
  );

export const IconAlertTriangle: React.FC<IIconProps> = (p) =>
  baseSvg(
    p,
    <>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>
  );


