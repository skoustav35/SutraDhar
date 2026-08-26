import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Gauge, Crown, Check, ChevronDown } from 'lucide-react';
import type { Mode } from '../lib/types';
import { MODES } from '../lib/types';

const MODE_ICON: Record<Mode, React.ReactNode> = {
  direct: <Zap size={15} />,
  trio: <Gauge size={15} />,
  council: <Crown size={15} />,
};

const TIER: Record<Mode, string> = {
  direct: 'Fastest',
  trio: 'Flagship',
  council: 'Deepest',
};

export default function ModelSelector({
  mode,
  onModeChange,
  disabled,
}: {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const active = MODES[mode];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="model-trigger group flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-xl border transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="model-trigger-icon shrink-0 w-7 h-7 rounded-lg flex items-center justify-center">
          {MODE_ICON[mode]}
        </span>
        <span className="min-w-0 text-left leading-tight">
          <span className="model-trigger-label block text-[13px] font-semibold truncate max-w-[9rem] sm:max-w-[12rem]">
            {active.label}
          </span>
          <span className="model-trigger-tier hidden sm:block text-[10px] uppercase tracking-[0.15em]">{TIER[mode]}</span>
        </span>
        <ChevronDown size={15} className={`model-trigger-chev shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            role="listbox"
            className="model-menu absolute left-0 top-[calc(100%+8px)] z-50 w-[min(90vw,20rem)] rounded-2xl overflow-hidden"
          >
            <div className="model-menu-head px-3.5 py-2.5">
              <span className="text-[10px] uppercase tracking-[0.28em] model-menu-eyebrow">Choose a model</span>
            </div>
            <div className="p-1.5 space-y-1">
              {(Object.keys(MODES) as Mode[]).map((k) => {
                const cfg = MODES[k];
                const isActive = mode === k;
                return (
                  <button
                    key={k}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      onModeChange(k);
                      setOpen(false);
                    }}
                    className={`model-option group w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                      isActive ? 'model-option--active' : ''
                    }`}
                  >
                    <span className="model-option-icon shrink-0 w-9 h-9 rounded-xl flex items-center justify-center mt-0.5">
                      {MODE_ICON[k]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="model-option-label text-[13.5px] font-semibold">{cfg.label}</span>
                        <span className="model-option-badge text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-full">{TIER[k]}</span>
                      </span>
                      <span className="model-option-desc block text-[11.5px] leading-snug mt-1">{cfg.desc}</span>
                    </span>
                    {isActive && <Check size={16} className="model-option-check shrink-0 mt-1.5" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
