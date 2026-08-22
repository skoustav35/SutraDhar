export default function Mandala({ className = '', color = '#c9a24a' }: { className?: string; color?: string }) {
  const petals = Array.from({ length: 12 });
  return (
    <svg viewBox="0 0 200 200" className={className} xmlns="http://www.w3.org/2000/svg">
      <g fill="none" stroke={color} strokeWidth="0.8">
        <circle cx="100" cy="100" r="96" />
        <circle cx="100" cy="100" r="78" />
        <circle cx="100" cy="100" r="52" />
        <circle cx="100" cy="100" r="26" />
        {petals.map((_, i) => {
          const a = (i * 360) / petals.length;
          return (
            <g key={i} transform={`rotate(${a} 100 100)`}>
              <path d="M100 12 C118 44 118 66 100 92 C82 66 82 44 100 12 Z" />
              <path d="M100 26 C110 48 110 62 100 80 C90 62 90 48 100 26 Z" strokeWidth="0.5" />
              <line x1="100" y1="100" x2="100" y2="4" strokeWidth="0.3" opacity="0.5" />
            </g>
          );
        })}
        {petals.map((_, i) => {
          const a = (i * 360) / petals.length + 15;
          return (
            <path
              key={`inner-${i}`}
              transform={`rotate(${a} 100 100)`}
              d="M100 48 C108 64 108 74 100 88 C92 74 92 64 100 48 Z"
              strokeWidth="0.5"
            />
          );
        })}
      </g>
    </svg>
  );
}
