/**
 * Anatomical SVG icons — minimalist stroke style.
 * All icons: 24×24 viewBox, fill=none, stroke=currentColor,
 * strokeWidth=1.5, round linecap/linejoin.
 */

interface IconProps {
  className?: string;
  size?: number;
}

function Svg({ size = 24, className, children }: { size?: number; className?: string; children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

/** Cervikale — head + neck column + cervical vertebrae + shoulder outline */
export function IconCervikale({ className, size }: IconProps) {
  return (
    <Svg size={size} className={className}>
      {/* Head */}
      <circle cx="12" cy="4" r="2.5" />
      {/* Left/right neck edges, slightly curved inward */}
      <path d="M9.5 6.5 C9 9 9 12 9.5 15" />
      <path d="M14.5 6.5 C15 9 15 12 14.5 15" />
      {/* Intervertebral disc lines (C3–C5) */}
      <line x1="9.5" y1="8.5" x2="14.5" y2="8.5" />
      <line x1="9.3" y1="11"  x2="14.7" y2="11"  />
      <line x1="9.5" y1="13.5" x2="14.5" y2="13.5" />
      {/* Shoulder wings */}
      <path d="M9.5 15 C7 16 4 17 2 18" />
      <path d="M14.5 15 C17 16 20 17 22 18" />
    </Svg>
  );
}

/** Torakale — thoracic spine (back view) with 3 rib pairs */
export function IconTorakale({ className, size }: IconProps) {
  return (
    <Svg size={size} className={className}>
      {/* Central spine */}
      <line x1="12" y1="2" x2="12" y2="22" />
      {/* Rib pair 1 */}
      <path d="M12 5  C10 5.5  7.5 7   6.5 9"  />
      <path d="M12 5  C14 5.5  16.5 7  17.5 9" />
      {/* Rib pair 2 */}
      <path d="M12 10 C9.5 10.5 7  12  6  14"  />
      <path d="M12 10 C14.5 10.5 17 12 18 14"  />
      {/* Rib pair 3 */}
      <path d="M12 15 C10 15.5 8  17  7.5 19"  />
      <path d="M12 15 C14 15.5 16 17 16.5 19"  />
    </Svg>
  );
}

/** Lombosakrale — 5 lumbar vertebrae (widening downward) + sacrum wedge */
export function IconLombosakrale({ className, size }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <rect x="9.5" y="2"    width="5"   height="2"   rx="0.5" />
      <rect x="9"   y="4.5"  width="6"   height="2"   rx="0.5" />
      <rect x="8.5" y="7"    width="7"   height="2"   rx="0.5" />
      <rect x="8"   y="9.5"  width="8"   height="2"   rx="0.5" />
      <rect x="7.5" y="12"   width="9"   height="2"   rx="0.5" />
      {/* Sacrum — inverted trapezoid */}
      <path d="M8 15 L16 15 L13.5 21 L10.5 21 Z" />
    </Svg>
  );
}

/** Krahu — shoulder joint (front view): clavicle + glenoid + humeral head */
export function IconKrahu({ className, size }: IconProps) {
  return (
    <Svg size={size} className={className}>
      {/* Clavicle */}
      <path d="M5 8 C8 7 11 7.5 13 9" />
      {/* Acromion */}
      <path d="M13 9 C15 8.5 17 9 17.5 10.5" />
      {/* Glenoid socket (cup arc) */}
      <path d="M17.5 10.5 C18.5 12 18.5 15 17 16.5" />
      {/* Humeral head */}
      <circle cx="14.5" cy="13" r="3" />
      {/* Humerus shaft */}
      <line x1="14.5" y1="16" x2="13" y2="23" />
    </Svg>
  );
}

/** Bërryli — bent arm (back view): upper arm + elbow joint + forearm */
export function IconBerryli({ className, size }: IconProps) {
  return (
    <Svg size={size} className={className}>
      {/* Humerus (upper arm) */}
      <path d="M9 2 C9.5 5 11 8 13 11" />
      {/* Elbow joint */}
      <circle cx="13" cy="12" r="2.5" />
      {/* Ulna */}
      <path d="M13 14.5 C13.5 17 15 19.5 16 22" />
      {/* Radius (parallel) */}
      <path d="M15 11.5 C16 14 17 17.5 18 22" />
    </Svg>
  );
}

/** Kyçi — wrist (front/palmar view): radius + ulna + carpal block + fingers */
export function IconKyci({ className, size }: IconProps) {
  return (
    <Svg size={size} className={className}>
      {/* Radius */}
      <line x1="10" y1="2" x2="10" y2="9" />
      {/* Ulna */}
      <line x1="14" y1="2" x2="14" y2="9" />
      {/* Wrist joint line */}
      <line x1="8.5" y1="9" x2="15.5" y2="9" />
      {/* Carpal block */}
      <rect x="8.5" y="9" width="7" height="3.5" rx="1" />
      {/* Finger rays */}
      <line x1="9.5"  y1="12.5" x2="9"  y2="17"   />
      <line x1="11.5" y1="12.5" x2="11" y2="18.5"  />
      <line x1="13"   y1="12.5" x2="13" y2="18.5"  />
      <line x1="14.5" y1="12.5" x2="15" y2="17"    />
    </Svg>
  );
}

/** Kërdhokulla — pelvis/hip (front view): iliac wings + acetabula + pubic arch */
export function IconKerdhokulla({ className, size }: IconProps) {
  return (
    <Svg size={size} className={className}>
      {/* Left iliac wing */}
      <path d="M2 7 C3 4 7 2 10.5 4 C12 5 12 8 12 10" />
      {/* Right iliac wing */}
      <path d="M22 7 C21 4 17 2 13.5 4 C12 5 12 8 12 10" />
      {/* Sacrum body */}
      <path d="M10 10 C10 13.5 11 16 12 17 C13 16 14 13.5 14 10" />
      {/* Left acetabulum (hip socket) */}
      <circle cx="6.5" cy="15.5" r="2.5" />
      {/* Right acetabulum */}
      <circle cx="17.5" cy="15.5" r="2.5" />
      {/* Pubic arch */}
      <path d="M8 19 C9.5 21.5 14.5 21.5 16 19" />
    </Svg>
  );
}

/** Gjuri — knee (front view): femoral shafts + condyle arc + patella + tibia/fibula */
export function IconGjuri({ className, size }: IconProps) {
  return (
    <Svg size={size} className={className}>
      {/* Femoral shafts */}
      <line x1="9"  y1="2" x2="9"  y2="11" />
      <line x1="15" y1="2" x2="15" y2="11" />
      {/* Femoral condyle arc */}
      <path d="M9 11 Q12 14 15 11" />
      {/* Patella */}
      <ellipse cx="12" cy="11.5" rx="2.5" ry="2" />
      {/* Tibial plateau */}
      <line x1="8" y1="15" x2="16" y2="15" />
      {/* Tibia + fibula */}
      <line x1="10"  y1="15" x2="9.5"  y2="23" />
      <line x1="14"  y1="15" x2="14.5" y2="23" />
    </Svg>
  );
}

/** Shputa — foot (lateral view): ankle + dorsum + heel + plantar arch */
export function IconShputa({ className, size }: IconProps) {
  return (
    <Svg size={size} className={className}>
      {/* Tibia / lower leg entering from top */}
      <line x1="14" y1="2" x2="12" y2="9" />
      {/* Lateral malleolus (ankle bone) */}
      <circle cx="11.5" cy="10" r="1" />
      {/* Foot outline — one continuous path:
          from ankle → dorsum → toes → plantar (sole, showing arch) → heel → back */}
      <path d="
        M12 9
        C14 11 17 14 18 17
        C18.5 19 17.5 21 16 22
        C13 23 9 23 6.5 22
        C5 21.5 4 20.5 4 19
        C4 17 5.5 16 7 17
        C8.5 18 9 16 9.5 14
        C10 12 11 10 12 9
      " />
    </Svg>
  );
}
