import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Sun, Moon, Loader2, AlertTriangle, List, X, Clock,
  FileText, Compass, TrendingUp, Layers, Focus, GitBranch, Waypoints, Type,
  Infinity as InfinityIcon, FastForward, Database, Settings, Target, Server,
  Grid3x3, Zap, ClipboardCheck, ShieldCheck, Building2, Calculator, Rocket,
  Hammer, Table2, Code, AlertTriangle as AlertIcon, BookOpen,
} from 'lucide-react';
import Mandala from '../components/Mandala';
import Markdown from '../components/Markdown';
import { useTheme } from '../contexts/ThemeContext';
import type { ResearchPayload, ResearchSection } from '../lib/types';
import {
  MetricBand, ModelCards, SpecTable, BenchmarkTable, TrainingPipeline,
  RoadmapTimeline, PapersList, SectionHeading,
} from '../components/research/ResearchWidgets';

const ICONS: Record<string, React.ReactNode> = {
  FileText: <FileText size={15} />, Compass: <Compass size={15} />, TrendingUp: <TrendingUp size={15} />,
  Layers: <Layers size={15} />, Focus: <Focus size={15} />, GitBranch: <GitBranch size={15} />,
  Waypoints: <Waypoints size={15} />, Type: <Type size={15} />, Infinity: <InfinityIcon size={15} />,
  FastForward: <FastForward size={15} />, Database: <Database size={15} />, Settings: <Settings size={15} />,
  Target: <Target size={15} />, Server: <Server size={15} />, Grid3x3: <Grid3x3 size={15} />,
  Zap: <Zap size={15} />, ClipboardCheck: <ClipboardCheck size={15} />, ShieldCheck: <ShieldCheck size={15} />,
  Building2: <Building2 size={15} />, Calculator: <Calculator size={15} />, Rocket: <Rocket size={15} />,
  Hammer: <Hammer size={15} />, Table2: <Table2 size={15} />, Code: <Code size={15} />,
  AlertTriangle: <AlertIcon size={15} />, BookOpen: <BookOpen size={15} />,
};

/** Ordered layout: data widgets interleaved with long-form chapters. */
const LAYOUT: { type: 'widget' | 'chapter'; key: string; label: string }[] = [
  { type: 'widget', key: 'models', label: 'The Model Family' },
  { type: 'widget', key: 'spec-table', label: 'Full Specifications' },
  { type: 'chapter', key: 'Foundations', label: 'Foundations' },
  { type: 'chapter', key: 'Architecture', label: 'Architecture' },
  { type: 'chapter', key: 'Training', label: 'Training' },
  { type: 'widget', key: 'pipeline', label: 'Training Pipeline' },
  { type: 'chapter', key: 'Systems', label: 'Systems' },
  { type: 'widget', key: 'benchmarks', label: 'Benchmarks' },
  { type: 'chapter', key: 'Evaluation', label: 'Evaluation & Safety' },
  { type: 'chapter', key: 'The Company', label: 'The Company' },
  { type: 'widget', key: 'roadmap', label: 'Roadmap' },
  { type: 'chapter', key: 'Build Your Own', label: 'Build Your Own' },
  { type: 'widget', key: 'papers', label: 'Publications' },
];

function SectionArticle({ s }: { s: ResearchSection }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5 }}
      className="scroll-mt-24 glass rounded-3xl p-5 sm:p-8"
    >
      <div className="flex items-start gap-3 mb-1.5">
        <span className="shrink-0 w-9 h-9 rounded-xl bg-[#b87333]/15 border border-[#b87333]/30 flex items-center justify-center text-[#c26a12] dark:text-[#ff9933] mt-0.5">
          {ICONS[s.icon] || <BookOpen size={15} />}
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-2xl sm:text-3xl text-[#9a5a12] dark:text-[#ffd89b] leading-tight">{s.title}</h3>
          <div className="flex items-center gap-2 text-[11px] text-[#8a7d60] mt-1">
            <Clock size={11} /> {s.read_minutes} min read
            <span className="text-[#b87333]/40">·</span>
            <span className="uppercase tracking-[0.14em]">{s.chapter}</span>
          </div>
        </div>
      </div>
      {s.summary && (
        <p className="text-[13.5px] text-[#7a6746] dark:text-[#a99a7c] leading-relaxed mb-4 pl-12">{s.summary}</p>
      )}
      <div className="border-t border-[#b87333]/15 pt-4">
        <Markdown content={s.body} />
      </div>
    </motion.article>
  );
}

export default function Research() {
  const { theme, toggle } = useTheme();
  const [data, setData] = useState<ResearchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tocOpen, setTocOpen] = useState(false);
  const [active, setActive] = useState('');
  const [progress, setProgress] = useState(0);
  const observer = useRef<IntersectionObserver | null>(null);

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await fetch('/api/research');
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not load research content');
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load research content');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { window.scrollTo(0, 0); load(); }, [load]);

  // Reading progress bar
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const total = h.scrollHeight - h.clientHeight;
      setProgress(total > 0 ? Math.min((h.scrollTop / total) * 100, 100) : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [data]);

  const byChapter = useMemo(() => {
    const out: Record<string, ResearchSection[]> = {};
    for (const s of data?.sections || []) (out[s.chapter] ||= []).push(s);
    return out;
  }, [data]);

  // Scroll-spy over every anchored block
  useEffect(() => {
    if (!data) return;
    observer.current?.disconnect();
    observer.current = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
    );
    document.querySelectorAll('[data-anchor]').forEach((el) => observer.current?.observe(el));
    return () => observer.current?.disconnect();
  }, [data]);

  const go = (id: string) => {
    setTocOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const toc = useMemo(
    () =>
      LAYOUT.map((block) => ({
        ...block,
        children: block.type === 'chapter' ? (byChapter[block.key] || []).map((s) => ({ id: s.slug, label: s.title })) : [],
      })),
    [byChapter]
  );

  const TocList = () => (
    <nav className="space-y-3">
      {toc.map((block) => (
        <div key={block.key}>
          <button
            onClick={() => go(block.type === 'widget' ? block.key : block.children[0]?.id || block.key)}
            className={`w-full text-left text-[11px] uppercase tracking-[0.2em] transition-colors ${
              block.children.some((c) => c.id === active) || active === block.key
                ? 'text-[#b5661a] dark:text-[#ff9933]'
                : 'text-[#8a7350] dark:text-[#a99a7c] hover:text-[#ff9933]'
            }`}
          >
            {block.label}
          </button>
          {block.children.length > 0 && (
            <div className="mt-1.5 space-y-0.5 border-l border-[#b87333]/20 pl-3">
              {block.children.map((c) => (
                <button
                  key={c.id}
                  onClick={() => go(c.id)}
                  className={`block w-full text-left text-[12.5px] leading-snug py-0.5 transition-colors ${
                    active === c.id
                      ? 'text-[#6a4310] dark:text-[#ffd89b] font-medium'
                      : 'text-[#7a6746] dark:text-[#8a7d60] hover:text-[#ff9933]'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );

  const renderWidget = (key: string) => {
    if (!data) return null;
    switch (key) {
      case 'models':
        return (
          <section data-anchor id="models" className="scroll-mt-24">
            <SectionHeading
              eyebrow="The family"
              title="Three standalone models, 3.8T to 8.7T"
              subtitle="Each is a single jointly-trained network — not an ensemble, not a router over smaller checkpoints, not a scaffold around someone else's model. The same architecture at three scales."
            />
            <ModelCards specs={data.specs} />
          </section>
        );
      case 'spec-table':
        return (
          <section data-anchor id="spec-table" className="scroll-mt-24">
            <SectionHeading
              eyebrow="Specifications"
              title="Every number, side by side"
              subtitle="Complete architectural, training and serving specifications for all three models."
            />
            <SpecTable specs={data.specs} />
          </section>
        );
      case 'pipeline':
        return (
          <section data-anchor id="pipeline" className="scroll-mt-24">
            <SectionHeading
              eyebrow="Training"
              title="The ten-stage pipeline"
              subtitle="From corpus construction to quantisation-aware distillation. Expand any stage for the tokens, hardware, hyperparameters and the reasoning behind it."
            />
            <TrainingPipeline stages={data.training} />
          </section>
        );
      case 'benchmarks':
        return (
          <section data-anchor id="benchmarks" className="scroll-mt-24">
            <SectionHeading
              eyebrow="Evaluation"
              title="Benchmarks"
              subtitle="24 suites across knowledge, mathematics, code, reasoning, agentic behaviour, long context, multilingual capability and factuality."
            />
            <BenchmarkTable benchmarks={data.benchmarks} />
          </section>
        );
      case 'roadmap':
        return (
          <section data-anchor id="roadmap" className="scroll-mt-24">
            <SectionHeading
              eyebrow="Trajectory"
              title="Where we have been, where we are going"
              subtitle="Four model generations shipped, a 14.2T multimodal model in training, and a 20-trillion-parameter research programme beyond it."
            />
            <RoadmapTimeline items={data.roadmap} />
          </section>
        );
      case 'papers':
        return (
          <section data-anchor id="papers" className="scroll-mt-24">
            <SectionHeading
              eyebrow="Publications"
              title="Technical reports"
              subtitle="The methods behind the models. We publish what worked and what did not, because the field advances faster when the expensive lessons are shared."
            />
            <PapersList papers={data.papers} />
          </section>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] text-[#ece5d8] relative overflow-x-hidden grain">
      <div className="pointer-events-none fixed inset-0 z-0"><div className="ambient-bg" /></div>
      <div className="pointer-events-none fixed -top-28 -right-24 opacity-[0.05] z-0">
        <Mandala className="w-[460px] h-[460px] animate-spin-slow" color="#ff9933" />
      </div>
      <div className="pointer-events-none fixed -bottom-32 -left-28 opacity-[0.04] z-0">
        <Mandala className="w-[420px] h-[420px] animate-spin-slow-rev" color="#c9a24a" />
      </div>

      {/* nav */}
      <nav className="sticky top-0 z-40 glass-strong border-b border-[#b87333]/12">
        <div className="max-w-7xl mx-auto px-4 sm:px-5 py-3 flex items-center justify-between gap-2">
          <Link to="/" className="inline-flex items-center gap-1.5 text-[#c9a24a] hover:text-[#ff9933] transition-colors text-[13px] shrink-0">
            <ArrowLeft size={16} /> <span className="hidden sm:inline">Home</span>
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <Mandala className="w-6 h-6 shrink-0" color="#ff9933" />
            <span className="font-display text-base sm:text-lg text-gradient-gold truncate">Sutradhar Research</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setTocOpen(true)}
              aria-label="Table of contents"
              className="xl:hidden w-9 h-9 rounded-xl border border-[#b87333]/25 flex items-center justify-center text-[#c9a24a] hover:text-[#ff9933]"
            >
              <List size={16} />
            </button>
            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="w-9 h-9 rounded-xl border border-[#b87333]/25 flex items-center justify-center text-[#c9a24a] hover:text-[#ff9933] hover:border-[#ff9933]/30 transition-all"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
        <div className="h-[2px] bg-transparent">
          <div className="h-full bg-gradient-to-r from-[#ff9933] to-[#c9a24a] transition-[width] duration-150" style={{ width: `${progress}%` }} />
        </div>
      </nav>

      {/* mobile TOC drawer */}
      <AnimatePresence>
        {tocOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setTocOpen(false)}
              className="xl:hidden fixed inset-0 bg-black/65 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 280 }}
              className="xl:hidden fixed right-0 top-0 bottom-0 w-[84%] max-w-sm z-50 mobile-solid border-l border-[#b87333]/25 overflow-y-auto"
            >
              <div className="flex items-center justify-between p-4 border-b border-[#b87333]/15 sticky top-0 mobile-solid">
                <span className="font-display text-lg text-gradient-gold">Contents</span>
                <button onClick={() => setTocOpen(false)} className="w-9 h-9 rounded-lg flex items-center justify-center text-[#8a7d60] hover:text-[#ff9933]">
                  <X size={18} />
                </button>
              </div>
              <div className="p-4"><TocList /></div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-5 py-10 sm:py-14">
        {/* hero */}
        <motion.header initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-[11px] tracking-[0.2em] uppercase text-[#c9a24a] mb-5">
            Technical Report · Sutradhar 6.7 Family
          </div>
          <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl text-gradient-gold leading-[1.02]">
            Trillion-parameter reasoning,<br className="hidden sm:block" /> engineered end to end
          </h1>
          <p className="text-[#7a6746] dark:text-[#a99a7c] max-w-3xl mx-auto mt-6 text-base sm:text-lg leading-relaxed">
            Three standalone sparse Mixture-of-Experts models of <strong className="text-[#9a5a12] dark:text-[#ffd89b]">3.8, 6.7 and 8.7 trillion
            parameters</strong> — architecture, training pipeline, systems engineering, evaluation, economics and roadmap. Written so that a
            competent team could rebuild it.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
            {['25 chapters', '~2.5 hours of reading', 'Full hyperparameters', 'Reference implementation', 'Failure modes included'].map((t) => (
              <span key={t} className="text-[11.5px] px-3 py-1.5 rounded-full glass text-[#7a6746] dark:text-[#a99a7c]">{t}</span>
            ))}
          </div>
        </motion.header>

        {loading && (
          <div className="flex flex-col items-center justify-center py-28 gap-3">
            <Loader2 size={26} className="animate-spin text-[#ff9933]" />
            <span className="text-[#8a7d60] text-sm">Loading the technical report…</span>
          </div>
        )}

        {error && !loading && (
          <div className="max-w-lg mx-auto my-20 p-5 rounded-2xl border border-red-500/35 bg-red-500/10 text-center">
            <AlertTriangle size={22} className="mx-auto mb-2 text-red-400" />
            <p className="text-[13.5px] text-red-300 mb-3">{error}</p>
            <button onClick={() => { setLoading(true); load(); }} className="btn-jade px-4 py-2 rounded-xl text-[13px] font-medium">
              Retry
            </button>
          </div>
        )}

        {data && !loading && (
          <div className="flex gap-8">
            {/* desktop TOC */}
            <aside className="hidden xl:block w-64 shrink-0">
              <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2">
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#8a7350] dark:text-[#a99a7c] mb-3">Contents</div>
                <TocList />
              </div>
            </aside>

            <main className="min-w-0 flex-1 space-y-16">
              {/* at a glance */}
              <section data-anchor id="overview" className="scroll-mt-24">
                <SectionHeading eyebrow="At a glance" title="The state of Sutradhar" />
                <MetricBand metrics={data.metrics} />
              </section>

              {LAYOUT.map((block) => (
                <div key={block.key} className="space-y-6">
                  {block.type === 'widget'
                    ? renderWidget(block.key)
                    : (
                      <>
                        <div data-anchor id={`chapter-${block.key.replace(/\s+/g, '-').toLowerCase()}`} className="scroll-mt-24">
                          <div className="flex items-center gap-3">
                            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[#b87333]/40 to-[#b87333]/40" />
                            <span className="font-display text-lg text-[#c9a24a] tracking-[0.12em] uppercase">{block.label}</span>
                            <span className="h-px flex-1 bg-gradient-to-l from-transparent via-[#b87333]/40 to-[#b87333]/40" />
                          </div>
                        </div>
                        {(byChapter[block.key] || []).map((s) => (
                          <div key={s.slug} data-anchor id={s.slug} className="scroll-mt-24">
                            <SectionArticle s={s} />
                          </div>
                        ))}
                      </>
                    )}
                </div>
              ))}

              {/* cta */}
              <div className="glass-strong rounded-3xl p-8 text-center relative overflow-hidden">
                <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 opacity-[0.06]">
                  <Mandala className="w-[420px] h-[420px] animate-spin-slow" color="#ff9933" />
                </div>
                <div className="relative">
                  <h3 className="font-display text-3xl text-gradient-gold mb-3">Build with Sutradhar</h3>
                  <p className="text-[#7a6746] dark:text-[#a99a7c] max-w-xl mx-auto mb-6">
                    Call the 3.8T, 6.7T and 8.7T models from your own code with a single API key. Or open the app and watch the
                    reasoning core work in real time.
                  </p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <Link
                      to="/app/api"
                      className="inline-flex items-center gap-2 px-7 py-3 rounded-xl bg-gradient-to-br from-[#ff9933] to-[#b87333] text-[#1a1207] font-semibold hover:brightness-110 hover:saffron-glow transition-all"
                    >
                      API Docs & Keys <ArrowRight size={17} />
                    </Link>
                    <Link to="/app" className="px-7 py-3 rounded-xl glass text-[#9a5a12] dark:text-[#ffd89b] hover:border-[#ff9933]/40 transition-all">
                      Open the App
                    </Link>
                  </div>
                </div>
              </div>

              <footer className="border-t border-[#b87333]/12 pt-8 text-center text-[12.5px] text-[#877552] dark:text-[#6b6250] leading-relaxed">
                <p className="mb-2">
                  Sutradhar 6.7 Technical Report · 3.8T Lite · 6.7T Ultra · 8.7T Extreme
                </p>
                <p className="max-w-2xl mx-auto">
                  Benchmark figures are pass@1 under a single general system prompt, averaged over five seeds. Cross-lab comparisons are
                  indicative only. Crafted with saffron &amp; silicon.
                </p>
              </footer>
            </main>
          </div>
        )}
      </div>
    </div>
  );
}
