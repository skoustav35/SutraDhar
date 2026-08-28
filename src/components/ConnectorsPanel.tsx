import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plug, Check, X, Search, Loader2, ShieldCheck, AlertTriangle, RefreshCw, ExternalLink,
  Play, KeyRound, Zap, ChevronRight, Activity, Lock,
} from 'lucide-react';
import type { Connector, ProviderDef, ConnectorActionDef, ActionResult, ConnectorEvent } from '../lib/types';
import { CONNECTOR_MAP, CATEGORIES } from '../lib/catalog';

interface Props {
  authHeaders: () => Promise<Record<string, string>>;
}

type Tab = 'browse' | 'connected' | 'activity';

function relTime(iso: string | null) {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ConnectorLogo({ meta, size = 10, withBg = true }: { meta: any; size?: number; withBg?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!meta?.logo || failed) {
    return <span style={{ fontSize: size * 1.6 }}>{meta?.emoji || '🔌'}</span>;
  }
  const bg = withBg ? { background: 'white', border: `1px solid ${meta.color}22` } : {};
  return (
    <img
      src={meta.logo}
      alt={meta.name}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="object-contain"
      style={{ width: size, height: size, ...bg } as any}
    />
  );
}

/* ------------------------------------------------------------------ drawer */

function ConnectDrawer({
  def,
  existing,
  authHeaders,
  onClose,
  onDone,
}: {
  def: ProviderDef;
  existing: Connector | null;
  authHeaders: () => Promise<Record<string, string>>;
  onClose: () => void;
  onDone: () => void;
}) {
  const meta = CONNECTOR_MAP[def.id];
  const [token, setToken] = useState('');
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'oauth' | 'token' | null>(null);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Listen for the OAuth popup result.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'connector-oauth-success' && e.data.provider === def.id) {
        setBusy(null);
        onDone();
        onClose();
      } else if (e.data?.type === 'connector-oauth-error') {
        setBusy(null);
        setError(e.data.message || 'Authorization failed.');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [def.id, onDone, onClose]);

  const startOAuth = async () => {
    setError('');
    setBusy('oauth');
    try {
      const res = await fetch(`/api/connector-oauth?provider=${def.id}`, { headers: await authHeaders() });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not start authorization');
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      window.open(j.url, 'connector-oauth', isMobile ? '' : 'width=620,height=760');
    } catch (e) {
      setBusy(null);
      setError(e instanceof Error ? e.message : 'Could not start authorization');
    }
  };

  const submitToken = async () => {
    setError('');
    const errs: Record<string, string> = {};
    if (!token.trim()) errs.token = `${def.tokenLabel} is required`;
    for (const f of def.extraFields) {
      if (f.required && !String(extra[f.name] || '').trim()) errs[f.name] = `${f.label} is required`;
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy('token');
    try {
      const res = await fetch('/api/connectors', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ provider: def.id, token: token.trim(), extra }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Verification failed');
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/65 backdrop-blur-sm z-40"
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 280 }}
        className="fixed inset-x-0 bottom-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[30rem] z-50 mobile-solid border-t sm:border-t-0 sm:border-l border-[#b87333]/25 max-h-[92vh] sm:max-h-none overflow-y-auto rounded-t-3xl sm:rounded-none"
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3 mb-5">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-white border shadow-sm"
              style={{ borderColor: `${meta?.color || '#b87333'}22` }}
            >
              <ConnectorLogo meta={meta} size={28} withBg={false} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-2xl text-[#6a4310] dark:text-[#ffd89b] leading-tight">{def.name}</h2>
              <a
                href={def.docs}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[12px] text-[#1e6e50] dark:text-[#8fd4b4] hover:underline"
              >
                API documentation <ExternalLink size={11} />
              </a>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-lg flex items-center justify-center text-[#8a7d60] hover:text-[#ff9933]">
              <X size={18} />
            </button>
          </div>

          {existing && (
            <div className="jade-panel p-3 mb-4 text-[12.5px] text-[#1e6e50] dark:text-[#8fd4b4] flex items-center gap-2">
              <ShieldCheck size={14} />
              Already connected as <strong>{existing.account_name}</strong>. Reconnecting replaces the stored credential.
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-xl border border-red-500/35 bg-red-500/10 text-[12.5px] text-red-500 dark:text-red-300 flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span className="min-w-0 break-words">{error}</span>
            </div>
          )}

          {/* ---------------------------------------------------- Browser Login (Luxury) */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#1e6e50]/20 to-[#1e6e50]/10 border border-[#1e6e50]/30 flex items-center justify-center">
                <Zap size={16} className="text-[#1e6e50] dark:text-[#8fd4b4]" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.2em] text-[#1e6e50] dark:text-[#8fd4b4] font-medium">Recommended</div>
                <div className="text-[13px] font-medium text-[#6a4310] dark:text-[#ffd89b]">Continue with Browser</div>
              </div>
              <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-[#1e6e50]/10 border border-[#1e6e50]/20 text-[#1e6e50] dark:text-[#8fd4b4]">One-click</span>
            </div>

            {def.oauthAvailable ? (
              def.oauthReady ? (
                <>
                  <button
                    onClick={startOAuth}
                    disabled={busy !== null}
                    className="w-full py-3 rounded-xl text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60 shadow-lg hover:shadow-xl transition-all"
                    style={{ background: `linear-gradient(135deg, ${meta?.color || '#1e6e50'} 0%, ${meta?.color || '#1e6e50'}dd 100%)`, color: 'white' }}
                  >
                    {busy === 'oauth' ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
                    {busy === 'oauth' ? 'Waiting for browser…' : `Connect ${def.name} in Browser`}
                  </button>
                  <p className="text-[11px] text-[#8a7d60] mt-2 text-center leading-relaxed">
                    Opens a secure popup to <strong>{def.name}</strong> — log in once, no token to copy. Your credential is verified live and encrypted.
                  </p>
                  {def.oauthScopes.length > 0 && (
                    <div className="mt-3 p-2.5 rounded-xl bg-[#b87333]/5 border border-[#b87333]/15">
                      <div className="text-[10px] uppercase tracking-wide text-[#8a7d60] mb-1">Permissions requested:</div>
                      <div className="flex flex-wrap gap-1">
                        {def.oauthScopes.slice(0, 5).map((s) => (
                          <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white dark:bg-black/20 border border-[#b87333]/20 text-[#8a7d60] break-all">
                            {s.replace('https://www.googleapis.com/auth/', '').replace('https://api.', '')}
                          </span>
                        ))}
                        {def.oauthScopes.length > 5 && <span className="text-[10px] text-[#8a7d60]">+{def.oauthScopes.length - 5} more</span>}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5">
                  <div className="flex items-center gap-2 mb-2 text-amber-700 dark:text-amber-300 font-medium text-[13px]">
                    <Lock size={14} /> Browser login not yet enabled
                  </div>
                  <p className="text-[12px] text-[#7a6746] dark:text-[#a99a7c] leading-relaxed mb-2">
                    One-click browser login for <strong>{def.name}</strong> needs an OAuth app. Until your admin enables it, use the token method below — it works in 30 seconds.
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {def.oauthEnvKeys.map((k) => (
                      <code key={k} className="px-2 py-1 rounded-lg bg-black/5 dark:bg-white/10 border border-[#b87333]/20 text-[#b5661a] dark:text-[#ffd89b] text-[11px] font-mono">{k}</code>
                    ))}
                  </div>
                  <p className="text-[11px] text-[#8a7d60] mt-2">
                    Tip: Create the OAuth app at <a href={def.docs} target="_blank" rel="noreferrer" className="underline hover:text-[#ff9933]">docs</a>, then add the keys to Secrets → one-click will light up.
                  </p>
                </div>
              )
            ) : (
              <>
                <div className="p-3 rounded-xl border border-[#b87333]/20 bg-[#b87333]/5 text-[12px] text-[#7a6746] dark:text-[#a99a7c]">
                  <strong>{def.name}</strong> does not support one-click OAuth — token is the official method and works instantly.
                </div>
                <button
                  onClick={() => document.getElementById('token-section')?.scrollIntoView({ behavior: 'smooth' })}
                  className="w-full mt-3 py-2.5 rounded-xl border border-[#b87333]/25 text-[#8a7d60] hover:text-[#ff9933] hover:border-[#ff9933]/30 text-[13px] flex items-center justify-center gap-2"
                >
                  <KeyRound size={14} /> Use token instead ↓
                </button>
              </>
            )}
          </div>

          {/* ---------------------------------------------------- Token path (fallback) */}
          <div id="token-section" className="pt-4 border-t border-[#b87333]/15">
            <div className="flex items-center gap-2 mb-2">
              <KeyRound size={14} className="text-[#8a7d60]" />
              <div className="text-[10px] uppercase tracking-[0.24em] text-[#8a7350] dark:text-[#a99a7c]">
                {def.oauthAvailable ? 'Alternative · ' : ''}Connect with {def.tokenLabel.toLowerCase()}
              </div>
              <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full border border-[#b87333]/20 text-[#8a7d60]">Works always</span>
            </div>
            <p className="text-[12px] text-[#7a6746] dark:text-[#a99a7c] leading-relaxed mb-3">{def.tokenHelp}</p>
            <a
              href={def.tokenUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] text-[#1e6e50] dark:text-[#8fd4b4] hover:underline mb-3"
            >
              <KeyRound size={12} /> Create one on {def.name} <ExternalLink size={11} />
            </a>

            {def.extraFields.map((f) => (
              <div key={f.name} className="mb-3">
                <label className="block text-[12px] text-[#7a6746] dark:text-[#a99a7c] mb-1">
                  {f.label} {f.required && <span className="text-[#b5661a]">*</span>}
                </label>
                <input
                  value={extra[f.name] || ''}
                  onChange={(e) => setExtra((p) => ({ ...p, [f.name]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="ayur-input w-full px-3 py-2.5 rounded-xl text-sm"
                />
                {fieldErrors[f.name] && <p className="text-[11px] text-red-500 mt-1">{fieldErrors[f.name]}</p>}
              </div>
            ))}

            <label className="block text-[12px] text-[#7a6746] dark:text-[#a99a7c] mb-1">
              {def.tokenLabel} <span className="text-[#b5661a]">*</span>
            </label>
            <textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              rows={3}
              spellCheck={false}
              placeholder="Paste your credential…"
              className="ayur-input w-full px-3 py-2.5 rounded-xl text-sm font-mono resize-none break-all"
            />
            {fieldErrors.token && <p className="text-[11px] text-red-500 mt-1">{fieldErrors.token}</p>}

            <button
              onClick={submitToken}
              disabled={busy !== null}
              className="btn-jade w-full mt-3 py-2.5 rounded-xl text-[13.5px] font-medium flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy === 'token' ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
              {busy === 'token' ? `Verifying with ${def.name}…` : 'Verify & connect'}
            </button>

            <p className="text-[11px] text-[#8a7d60] mt-3 leading-relaxed flex items-start gap-1.5">
              <Lock size={11} className="shrink-0 mt-0.5" />
              Your credential is checked against the live {def.name} API before anything is saved, then encrypted with AES-256-GCM. It is never returned to the browser.
            </p>
          </div>
        </div>
      </motion.div>
    </>
  );
}

/* ------------------------------------------------------------- action runner */

function ActionRunner({
  def,
  authHeaders,
  onRan,
}: {
  def: ProviderDef;
  authHeaders: () => Promise<Record<string, string>>;
  onRan: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [error, setError] = useState('');

  const selected: ConnectorActionDef | undefined = def.actions.find((a) => a.id === openId);

  const run = async (action: ConnectorActionDef) => {
    setRunning(action.id);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/connector-actions', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ provider: def.id, action: action.id, params }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Action failed');
      setResult(j);
      onRan();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-[#b87333]/15">
      <div className="text-[10px] uppercase tracking-[0.22em] text-[#8a7350] dark:text-[#a99a7c] mb-2">Live actions</div>
      <div className="flex flex-wrap gap-1.5">
        {def.actions.map((a) => (
          <button
            key={a.id}
            onClick={() => {
              setOpenId(openId === a.id ? null : a.id);
              setParams({});
              setResult(null);
              setError('');
            }}
            className={`text-[11.5px] px-2.5 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
              openId === a.id
                ? 'bg-[#ff9933]/15 border-[#ff9933]/45 text-[#b5661a] dark:text-[#ffd89b]'
                : 'border-[#b87333]/22 text-[#8a7d60] hover:border-[#ff9933]/30'
            }`}
          >
            {a.write ? <Zap size={11} /> : <Play size={11} />}
            {a.label}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-3 p-3 rounded-xl border border-[#b87333]/20 bg-[#b87333]/5">
              <p className="text-[12px] text-[#7a6746] dark:text-[#a99a7c] mb-2">{selected.description}</p>
              {selected.write && (
                <p className="text-[11px] text-[#b5661a] dark:text-[#ffd89b] mb-2 flex items-center gap-1.5">
                  <AlertTriangle size={11} /> This writes real data to your {def.name} account.
                </p>
              )}
              {selected.params.map((p) => (
                <div key={p.name} className="mb-2">
                  <label className="block text-[11px] text-[#8a7d60] mb-1">
                    {p.name}
                    {p.required && <span className="text-[#b5661a]"> *</span>}
                  </label>
                  {p.type === 'textarea' ? (
                    <textarea
                      rows={2}
                      value={params[p.name] ?? ''}
                      onChange={(e) => setParams((s) => ({ ...s, [p.name]: e.target.value }))}
                      placeholder={p.placeholder}
                      className="ayur-input w-full px-2.5 py-2 rounded-lg text-[12.5px] resize-none"
                    />
                  ) : (
                    <input
                      type={p.type === 'number' ? 'number' : 'text'}
                      value={params[p.name] ?? (p.default !== undefined ? String(p.default) : '')}
                      onChange={(e) => setParams((s) => ({ ...s, [p.name]: e.target.value }))}
                      placeholder={p.placeholder}
                      className="ayur-input w-full px-2.5 py-2 rounded-lg text-[12.5px]"
                    />
                  )}
                </div>
              ))}
              <button
                onClick={() => run(selected)}
                disabled={running !== null}
                className="btn-jade px-3 py-1.5 rounded-lg text-[12.5px] font-medium flex items-center gap-1.5 disabled:opacity-60"
              >
                {running === selected.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                {running === selected.id ? 'Calling the live API…' : 'Run'}
              </button>

              {error && (
                <div className="mt-2.5 p-2.5 rounded-lg border border-red-500/35 bg-red-500/10 text-[11.5px] text-red-500 dark:text-red-300 break-words">
                  {error}
                </div>
              )}

              {result && (
                <div className="mt-2.5">
                  <div className="flex items-center gap-1.5 text-[11.5px] text-[#1e6e50] dark:text-[#8fd4b4] mb-1.5">
                    <Check size={12} /> {result.summary}
                    <span className="text-[#8a7d60] ml-auto">{result.duration_ms}ms</span>
                  </div>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {result.rows.map((r, i) => (
                      <div key={i} className="p-2 rounded-lg bg-[#121212]/40 dark:bg-black/20 border border-[#b87333]/12">
                        <div className="text-[12px] text-[#6a4310] dark:text-[#ffd89b] truncate">{r.title}</div>
                        {r.subtitle && <div className="text-[11px] text-[#8a7d60] truncate">{r.subtitle}</div>}
                        <div className="flex items-center gap-2">
                          {r.meta && <span className="text-[10px] text-[#8a7d60]">{r.meta}</span>}
                          {r.url && (
                            <a href={r.url} target="_blank" rel="noreferrer" className="text-[10px] text-[#1e6e50] dark:text-[#8fd4b4] hover:underline inline-flex items-center gap-0.5">
                              open <ExternalLink size={9} />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                    {result.rows.length === 0 && <div className="text-[11.5px] text-[#8a7d60]">No rows returned.</div>}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------- panel */

export default function ConnectorsPanel({ authHeaders }: Props) {
  const [connections, setConnections] = useState<Connector[]>([]);
  const [catalog, setCatalog] = useState<ProviderDef[]>([]);
  const [events, setEvents] = useState<ConnectorEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('All');
  const [tab, setTab] = useState<Tab>('browse');
  const [drawer, setDrawer] = useState<ProviderDef | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((ok: boolean, msg: string) => {
    setToast({ ok, msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoadError('');
      const res = await fetch('/api/connectors?catalog=1', { headers: await authHeaders() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not load connectors');
      const j = await res.json();
      setConnections(j.connections || []);
      setCatalog(j.catalog || []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load connectors');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/connector-actions?limit=40', { headers: await authHeaders() });
      if (res.ok) setEvents(await res.json());
    } catch {
      /* non-critical */
    }
  }, [authHeaders]);

  useEffect(() => { load(); loadEvents(); }, [load, loadEvents]);

  const byProvider = useMemo(() => Object.fromEntries(connections.map((c) => [c.provider, c])), [connections]);
  const defById = useMemo(() => Object.fromEntries(catalog.map((d) => [d.id, d])), [catalog]);

  const test = async (provider: string) => {
    setTesting(provider);
    try {
      const res = await fetch('/api/connectors', {
        method: 'PUT',
        headers: await authHeaders(),
        body: JSON.stringify({ provider }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Verification failed');
      flash(true, `${defById[provider]?.name || provider} responded — connection healthy.`);
      await load();
      loadEvents();
    } catch (e) {
      flash(false, e instanceof Error ? e.message : 'Verification failed');
      await load();
    } finally {
      setTesting(null);
    }
  };

  const disconnect = async (provider: string) => {
    setConnections((p) => p.filter((c) => c.provider !== provider));
    try {
      await fetch('/api/connectors', {
        method: 'DELETE',
        headers: await authHeaders(),
        body: JSON.stringify({ provider }),
      });
      flash(true, 'Disconnected.');
    } catch {
      flash(false, 'Could not disconnect.');
    }
    load();
    loadEvents();
  };

  const filtered = catalog.filter((d) => {
    const meta = CONNECTOR_MAP[d.id];
    const category = meta?.category || 'Productivity';
    const blurb = meta?.blurb || '';
    const q = query.toLowerCase();
    return (cat === 'All' || category === cat) && (d.name.toLowerCase().includes(q) || blurb.toLowerCase().includes(q));
  });

  const healthy = connections.filter((c) => c.status === 'connected').length;
  const degraded = connections.length - healthy;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-24">
        <div className="flex items-center gap-2.5 mb-1">
          <Plug size={22} className="text-[#b5661a] dark:text-[#ff9933]" />
          <h1 className="font-display text-3xl text-gradient-gold">Connectors</h1>
        </div>
        <p className="text-[#7a6746] dark:text-[#a99a7c] text-sm mb-4">
          Real, verified connections. Every credential is checked against the provider's live API, encrypted at rest, and callable by Sutradhar mid-conversation.
        </p>

        <div className="grid grid-cols-3 gap-2 mb-5">
          <div className="jade-panel p-3">
            <div className="text-xl font-display text-[#1e6e50] dark:text-[#8fd4b4]">{healthy}</div>
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-[#8a7d60]">Healthy</div>
          </div>
          <div className="jade-panel p-3">
            <div className="text-xl font-display text-[#b5661a] dark:text-[#ffd89b]">{degraded}</div>
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-[#8a7d60]">Needs attention</div>
          </div>
          <div className="jade-panel p-3">
            <div className="text-xl font-display text-[#1e6e50] dark:text-[#8fd4b4]">{catalog.length}</div>
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-[#8a7d60]">Available</div>
          </div>
        </div>

        <div className="flex gap-1.5 mb-4">
          {([
            ['browse', 'Browse'],
            ['connected', `Connected${connections.length ? ` (${connections.length})` : ''}`],
            ['activity', 'Activity'],
          ] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setTab(id); if (id === 'activity') loadEvents(); }}
              className={`text-[12.5px] px-3.5 py-2 rounded-xl border transition-all ${
                tab === id
                  ? 'bg-[#ff9933]/15 border-[#ff9933]/45 text-[#b5661a] dark:text-[#ffd89b]'
                  : 'border-[#b87333]/22 text-[#8a7d60] hover:border-[#ff9933]/30'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loadError && (
          <div className="mb-4 p-3 rounded-xl border border-red-500/35 bg-red-500/10 text-[12.5px] text-red-500 dark:text-red-300 flex items-center gap-2">
            <AlertTriangle size={14} /> {loadError}
            <button onClick={() => { setLoading(true); load(); }} className="ml-auto underline">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="connector-card rounded-2xl p-4">
                <div className="h-10 w-10 rounded-xl shimmer mb-3" />
                <div className="h-3.5 w-2/3 rounded shimmer mb-2" />
                <div className="h-3 w-full rounded shimmer mb-3" />
                <div className="h-8 w-full rounded-lg shimmer" />
              </div>
            ))}
          </div>
        ) : tab === 'browse' ? (
          <>
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a7d60]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search connectors…"
                className="ayur-input w-full pl-9 pr-3 py-2.5 rounded-xl text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 mb-5">
              {['All', ...CATEGORIES].map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`text-[12px] px-3 py-1.5 rounded-full border transition-all ${
                    cat === c
                      ? 'bg-[#ff9933]/15 border-[#ff9933]/45 text-[#b5661a] dark:text-[#ffd89b]'
                      : 'border-[#b87333]/22 text-[#8a7d60] hover:border-[#ff9933]/30'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-14 text-[#8a7d60] text-sm">No connectors match “{query}”.</div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filtered.map((d) => {
                  const meta = CONNECTOR_MAP[d.id];
                  const conn = byProvider[d.id];
                  return (
                    <motion.div key={d.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="connector-card rounded-2xl p-4 flex flex-col">
                      <div className="flex items-start justify-between mb-2">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white border shadow-sm p-1.5" style={{ borderColor: `${meta?.color || '#b87333'}18` }}>
                          <ConnectorLogo meta={meta} size={22} withBg={false} />
                        </div>
                        {conn && (
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${
                              conn.status === 'connected'
                                ? 'border-emerald-500/40 text-emerald-600 dark:text-[#8fd4b4] bg-emerald-500/10'
                                : 'border-amber-500/40 text-amber-600 dark:text-amber-300 bg-amber-500/10'
                            }`}
                          >
                            {conn.status === 'connected' ? <Check size={9} /> : <AlertTriangle size={9} />}
                            {conn.status === 'connected' ? 'Live' : conn.status}
                          </span>
                        )}
                      </div>
                      <h3 className="font-medium text-[15px] text-[#6a4310] dark:text-[#ffd89b]">{d.name}</h3>
                      <p className="text-[12px] text-[#7a6746] dark:text-[#a99a7c] mb-2 flex-1">{meta?.blurb || ''}</p>
                      <div className="flex items-center gap-1.5 mb-3 text-[10px] text-[#8a7d60]">
                        <span className="px-1.5 py-0.5 rounded border border-[#b87333]/22">{d.actions.length} actions</span>
                        {d.oauthReady && <span className="px-1.5 py-0.5 rounded border border-emerald-500/30 text-emerald-600 dark:text-[#8fd4b4]">OAuth</span>}
                      </div>
                      {conn ? (
                        <button
                          onClick={() => { setTab('connected'); setExpanded(d.id); }}
                          className="w-full py-2 rounded-lg text-[13px] border border-[#b87333]/25 text-[#8a7d60] hover:text-[#ff9933] hover:border-[#ff9933]/40 transition-colors flex items-center justify-center gap-1.5"
                        >
                          Manage <ChevronRight size={13} />
                        </button>
                      ) : (
                        <button onClick={() => setDrawer(d)} className="btn-jade w-full py-2 rounded-lg text-[13px] font-medium">
                          Connect
                        </button>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </>
        ) : tab === 'connected' ? (
          connections.length === 0 ? (
            <div className="text-center py-16">
              <Plug size={30} className="mx-auto mb-3 text-[#8a7d60]" />
              <p className="text-[#8a7d60] text-sm mb-3">No accounts connected yet.</p>
              <button onClick={() => setTab('browse')} className="btn-jade px-4 py-2 rounded-xl text-[13px] font-medium">
                Browse connectors
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {connections.map((c) => {
                const meta = CONNECTOR_MAP[c.provider];
                const def = defById[c.provider];
                const open = expanded === c.provider;
                return (
                  <motion.div key={c.id} layout className="connector-card rounded-2xl p-4">
                    <div className="flex items-start gap-3">
                      {c.account_avatar ? (
                        <img src={c.account_avatar} alt="" className="w-11 h-11 rounded-xl object-cover border border-[#b87333]/30 shrink-0" />
                      ) : (
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-white border shadow-sm p-1.5 shrink-0" style={{ borderColor: `${meta?.color || '#b87333'}18` }}>
                          <ConnectorLogo meta={meta} size={24} withBg={false} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium text-[15px] text-[#6a4310] dark:text-[#ffd89b]">{c.name}</h3>
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${
                              c.status === 'connected'
                                ? 'border-emerald-500/40 text-emerald-600 dark:text-[#8fd4b4] bg-emerald-500/10'
                                : 'border-amber-500/40 text-amber-600 dark:text-amber-300 bg-amber-500/10'
                            }`}
                          >
                            {c.status === 'connected' ? <Check size={9} /> : <AlertTriangle size={9} />}
                            {c.status}
                          </span>
                          <span className="text-[9px] px-2 py-0.5 rounded-full border border-[#b87333]/25 text-[#8a7d60] uppercase tracking-wide">
                            {c.auth_type === 'oauth2' ? 'OAuth' : 'Token'}
                          </span>
                        </div>
                        <div className="text-[13px] text-[#7a6746] dark:text-[#a99a7c] truncate">
                          {c.account_name}
                          {c.account_label ? ` · ${c.account_label}` : ''}
                        </div>
                        <div className="text-[11px] text-[#8a7d60] mt-0.5">
                          Verified {relTime(c.last_verified_at)}
                          {c.account_url && (
                            <>
                              {' · '}
                              <a href={c.account_url} target="_blank" rel="noreferrer" className="hover:underline text-[#1e6e50] dark:text-[#8fd4b4]">
                                view account
                              </a>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {c.last_error && (
                      <div className="mt-2.5 p-2.5 rounded-lg border border-amber-500/35 bg-amber-500/10 text-[11.5px] text-amber-700 dark:text-amber-300 break-words">
                        {c.last_error}
                      </div>
                    )}

                    {c.scopes.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2.5">
                        {c.scopes.slice(0, 6).map((s) => (
                          <span key={s} className="text-[10px] px-1.5 py-0.5 rounded border border-[#b87333]/22 text-[#8a7d60] break-all">
                            {s.replace('https://www.googleapis.com/auth/', '')}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5 mt-3">
                      <button
                        onClick={() => test(c.provider)}
                        disabled={testing === c.provider}
                        className="px-3 py-1.5 rounded-lg text-[12.5px] border border-[#b87333]/25 text-[#8a7d60] hover:text-[#ff9933] hover:border-[#ff9933]/40 transition-colors flex items-center gap-1.5 disabled:opacity-60"
                      >
                        {testing === c.provider ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        Test connection
                      </button>
                      {def && def.actions.length > 0 && (
                        <button
                          onClick={() => setExpanded(open ? null : c.provider)}
                          className="px-3 py-1.5 rounded-lg text-[12.5px] border border-[#b87333]/25 text-[#8a7d60] hover:text-[#ff9933] hover:border-[#ff9933]/40 transition-colors flex items-center gap-1.5"
                        >
                          <Play size={12} /> {open ? 'Hide actions' : 'Run an action'}
                        </button>
                      )}
                      {def && (
                        <button
                          onClick={() => setDrawer(def)}
                          className="px-3 py-1.5 rounded-lg text-[12.5px] border border-[#b87333]/25 text-[#8a7d60] hover:text-[#ff9933] hover:border-[#ff9933]/40 transition-colors flex items-center gap-1.5"
                        >
                          <KeyRound size={12} /> Reconnect
                        </button>
                      )}
                      <button
                        onClick={() => disconnect(c.provider)}
                        className="px-3 py-1.5 rounded-lg text-[12.5px] border border-[#b87333]/25 text-[#8a7d60] hover:text-red-500 hover:border-red-400/40 transition-colors flex items-center gap-1.5 ml-auto"
                      >
                        <X size={12} /> Disconnect
                      </button>
                    </div>

                    {open && def && <ActionRunner def={def} authHeaders={authHeaders} onRan={loadEvents} />}
                  </motion.div>
                );
              })}
            </div>
          )
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Activity size={15} className="text-[#b5661a] dark:text-[#ff9933]" />
              <span className="text-[12.5px] text-[#7a6746] dark:text-[#a99a7c]">Every real API call Sutradhar and you have made.</span>
              <button onClick={loadEvents} className="ml-auto text-[12px] text-[#8a7d60] hover:text-[#ff9933] flex items-center gap-1">
                <RefreshCw size={12} /> Refresh
              </button>
            </div>
            {events.length === 0 ? (
              <div className="text-center py-16 text-[#8a7d60] text-sm">No connector activity yet.</div>
            ) : (
              <div className="space-y-1.5">
                {events.map((e) => (
                  <div key={e.id} className="flex items-start gap-2.5 p-3 rounded-xl border border-[#b87333]/15 bg-[#b87333]/5">
                    <span
                      className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                        e.status === 'ok' ? 'bg-emerald-500/12 text-emerald-600 dark:text-[#8fd4b4]' : 'bg-red-500/12 text-red-500'
                      }`}
                    >
                      {e.status === 'ok' ? <Check size={12} /> : <AlertTriangle size={12} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] text-[#6a4310] dark:text-[#ffd89b]">
                        {CONNECTOR_MAP[e.provider]?.name || e.provider} · <span className="text-[#8a7d60]">{e.action}</span>
                      </div>
                      <div className="text-[11.5px] text-[#7a6746] dark:text-[#a99a7c] break-words">{e.summary}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-[#8a7d60]">{relTime(e.created_at)}</div>
                      <div className="text-[10px] text-[#8a7d60]">{e.duration_ms}ms · {e.source}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {drawer && (
          <ConnectDrawer
            def={drawer}
            existing={byProvider[drawer.id] || null}
            authHeaders={authHeaders}
            onClose={() => setDrawer(null)}
            onDone={() => { load(); loadEvents(); flash(true, 'Connection verified and saved.'); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-xl text-[13px] shadow-2xl max-w-[92vw] flex items-center gap-2 ${
              toast.ok
                ? 'bg-emerald-600/95 text-white'
                : 'bg-red-600/95 text-white'
            }`}
          >
            {toast.ok ? <Check size={14} /> : <AlertTriangle size={14} />}
            <span className="min-w-0 break-words">{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
