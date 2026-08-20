/**
 * BrandEmblem — Kodiak Island mountain emblem, badge-style logo mark.
 *
 * Built as inline SVG (no image asset exists for this yet). A circular ring
 * carries the site name on the top arc and "Kodiak Island, Alaska" on the
 * bottom arc, wrapping a mountain silhouette over water.
 */
export default function BrandEmblem({ className = "", ringId = "brandEmblemRing" }) {
  const topArcId = `${ringId}-top`;
  const bottomArcId = `${ringId}-bottom`;

  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Affiliate Pro X — Kodiak Island, Alaska">
      <defs>
        <linearGradient id={`${ringId}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F5B942" />
          <stop offset="100%" stopColor="#E09A2C" />
        </linearGradient>
        <linearGradient id={`${ringId}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#123A6E" />
          <stop offset="100%" stopColor="#0B2244" />
        </linearGradient>
        <path id={topArcId} d="M 12 50 A 38 38 0 0 1 88 50" fill="none" />
        <path id={bottomArcId} d="M 16 62 A 34 34 0 0 0 84 62" fill="none" />
      </defs>

      <circle cx="50" cy="50" r="47" fill="#071A35" stroke={`url(#${ringId}-gold)`} strokeWidth="2.5" />
      <circle cx="50" cy="50" r="40" fill={`url(#${ringId}-sky)`} />

      {/* Sun */}
      <circle cx="50" cy="42" r="7" fill="#F5B942" opacity="0.9" />

      {/* Water */}
      <path d="M 12 70 Q 50 64 88 70 L 88 82 Q 50 76 12 82 Z" fill="#0E2C55" />
      <path d="M 12 74 Q 50 69 88 74" stroke="#38D9E8" strokeWidth="0.6" fill="none" opacity="0.55" />

      {/* Mountains */}
      <path
        d="M 12 70 L 27 46 L 36 58 L 47 38 L 60 58 L 70 44 L 88 70 Z"
        fill="#12356A"
        stroke="#1E4C86"
        strokeWidth="0.6"
      />
      <path d="M 47 38 L 52 46 L 44 46 Z" fill="#EAF3FF" opacity="0.9" />
      <path d="M 27 46 L 30.5 51 L 24.5 51 Z" fill="#EAF3FF" opacity="0.75" />
      <path d="M 70 44 L 73.5 49.5 L 67 49.5 Z" fill="#EAF3FF" opacity="0.75" />

      <circle cx="50" cy="50" r="40" fill="none" stroke="#1E4C86" strokeWidth="1" />

      <text
        fill="#F5B942"
        fontSize="8.4"
        fontWeight="700"
        letterSpacing="1.3"
        style={{ textTransform: "uppercase" }}
      >
        <textPath href={`#${topArcId}`} startOffset="50%" textAnchor="middle">
          Affiliate Pro X
        </textPath>
      </text>

      <text
        fill="#9CBCDC"
        fontSize="5.6"
        fontWeight="600"
        letterSpacing="0.8"
        style={{ textTransform: "uppercase" }}
      >
        <textPath href={`#${bottomArcId}`} startOffset="50%" textAnchor="middle">
          Kodiak Island, Alaska
        </textPath>
      </text>
    </svg>
  );
}
