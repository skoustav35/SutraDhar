import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Brain, Lock, Sparkles, Zap, Users, Mail, ArrowRight, X, Loader2, Crown, Terminal, KeyRound, Sun, Moon, FlaskConical } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import supabase from '../lib/supabase';
import { signInWithGoogle } from '../lib/googleAuth';
import Mandala from '../components/Mandala';

function AuthModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!email || !password) return setError('Enter your email and a password.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        const { error: e2 } = await supabase.auth.signInWithPassword({ email, password });
        if (e2) {
          setNotice('Account created. Check your email to confirm, then sign in.');
          setMode('signin');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.94, y: 16, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.94, opacity: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md glass-strong rounded-3xl p-7 saffron-glow"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-[#8a7d60] hover:text-[#ff9933]">
          <X size={18} />
        </button>
        <div className="flex justify-center mb-4">
          <Mandala className="w-14 h-14 animate-spin-slow opacity-80" color="#ff9933" />
        </div>
        <h2 className="text-center font-display text-3xl text-gradient-gold">
          {mode === 'signin' ? 'Enter the Council' : 'Join the Council'}
        </h2>
        <p className="text-center text-[13px] text-[#a99a7c] mt-1 mb-6">Your conversations, kept in sacred memory.</p>

        <button
          onClick={() => signInWithGoogle('The Council')}
          className="w-full flex items-center justify-center gap-3 py-3 rounded-xl bg-[#f5efe2] text-[#2a2118] font-medium hover:brightness-105 transition-all mb-4"
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
          Continue with Google
        </button>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-[#b87333]/20" />
          <span className="text-[11px] uppercase tracking-widest text-[#8a7d60]">or</span>
          <div className="flex-1 h-px bg-[#b87333]/20" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="relative">
            <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a7d60]" />
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-10 pr-3 py-3 rounded-xl bg-[#1a1510] border border-[#b87333]/25 text-[#ece5d8] placeholder:text-[#6b6250] focus:outline-none focus:border-[#ff9933]/50"
            />
          </div>
          <div className="relative">
            <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a7d60]" />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 pr-3 py-3 rounded-xl bg-[#1a1510] border border-[#b87333]/25 text-[#ece5d8] placeholder:text-[#6b6250] focus:outline-none focus:border-[#ff9933]/50"
            />
          </div>
          {error && <p className="text-[13px] text-red-400">{error}</p>}
          {notice && <p className="text-[13px] text-[#7bbfa0]">{notice}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-br from-[#ff9933] to-[#b87333] text-[#1a1207] font-semibold hover:brightness-110 transition-all disabled:opacity-60"
          >
            {loading ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />}
            {mode === 'signin' ? 'Continue with Email' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-[13px] text-[#a99a7c] mt-5">
          {mode === 'signin' ? "New seeker?" : 'Already initiated?'}{' '}
          <button
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError('');
              setNotice('');
            }}
            className="text-[#ff9933] hover:underline font-medium"
          >
            {mode === 'signin' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
        <p className="text-center text-[11px] text-[#6b6250] mt-3">Demo: demo@council.ai / password123</p>
      </motion.div>
    </motion.div>
  );
}

function ReactiveYantra() {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [12, -12]), { damping: 20, stiffness: 120 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-12, 12]), { damping: 20, stiffness: 120 });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      mx.set(e.clientX / w - 0.5);
      my.set(e.clientY / h - 0.5);
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, [mx, my]);

  return (
    <div ref={ref} className="relative flex items-center justify-center" style={{ perspective: 1000 }}>
      <motion.div style={{ rotateX: rx, rotateY: ry }} className="relative">
        <div className="absolute inset-0 blur-3xl rounded-full bg-[#ff9933]/20 animate-breathe" />
        <Mandala className="w-72 h-72 sm:w-96 sm:h-96 animate-spin-slow relative" color="#ff9933" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Mandala className="w-44 h-44 sm:w-56 sm:h-56 animate-spin-slow-rev" color="#c9a24a" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#ffd89b] to-[#ff9933] blur-md opacity-70 animate-breathe" />
        </div>
      </motion.div>
    </div>
  );
}

export default function Landing() {
  const [showAuth, setShowAuth] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const heroBg = useMotionValue(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => heroBg.set(el.scrollTop);
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [heroBg]);

  const parallax = useTransform(heroBg, [0, 600], [0, -120]);
  const fade = useTransform(heroBg, [0, 400], [1, 0]);

  const features = [
    { icon: <Users size={22} />, title: 'Exceptionally Designed', desc: 'The Sutradhar 6.7 family of large language models is built on a proprietary reasoning architecture, engineered in-house for rigorous, verifiable answers.', span: 'sm:col-span-2' },
    { icon: <Lock size={22} />, title: 'Secure Memory', desc: 'Every conversation is saved to persistent, encrypted storage. Leave and return to resume any chat exactly where you left off.', span: '' },
    { icon: <Brain size={22} />, title: 'Max-Thinking Logic', desc: 'Each model reasons at maximum depth, self-verifying its work and exposing its live chain of thought as it thinks.', span: '' },
    { icon: <Zap size={22} />, title: 'Live Reasoning', desc: 'Watch the model reason token-by-token in real time, then deliver one clear, authoritative final answer.', span: 'sm:col-span-2' },
  ];

  return (
    <div ref={scrollRef} className="h-screen overflow-y-auto bg-[#121212] text-[#ece5d8]">
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}

      {/* ambient bg */}
      <div className="pointer-events-none fixed inset-0 z-0"><div className="ambient-bg" /></div>

      {/* nav */}
      <nav className="sticky top-0 z-30 glass-strong border-b border-[#b87333]/12">
        <div className="max-w-6xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Mandala className="w-7 h-7" color="#ff9933" />
            <span className="font-display text-xl text-gradient-gold">The Council</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/research"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] text-[#c9a24a] hover:text-[#ff9933] transition-all"
            >
              <FlaskConical size={15} /> Research
            </Link>
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
              className="w-9 h-9 rounded-xl border border-[#b87333]/25 flex items-center justify-center text-[#c9a24a] hover:text-[#ff9933] hover:border-[#ff9933]/30 transition-all"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              onClick={() => setShowAuth(true)}
              className="px-5 py-2 rounded-xl border border-[#ff9933]/40 text-[#ffd89b] text-sm hover:bg-[#ff9933]/10 hover:saffron-glow transition-all"
            >
              Enter
            </button>
          </div>
        </div>
      </nav>

      {/* hero */}
      <section className="relative z-10 min-h-[88vh] flex flex-col items-center justify-center px-5 text-center">
        <motion.div style={{ y: parallax, opacity: fade }} className="mb-8">
          <ReactiveYantra />
        </motion.div>
        <motion.div style={{ opacity: fade }} className="relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-[12px] tracking-[0.2em] uppercase text-[#c9a24a] mb-6"
          >
            <Sparkles size={13} /> An ancient council, a futuristic mind
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.1 }}
            className="font-display text-6xl sm:text-8xl leading-[0.95] text-gradient-gold"
          >
            The Council Awaits
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.25 }}
            className="mt-6 text-lg sm:text-xl text-[#c9bfa8] max-w-xl mx-auto"
          >
            Large language models, exceptionally designed. Deep reasoning; one clear answer.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.4 }}
            className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <button
              onClick={() => setShowAuth(true)}
              className="group flex items-center gap-2 px-7 py-3.5 rounded-xl bg-gradient-to-br from-[#ff9933] to-[#b87333] text-[#1a1207] font-semibold hover:brightness-110 hover:saffron-glow transition-all"
            >
              Convene the Council
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => setShowAuth(true)}
              className="px-7 py-3.5 rounded-xl glass text-[#ffd89b] hover:border-[#ff9933]/40 transition-all"
            >
              Sign in with Email
            </button>
          </motion.div>
        </motion.div>
      </section>

      {/* features */}
      <section className="relative z-10 max-w-6xl mx-auto px-5 py-24">
        <div className="text-center mb-14">
          <p className="text-[12px] tracking-[0.3em] uppercase text-[#c9a24a] mb-3">The Craft</p>
          <h2 className="font-display text-4xl sm:text-5xl text-gradient-gold">Crafted to Reason Deeply</h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.6, delay: i * 0.08 }}
              className={`glass rounded-3xl p-7 hover:border-[#ff9933]/30 transition-all group ${f.span}`}
            >
              <div className="w-12 h-12 rounded-2xl bg-[#b87333]/15 border border-[#b87333]/30 flex items-center justify-center text-[#ff9933] mb-5 group-hover:saffron-glow transition-all">
                {f.icon}
              </div>
              <h3 className="font-display text-2xl text-[#ffd89b] mb-2">{f.title}</h3>
              <p className="text-[#a99a7c] leading-relaxed text-[15px]">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* what sutradhar masters */}
      <section className="relative z-10 max-w-5xl mx-auto px-5 pb-24">
        <div className="glass-strong rounded-3xl p-8 sm:p-12 text-center relative overflow-hidden">
          <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 opacity-[0.06]">
            <Mandala className="w-[500px] h-[500px] animate-spin-slow" color="#ff9933" />
          </div>
          <div className="relative">
            <h2 className="font-display text-4xl text-gradient-gold mb-8">Built to reason deeply</h2>
            <div className="grid sm:grid-cols-3 gap-6 mb-10">
              {[
                { n: 'Rigorous Logic', t: 'Airtight reasoning', d: 'Works through problems step by step with mathematical precision.' },
                { n: 'Structural Mastery', t: 'Math & structure', d: 'Decomposes complex problems and tracks every constraint.' },
                { n: 'Self-Verification', t: 'Checks its work', d: 'Stress-tests each step and corrects errors before answering.' },
              ].map((s) => (
                <div key={s.n} className="glass rounded-2xl p-6">
                  <div className="font-display text-2xl text-[#ffd89b]">{s.n}</div>
                  <div className="text-[12px] uppercase tracking-widest text-[#c9a24a] mt-1">{s.t}</div>
                  <p className="text-[13px] text-[#a99a7c] mt-3">{s.d}</p>
                </div>
              ))}
            </div>
            <p className="text-[#a99a7c] mb-6">
              Every <span className="text-[#ffd89b] font-display text-xl">Sutradhar 6.7</span> model unites these strengths,
              reasoning at maximum depth to resolve each question into a single, luminous answer.
            </p>
            <button
              onClick={() => setShowAuth(true)}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-br from-[#ff9933] to-[#b87333] text-[#1a1207] font-semibold hover:brightness-110 hover:saffron-glow transition-all"
            >
              Start Reasoning <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* Modes + Developer API */}
      <section id="api" className="relative z-10 max-w-6xl mx-auto px-5 pb-24">
        <div className="text-center mb-12">
          <p className="text-[12px] tracking-[0.3em] uppercase text-[#c9a24a] mb-3">The Sutradhar 6.7 Family</p>
          <h2 className="font-display text-4xl sm:text-5xl text-gradient-gold">Choose Your Model</h2>
          <p className="text-[#a99a7c] max-w-xl mx-auto mt-4">
            Three distinct large language models spanning efficient to frontier capability — each exceptionally
            designed for deep, accurate reasoning. <Link to="/research" className="text-[#ff9933] hover:underline">Learn more →</Link>
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mb-14">
          {[
            { icon: <Zap size={22} />, name: 'Sutradhar 6.7 Lite', tag: 'sutradhar-6.7-lite', d: 'A fast, efficient large language model for everyday questions and general reasoning.' },
            { icon: <Users size={22} />, name: 'Sutradhar 6.7 Ultra', tag: 'sutradhar-6.7-ultra', d: 'Our flagship model — deep, high-accuracy reasoning with self-verification for hard problems.' },
            { icon: <Crown size={22} />, name: 'Sutradhar 6.7 Extreme', tag: 'sutradhar-6.7-extreme', d: 'Our most capable model — maximum reasoning depth for the very hardest challenges.' },
          ].map((m, i) => (
            <motion.div
              key={m.name}
              initial={{ opacity: 0, y: 26 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.6, delay: i * 0.08 }}
              className="glass rounded-3xl p-6 hover:border-[#ff9933]/30 transition-all"
            >
              <div className="w-12 h-12 rounded-2xl bg-[#b87333]/15 border border-[#b87333]/30 flex items-center justify-center text-[#ff9933] mb-4">{m.icon}</div>
              <h3 className="font-display text-2xl text-[#ffd89b]">{m.name}</h3>
              <code className="text-[11px] text-[#c9a24a]">{m.tag}</code>
              <p className="text-[#a99a7c] leading-relaxed text-[14px] mt-2">{m.d}</p>
            </motion.div>
          ))}
        </div>

        <div className="glass-strong rounded-3xl p-8 sm:p-10 relative overflow-hidden">
          <div className="pointer-events-none absolute -bottom-24 -right-16 opacity-[0.05]"><Mandala className="w-80 h-80 animate-spin-slow-rev" color="#ff9933" /></div>
          <div className="relative grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-[11px] tracking-[0.2em] uppercase text-[#c9a24a] mb-4">
                <Terminal size={13} /> Developer API
              </div>
              <h3 className="font-display text-3xl text-gradient-gold mb-3">Call Sutradhar from your code</h3>
              <p className="text-[#a99a7c] mb-5">
                Generate an API key inside the app, then POST your prompt to any Sutradhar 6.7 model. Receive a
                complete, well-structured answer — with an optional live progress stream. No rate limits.
              </p>
              <ul className="space-y-2 text-[14px] text-[#c9bfa8] mb-6">
                <li className="flex items-center gap-2"><KeyRound size={15} className="text-[#ff9933]" /> Secure per-user API keys</li>
                <li className="flex items-center gap-2"><Sparkles size={15} className="text-[#ff9933]" /> Three models: Lite, Ultra, Extreme</li>
                <li className="flex items-center gap-2"><Zap size={15} className="text-[#ff9933]" /> Streaming progress events</li>
              </ul>
              <button
                onClick={() => setShowAuth(true)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-br from-[#ff9933] to-[#b87333] text-[#1a1207] font-semibold hover:brightness-110 hover:saffron-glow transition-all"
              >
                Get your API key <ArrowRight size={17} />
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden border border-[#b87333]/25 bg-[#0f0d0a]">
              <div className="px-4 py-2 bg-gradient-to-r from-[#2a2118] to-[#1a1510] border-b border-[#b87333]/20 text-[11px] uppercase tracking-[0.2em] text-[#c9a24a]">
                POST /api/v1
              </div>
              <pre className="p-4 overflow-x-auto text-[12.5px] leading-relaxed text-[#e6ddcc]"><code>{`curl -X POST https://your-app/api/v1 \\
  -H "Authorization: Bearer sk-council-..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "Find all integer (x,y): x^2+y^2=2024",
    "model": "sutradhar-6.7-extreme",
    "stream": false
  }'

# => { "answer": "...", "model": "Sutradhar 6.7 Extreme" }`}</code></pre>

            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-[#b87333]/12 py-8 text-center text-[13px] text-[#6b6250]">
        <div className="flex items-center justify-center gap-4 mb-3">
          <Link to="/research" className="text-[#c9a24a] hover:text-[#ff9933] transition-colors">Research</Link>
          <span className="text-[#b87333]/40">·</span>
          <button onClick={() => setShowAuth(true)} className="text-[#c9a24a] hover:text-[#ff9933] transition-colors">API & Keys</button>
        </div>
        The Council — Powered by Sutradhar 6.7 · Crafted with saffron & silicon
      </footer>
    </div>
  );
}
