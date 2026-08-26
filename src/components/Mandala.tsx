export default function Mandala({ className = '', color = '#c9a24a' }: { className?: string; color?: string }) {
  const petals = Array.from({ length: 16 });
  const outer = Array.from({ length: 24 });
  return (
    <svg viewBox="0 0 200 200" className={className} xmlns="http://www.w3.org/2000/svg">
      <g fill="none" stroke={color} strokeWidth="0.7">
        {/* concentric rings */}
        <circle cx="100" cy="100" r="97" />
        <circle cx="100" cy="100" r="88" strokeWidth="0.4" />
        <circle cx="100" cy="100" r="70" />
        <circle cx="100" cy="100" r="46" />
        <circle cx="100" cy="100" r="24" />
        <circle cx="100" cy="100" r="9" strokeWidth="0.5" />

        {/* outer dotted ring of seeds */}
        {outer.map((_, i) => {
          const a = (i * 360) / outer.length;
          return (
            <g key={`o-${i}`} transform={`rotate(${a} 100 100)`}>
              <circle cx="100" cy="8" r="1.1" fill={color} stroke="none" opacity="0.7" />
            </g>
          );
        })}

        {/* lotus petals */}
        {petals.map((_, i) => {
          const a = (i * 360) / petals.length;
          return (
            <g key={i} transform={`rotate(${a} 100 100)`}>
              <path d="M100 14 C116 44 116 66 100 90 C84 66 84 44 100 14 Z" />
              <path d="M100 28 C109 48 109 62 100 80 C91 62 91 48 100 28 Z" strokeWidth="0.45" />
              <line x1="100" y1="100" x2="100" y2="6" strokeWidth="0.25" opacity="0.45" />
            </g>
          );
        })}

        {/* interleaved inner petals */}
        {petals.map((_, i) => {
          const a = (i * 360) / petals.length + 360 / (petals.length * 2);
          return (
            <path
              key={`inner-${i}`}
              transform={`rotate(${a} 100 100)`}
              d="M100 50 C107 64 107 74 100 86 C93 74 93 64 100 50 Z"
              strokeWidth="0.45"
            />
          );
        })}

        {/* central bindu star */}
        {Array.from({ length: 8 }).map((_, i) => (
          <line
            key={`c-${i}`}
            transform={`rotate(${i * 45} 100 100)`}
            x1="100" y1="100" x2="100" y2="76" strokeWidth="0.4" opacity="0.6"
          />
        ))}
      </g>
    </svg>
  );
}
