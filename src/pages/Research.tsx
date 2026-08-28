import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Zap, Gauge, Crown, BrainCircuit, ShieldCheck, Infinity as InfinityIcon, Clock, Sparkles, Sun, Moon, Layers } from 'lucide-react';
import Mandala from '../components/Mandala';
import { useTheme } from '../contexts/ThemeContext';

const MODELS = [
  {
    icon: <Zap size={20} />,
    name: 'Sutradhar 6.7 Lite',
    mode: 'sutradhar-6.7-lite',
    scale: 'Efficient class',
    tagline: 'Fast, capable everyday reasoning',
    body: 'A compact yet powerful large language model tuned for low latency. Lite delivers crisp, accurate answers for everyday questions and general reasoning with minimal wait.',
  },
  {
    icon: <Gauge size={20} />,
    name: 'Sutradhar 6.7 Ultra',
    mode: 'sutradhar-6.7-ultra',
    scale: 'Flagship class',
    tagline: 'High-accuracy deep reasoning',
    body: 'Our flagship large language model. Ultra applies substantially deeper reasoning and self-verification to hard, multi-step problems, delivering rigorous, well-structured answers with high reliability.',
  },
  {
    icon: <Crown size={20} />,
    name: 'Sutradhar 6.7 Extreme',
    mode: 'sutradhar-6.7-extreme',
    scale: 'Frontier class',
    tagline: 'Maximum reasoning depth',
    body: 'Our most capable large language model. Extreme is engineered for the very hardest challenges, sustaining extended, exhaustive reasoning to reach correct answers where other models fall short.',
  },
];

const CAPABILITIES = [
  { icon: <BrainCircuit size={18} />, title: 'Proprietary reasoning design', body: 'Every Sutradhar model is built on an in-house training and reasoning methodology developed by our team \u2014 a bespoke architecture engineered specifically for rigorous, verifiable problem solving.' },
  { icon: <ShieldCheck size={18} />, title: 'Self-verifying answers', body: 'Sutradhar models are trained to check their own work as they reason, catching errors before committing to a final answer \u2014 a discipline that yields markedly higher accuracy on hard problems.' },
  { icon: <InfinityIcon size={18} />, title: 'Full 200k context', body: 'Each model reasons over the full ~200,000-token context window per request, handling long problems and extended multi-turn conversations in their entirety.' },
  { icon: <Clock size={18} />, title: 'Deep-time reasoning', body: 'On the hardest problems a model may reason for many minutes. Requests execute reliably in the background, so a completed answer is waiting even if you step away.' },
];

export default function Research() {
  const { theme, toggle } = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const [, setT] = useState(0);
  useEffect(() => setT(1), []);

  return (
    <div ref={scrollRef} className="min-h-screen bg-[#121212] text-[#ece5d8] relative overflow-x-hidden grain">
      <div className="pointer-events-none fixed inset-0 z-0"><div className="ambient-bg" /></div>
      <div className="pointer-events-none fixed -top-28 -right-24 opacity-[0.05] z-0"><Mandala className="w-[460px] h-[460px] animate-spin-slow" color="#ff9933" /></div>
      <div className="pointer-events-none fixed -bottom-32 -left-28 opacity-[0.04] z-0"><Mandala className="w-[420px] h-[420px] animate-spin-slow-rev" color="#c9a24a" /></div>

      {/* nav */}
      <nav className="sticky top-0 z-30 glass-strong border-b border-[#b87333]/12">
        <div className="max-w-5xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-[#c9a24a] hover:text-[#ff9933] transition-colors text-sm">
            <ArrowLeft size={16} /> Home
          </Link>
          <div className="flex items-center gap-2.5">
            <Mandala className="w-6 h-6" color="#ff9933" />
            <span className="font-display text-lg text-gradient-gold">Sutradhar Research</span>
          </div>
          <button
            onClick={toggle}
            className="w-9 h-9 rounded-xl border border-[#b87333]/25 flex items-center justify-center text-[#c9a24a] hover:text-[#ff9933] hover:border-[#ff9933]/30 transition-all"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </nav>

      <div className="relative z-10 max-w-5xl mx-auto px-5 py-14">
        {/* hero */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-[12px] tracking-[0.2em] uppercase text-[#c9a24a] mb-5">
            The Sutradhar 6.7 Family
          </div>
          <h1 className="font-display text-5xl sm:text-6xl text-gradient-gold leading-[1]">Language models, exceptionally designed</h1>
          <p className="text-[#a99a7c] max-w-2xl mx-auto mt-5 text-lg">
            Sutradhar 6.7 is a family of large language models built on a proprietary reasoning architecture developed
            in-house. Three models span efficient to frontier capability \u2014 each a single, self-contained model tuned for
            correctness, clarity, and depth.
          </p>
        </motion.div>

        {/* models */}
        <h2 className="font-display text-3xl text-gradient-gold mb-5">The Model Family</h2>
        <div className="grid md:grid-cols-3 gap-4 mb-16">
          {MODELS.map((m, i) => (
            <motion.div
              key={m.name}
              initial={{ opacity: 0, y: 26 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.55, delay: i * 0.08 }}
              className="glass rounded-3xl p-6 flex flex-col"
            >
              <div className="w-12 h-12 rounded-2xl bg-[#b87333]/15 border border-[#b87333]/30 flex items-center justify-center text-[#c26a12] dark:text-[#ff9933] mb-4">{m.icon}</div>
              <div className="font-display text-2xl text-[#9a5a12] dark:text-[#ffd89b]">{m.name}</div>
              <code className="text-[11px] text-[#c9a24a] mt-1">model: "{m.mode}"</code>
              <div className="text-[12px] uppercase tracking-widest text-[#a99a7c] mt-3">{m.scale}</div>
              <p className="text-[13.5px] text-[#7a6746] dark:text-[#a99a7c] mt-2 leading-relaxed flex-1">{m.body}</p>
              <div className="mt-4 text-[12px] text-[#c26a12] dark:text-[#ffce8a] font-medium">{m.tagline}</div>
            </motion.div>
          ))}
        </div>

        {/* how they reason */}
        <h2 className="font-display text-3xl text-gradient-gold mb-2">How Sutradhar reasons</h2>
        <p className="text-[#a99a7c] mb-6 max-w-2xl">Every Sutradhar model follows the same disciplined internal reasoning process, scaled up with each tier for deeper, more thorough thinking.</p>
        <div className="grid md:grid-cols-3 gap-4 mb-16">
          {[
            { icon: <Layers size={18} />, title: 'Structured reasoning', body: 'The model decomposes each problem, works through it step by step, and organises its thinking so the path to the answer is transparent and rigorous.' },
            { icon: <ShieldCheck size={18} />, title: 'Built-in verification', body: 'As it reasons, the model tests its own intermediate results and revisits weak steps, correcting mistakes before they reach the final answer.' },
            { icon: <Sparkles size={18} />, title: 'Clear answers', body: 'Finally the model composes one authoritative, well-formatted response \u2014 complete working, then a clearly stated result.' },
          ].map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="glass rounded-3xl p-6"
            >
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#ff9933] to-[#b87333] flex items-center justify-center text-[#1a1207] shadow-[0_0_16px_-4px_rgba(255,153,51,0.6)] mb-3">{p.icon}</div>
              <div className="font-display text-xl text-[#9a5a12] dark:text-[#ffd89b] mb-1.5">{p.title}</div>
              <p className="text-[13.5px] text-[#7a6746] dark:text-[#a99a7c] leading-relaxed">{p.body}</p>
            </motion.div>
          ))}
        </div>

        {/* capabilities */}
        <h2 className="font-display text-3xl text-gradient-gold mb-6">What sets Sutradhar apart</h2>
        <div className="grid sm:grid-cols-2 gap-4 mb-16">
          {CAPABILITIES.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className="glass rounded-2xl p-5 flex gap-4"
            >
              <div className="shrink-0 w-10 h-10 rounded-xl bg-[#b87333]/15 border border-[#b87333]/30 flex items-center justify-center text-[#c26a12] dark:text-[#ff9933]">{p.icon}</div>
              <div>
                <div className="font-display text-lg text-[#9a5a12] dark:text-[#ffd89b]">{p.title}</div>
                <p className="text-[13.5px] text-[#7a6746] dark:text-[#a99a7c] mt-1 leading-relaxed">{p.body}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* specs table */}
        <h2 className="font-display text-3xl text-gradient-gold mb-6">Model Specifications</h2>
        <div className="glass rounded-3xl p-5 sm:p-6 overflow-x-auto mb-16">
          <table className="w-full text-[13px] border-collapse min-w-[520px]">
            <thead>
              <tr className="text-left text-[#c9a24a]">
                <th className="py-2 pr-4">Specification</th>
                <th className="py-2 pr-4">6.7 Lite</th>
                <th className="py-2 pr-4">6.7 Ultra</th>
                <th className="py-2">6.7 Extreme</th>
              </tr>
            </thead>
            <tbody className="text-[#5a4a30] dark:text-[#c9bfa8]">
              {[
                ['Class', 'Efficient', 'Flagship', 'Frontier'],
                ['Relative reasoning depth', 'Standard', 'Deep', 'Maximum'],
                ['Self-verification', 'Yes', 'Yes', 'Yes (extended)'],
                ['Context window', '~200k tokens', '~200k tokens', '~200k tokens'],
                ['Max output', '64k tokens', '64k tokens', '64k tokens'],
                ['Typical latency', 'Lowest', 'Moderate', 'Highest'],
                ['Max thinking time', '~13 min', '~13 min', '~13 min'],
                ['Streaming + background runs', 'Yes', 'Yes', 'Yes'],
              ].map((row) => (
                <tr key={row[0]} className="border-t border-[#b87333]/15">
                  <td className="py-2 pr-4 text-[#9a5a12] dark:text-[#ffd89b] font-medium">{row[0]}</td>
                  <td className="py-2 pr-4">{row[1]}</td>
                  <td className="py-2 pr-4">{row[2]}</td>
                  <td className="py-2">{row[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* cta */}
        <div className="glass-strong rounded-3xl p-8 text-center relative overflow-hidden">
          <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 opacity-[0.06]"><Mandala className="w-[420px] h-[420px] animate-spin-slow" color="#ff9933" /></div>
          <div className="relative">
            <h3 className="font-display text-3xl text-gradient-gold mb-3">Build with Sutradhar</h3>
            <p className="text-[#a99a7c] max-w-xl mx-auto mb-6">Call the Sutradhar 6.7 family from your own code with a single API key. Choose the model that fits your task \u2014 Lite, Ultra, or Extreme.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/app/api" className="inline-flex items-center gap-2 px-7 py-3 rounded-xl bg-gradient-to-br from-[#ff9933] to-[#b87333] text-[#1a1207] font-semibold hover:brightness-110 hover:saffron-glow transition-all">
                API Docs & Keys <ArrowRight size={17} />
              </Link>
              <Link to="/app" className="px-7 py-3 rounded-xl glass text-[#9a5a12] dark:text-[#ffd89b] hover:border-[#ff9933]/40 transition-all">
                Open the App
              </Link>
            </div>
          </div>
        </div>

        <footer className="border-t border-[#b87333]/12 mt-16 pt-8 text-center text-[13px] text-[#877552] dark:text-[#6b6250]">
          Sutradhar 6.7 \u2014 Large language models, exceptionally designed \u00b7 Crafted with saffron & silicon
        </footer>
      </div>
    </div>
  );
}
