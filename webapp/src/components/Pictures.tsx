// Simple illustrations for picture tiles: trash types and bag sizes.

export function TrashPicture({ code, size = 48 }: { code: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 48 48", "aria-hidden": true } as const;
  if (code === "construction") {
    return (
      <svg {...common}>
        <rect x="6" y="30" width="16" height="10" rx="2" fill="#f59e0b" />
        <rect x="24" y="30" width="18" height="10" rx="2" fill="#d97706" />
        <rect x="14" y="19" width="18" height="10" rx="2" fill="#fbbf24" />
        <path d="M30 8l8 8-3 3-8-8z" fill="#64748b" />
        <path d="M33 14 22 25" stroke="#92400e" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }
  if (code === "non_residential") {
    return (
      <svg {...common}>
        <rect x="8" y="14" width="32" height="26" rx="3" fill="#60a5fa" />
        <path d="M6 16 12 6h24l6 10z" fill="#2563eb" />
        <rect x="14" y="22" width="8" height="8" rx="1.5" fill="#eff6ff" />
        <rect x="26" y="22" width="8" height="18" rx="1.5" fill="#1e40af" />
      </svg>
    );
  }
  if (code === "household") {
    return (
      <svg {...common}>
        <path d="M12 16h24l-2 25a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3z" fill="#22c55e" />
        <path d="M17 16c0-6 3-10 7-10s7 4 7 10" fill="none" stroke="#15803d" strokeWidth="3" strokeLinecap="round" />
        <path d="M20 24v12M28 24v12" stroke="#bbf7d0" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="10" y="12" width="28" height="28" rx="6" fill="#a3a3a3" />
      <path d="M17 26h14M24 19v14" stroke="white" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** A bag drawn bigger for larger sizes, on the same baseline so sizes compare at a glance. */
export function BagPicture({ code }: { code: string }) {
  const s = code === "small" ? 0.62 : code === "large" ? 1 : 0.8;
  const w = 44 * s;
  const h = 50 * s;
  return (
    <svg width="48" height="54" viewBox="0 0 48 54" aria-hidden>
      <g transform={`translate(${(48 - w) / 2} ${54 - h}) scale(${s})`}>
        <path d="M6 14c0-2 2-4 4-4h24c2 0 4 2 4 4l2 30c0 3-2 6-6 6H10c-4 0-6-3-6-6z" fill="#334155" />
        <path d="M14 10c2-6 5-9 8-9s6 3 8 9" fill="none" stroke="#475569" strokeWidth="3" strokeLinecap="round" />
        <path d="M15 4l7 5 7-5" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" />
        <path d="M12 26h20" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}
