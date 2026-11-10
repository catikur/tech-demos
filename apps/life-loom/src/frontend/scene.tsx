export function Scene({
  hue,
  motif,
  stageIndex,
  caption,
}: {
  hue: number;
  motif: string;
  stageIndex: number;
  caption: string;
}) {
  const sky = `hsl(${hue} 46% 34%)`;
  const sky2 = `hsl(${hue} 32% 12%)`;
  const ground = `hsl(${hue} 24% 16%)`;
  const glow = `hsl(${hue} 78% 72%)`;
  const ink = `hsl(${hue} 30% 88%)`;
  const h = 54 + stageIndex * 18;
  const gid = `sky-${hue}-${motif}`;

  return (
    <svg className="scene-svg" viewBox="0 0 720 380" role="img" aria-label={caption}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={sky} />
          <stop offset="100%" stopColor={sky2} />
        </linearGradient>
      </defs>
      <rect width="720" height="380" fill={`url(#${gid})`} />
      <circle cx="590" cy="74" r="26" fill={glow} opacity="0.95" />
      <circle cx="120" cy="96" r="3" fill={ink} opacity="0.7" />
      <circle cx="168" cy="64" r="2" fill={ink} opacity="0.55" />
      <circle cx="210" cy="110" r="2" fill={ink} opacity="0.45" />
      <path d="M0 246 C 140 210, 280 278, 460 230 C 560 206, 640 214, 720 196 L 720 380 L 0 380 Z" fill={ground} />
      <Motif motif={motif} glow={glow} ink={ink} />
      <g transform={`translate(318 ${250 - h})`}>
        <circle cx="28" cy="16" r="14" fill={ink} />
        <rect x="16" y="32" width="24" height={h * 0.46} rx="10" fill={ink} />
        <rect x="4" y={32 + h * 0.28} width="18" height="8" rx="4" fill={ink} />
        <rect x="34" y={32 + h * 0.28} width="18" height="8" rx="4" fill={ink} />
      </g>
    </svg>
  );
}

function Motif({ motif, glow, ink }: { motif: string; glow: string; ink: string }) {
  if (motif === "cradle" || motif === "pod") {
    return (
      <g fill="none" stroke={ink} strokeWidth="3">
        <ellipse cx="180" cy="228" rx="54" ry="18" />
        <path d="M150 228 Q 180 188 210 228" />
      </g>
    );
  }
  if (motif === "street") {
    return (
      <g stroke={glow} strokeWidth="3" fill="none">
        <path d="M150 210 L 190 120 L 230 210" />
        <path d="M190 120 L 250 170" />
        <path d="M188 210 L 192 250" stroke={ink} />
      </g>
    );
  }
  if (motif === "school" || motif === "class") {
    return (
      <g fill={ink} opacity="0.85">
        <rect x="128" y="168" width="28" height="36" rx="2" />
        <rect x="166" y="168" width="28" height="36" rx="2" />
        <rect x="204" y="168" width="28" height="36" rx="2" />
      </g>
    );
  }
  if (motif === "work" || motif === "shift") {
    return (
      <g fill="none" stroke={glow} strokeWidth="3">
        <path d="M120 236 L 210 236 L 196 214 L 134 214 Z" />
        <path d="M168 214 L 168 168" stroke={ink} />
      </g>
    );
  }
  if (motif === "home" || motif === "found") {
    return (
      <g fill="none" stroke={ink} strokeWidth="3">
        <path d="M124 230 L 124 188 L 176 150 L 228 188 L 228 230 Z" />
      </g>
    );
  }
  if (motif === "evening" || motif === "star") {
    return (
      <g stroke={glow} strokeWidth="3" fill="none">
        <path d="M168 250 L 168 150" />
        <circle cx="168" cy="142" r="10" fill={glow} stroke="none" />
        <path d="M150 168 H 186" stroke={ink} />
      </g>
    );
  }
  if (motif === "voyage") {
    return (
      <g fill="none" stroke={glow} strokeWidth="3">
        <path d="M470 150 L 560 118 L 548 164 Z" />
        <path d="M500 164 L 470 210" stroke={ink} />
      </g>
    );
  }
  return null;
}
