import { useState } from 'react';
import { motion } from 'framer-motion';
import { HelpCircle, Send, Check } from 'lucide-react';

export interface AskSpec {
  question: string;
  options?: string[];
  allowMultiple?: boolean;
  allowManual?: boolean;
}

export default function AskCard({ spec, onAnswer, disabled }: { spec: AskSpec; onAnswer: (a: string) => void; disabled?: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [manual, setManual] = useState('');
  const [answered, setAnswered] = useState<string | null>(null);

  const multi = spec.allowMultiple;
  const toggle = (opt: string) => {
    if (answered) return;
    if (multi) setSelected((s) => (s.includes(opt) ? s.filter((x) => x !== opt) : [...s, opt]));
    else { setAnswered(opt); onAnswer(opt); }
  };
  const submitMulti = () => {
    const val = selected.join(', ');
    if (!val) return;
    setAnswered(val);
    onAnswer(val);
  };
  const submitManual = () => {
    if (!manual.trim()) return;
    setAnswered(manual.trim());
    onAnswer(manual.trim());
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="ask-card rounded-2xl p-4 my-2">
      <div className="flex items-start gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-lg bg-[#1e6e50]/15 text-[#1e6e50] dark:text-[#8fd4b4] flex items-center justify-center shrink-0">
          <HelpCircle size={16} />
        </div>
        <p className="text-[14px] text-[#5a4a2e] dark:text-[#ece5d8] font-medium pt-1">{spec.question}</p>
      </div>

      {spec.options && spec.options.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 pl-10">
          {spec.options.map((opt) => {
            const on = multi ? selected.includes(opt) : answered === opt;
            return (
              <button
                key={opt}
                onClick={() => toggle(opt)}
                disabled={disabled || (!!answered && !multi)}
                className={`ask-option text-[13px] px-3 py-2 rounded-xl border transition-all ${on ? 'ask-option--on' : ''} ${answered && !on ? 'opacity-40' : ''}`}
              >
                {on && <Check size={12} className="inline mr-1" />}{opt}
              </button>
            );
          })}
        </div>
      )}

      {multi && !answered && selected.length > 0 && (
        <div className="pl-10 mb-2">
          <button onClick={submitMulti} className="btn-jade px-3.5 py-1.5 rounded-lg text-[12px] font-medium">Confirm selection</button>
        </div>
      )}

      {(spec.allowManual !== false) && !answered && (
        <div className="pl-10 flex gap-2 mt-1">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitManual()}
            placeholder="Or type your own answer…"
            disabled={disabled}
            className="ayur-input flex-1 px-3 py-2 rounded-xl text-[13px]"
          />
          <button onClick={submitManual} disabled={!manual.trim()} className="btn-saffron px-3 py-2 rounded-xl disabled:opacity-40"><Send size={14} /></button>
        </div>
      )}

      {answered && (
        <div className="pl-10 text-[12.5px] text-[#1e6e50] dark:text-[#8fd4b4] flex items-center gap-1.5">
          <Check size={13} /> You answered: <span className="font-medium">{answered}</span>
        </div>
      )}
    </motion.div>
  );
}
