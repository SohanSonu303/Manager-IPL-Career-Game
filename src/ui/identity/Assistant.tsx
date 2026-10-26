/**
 * The PA: the manager's assistant on the Market screen. A small SVG character in the
 * club's colours with a headset; she bobs, blinks and waves (CSS, off with reduced
 * motion).
 */
export function Assistant({
  size = 132,
  kit,
}: {
  size?: number
  kit: { primary: string; secondary: string }
}) {
  return (
    <svg
      className="pa"
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label="Your PA"
    >
      <defs>
        <radialGradient id="pa-bg" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#24406e" />
          <stop offset="100%" stopColor="#101a2e" />
        </radialGradient>
        <clipPath id="pa-clip">
          <circle cx="60" cy="60" r="56" />
        </clipPath>
      </defs>
      <circle cx="60" cy="60" r="58" fill="url(#pa-bg)" stroke="#3ddc7a" strokeWidth="2" />
      <g clipPath="url(#pa-clip)">
        <g className="pa-body">
          {/* Hair behind the head. */}
          <path d="M36 52c0-18 11-28 24-28s24 10 24 28v26H36z" fill="#2a1912" />
          {/* Blazer, shirt and neck. */}
          <path d="M22 120c2-22 14-34 38-34s36 12 38 34z" fill={kit.primary} />
          <path d="M50 87l10 16 10-16z" fill="#f4f1ea" />
          <path d="M50 87l10 16-6 17h-8z" fill={kit.secondary} opacity="0.55" />
          <rect x="54" y="74" width="12" height="15" rx="5" fill="#b97a52" />
          {/* Head. */}
          <ellipse cx="60" cy="56" rx="19" ry="22" fill="#c98e63" />
          {/* Fringe and bun. */}
          <path
            d="M41 52c2-16 12-22 21-22 10 0 17 7 18 20-8-2-15-7-19-13-4 7-11 12-20 15z"
            fill="#2a1912"
          />
          <circle cx="60" cy="25" r="9" fill="#2a1912" />
          {/* Eyes (they blink), brows, cheeks, smile. */}
          <g className="pa-eyes">
            <ellipse cx="52.5" cy="57" rx="2.4" ry="3" fill="#1b1410" />
            <ellipse cx="67.5" cy="57" rx="2.4" ry="3" fill="#1b1410" />
            <circle cx="53.3" cy="56" r="0.8" fill="#fff" />
            <circle cx="68.3" cy="56" r="0.8" fill="#fff" />
          </g>
          <path
            d="M48 50.5q4.5-2.5 9 0M63 50.5q4.5-2.5 9 0"
            stroke="#2a1912"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="48" cy="64" r="3" fill="#e2735f" opacity="0.35" />
          <circle cx="72" cy="64" r="3" fill="#e2735f" opacity="0.35" />
          <path
            d="M53.5 67q6.5 5 13 0"
            stroke="#7a2d22"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          {/* Headset. */}
          <path
            d="M39 56c0-16 9-25 21-25s21 9 21 25"
            stroke="#d7dbe6"
            strokeWidth="3"
            fill="none"
          />
          <rect x="35" y="51" width="7" height="12" rx="3" fill="#3ddc7a" />
          <rect x="78" y="51" width="7" height="12" rx="3" fill="#3ddc7a" />
          <path
            d="M40 62c0 8 5 11 11 11"
            stroke="#d7dbe6"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="52" cy="73" r="2.2" fill="#d7dbe6" />
        </g>
        {/* The waving hand. */}
        <g className="pa-wave">
          <path d="M92 104l6-24" stroke={kit.primary} strokeWidth="9" strokeLinecap="round" />
          <circle cx="99" cy="76" r="6" fill="#c98e63" />
          <path
            d="M96 71l-1-5M99 70v-6M102 71l1-5"
            stroke="#c98e63"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </g>
      </g>
    </svg>
  )
}
