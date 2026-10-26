/** Our own simple line icons (24×24, 2px stroke, currentColor). */
const PATHS = {
  market: 'M3 7h11l4 4-4 4H3zM7 11h.01M17 17l4 4M21 17l-4 4',
  squad:
    'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6M2 20c0-3 3-5 6-5s6 2 6 5M14 15c3 0 8 1 8 5',
  stats: 'M4 20V4M4 20h16M7 15l4-5 3 3 5-7',
  table: 'M4 5h16M4 10h16M4 15h16M4 20h16M8 5v15',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5M8 14h2M14 14h2M8 17h2',
  lineup: 'M8 3l-4 3 2 3 2-1v13h8V8l2 1 2-3-4-3h-2a2 2 0 0 1-4 0z',
  board: 'M4 8h16v12H4zM9 8V5h6v3M4 13h16',
  finance: 'M7 5h10M7 9h10M10 5c4 0 4 8 0 8H7l7 7',
  club: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1',
  back: 'M15 5l-7 7 7 7',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  wallet: 'M3 7h16v12H3zM3 7l12-3v3M15 12h4v3h-4z',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 11v6M12 7h.01',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  gloves: 'M7 21v-6l-3-4 2-1 3 3V4h2v7-8h2v8-6h2v6-4h2v10l-2 5z',
  bat: 'M16 3l5 5-9.5 9.5-5-5zM9 15l-6 6',
  ball: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM7.5 5.2c2 3.5 2 10.1 0 13.6M16.5 5.2c-2 3.5-2 10.1 0 13.6',
  allround: 'M14 3l4 4-8 8-4-4zM8 13l-5 5M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  trophy:
    'M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6',
  play: 'M7 4l13 8-13 8z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM16 16l5 5',
  contract: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7',
  trade: 'M4 8h14l-4-4M20 16H6l4 4',
  log: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  filter: 'M3 5h18l-7 8v6l-4-2v-4z',
  menu: 'M4 7h16M4 12h16M4 17h16',
} as const

export type IconName = keyof typeof PATHS

export function Icon({
  name,
  size = 24,
  className,
}: {
  name: IconName
  size?: number
  className?: string
}) {
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
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
