// Shared runtime for real connector operations: credential resolution,
// automatic OAuth refresh, live verification, action execution and logging.
import { adminDb } from './firebase-admin.js';
import { decrypt, encrypt } from './_crypto.js';
import { PROVIDERS, ProviderError, getProvider, refreshAccessToken } from './_providers.js';

export { ProviderError };

/** Strip every secret before a row is sent to the browser. */
export function publicConnector(row) {
  if (!row) return null;
  const def = PROVIDERS[row.provider];
  return {
    id: row.id,
    provider: row.provider,
    name: def?.name || row.provider,
    auth_type: row.auth_type,
    account_id: row.account_id,
    account_name: row.account_name,
    account_label: row.account_label,
    account_avatar: row.account_avatar,
    account_url: row.account_url,
    scopes: row.scopes || [],
    status: row.status,
    last_error: row.last_error || '',
    last_verified_at: row.last_verified_at,
    token_expires_at: row.token_expires_at,
    connected_at: row.connected_at,
    has_refresh: !!row.refresh_token_enc,
    meta: sanitizeMeta(row.meta),
  };
}

function sanitizeMeta(meta) {
  const m = { ...(meta || {}) };
  delete m.client_secret;
  delete m.token;
  return m;
}

export async function logEvent({ userId, provider, action, status, durationMs, summary, detail, source }) {
  try {
    await adminDb.collection('connector_events').add({
      user_id: userId,
      provider,
      action,
      status: status || 'ok',
      duration_ms: Math.round(durationMs || 0),
      summary: String(summary || '').slice(0, 400),
      detail: detail || {},
      source: source || 'manual',
      created_at: new Date().toISOString(),
    });
  } catch {
    /* logging must never break the request */
  }
}

export async function loadConnector(userId, provider) {
  const snapshot = await adminDb.collection('connectors')
    .where('user_id', '==', userId)
    .where('provider', '==', provider)
    .limit(1)
    .get();
  return snapshot.docs[0] ? { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } : null;
}

/**
 * Return a usable plaintext access token for a connector, transparently
 * refreshing it against the provider's real token endpoint when expired.
 */
export async function resolveToken(row) {
  let token = decrypt(row.access_token_enc);
  if (!token) throw new ProviderError('Stored credential could not be read. Please reconnect.', 401);

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  const needsRefresh = !!expiresAt && expiresAt - Date.now() < 60_000;
  const refresh = decrypt(row.refresh_token_enc);

  if (needsRefresh && refresh) {
    const fresh = await refreshAccessToken(row.provider, refresh);
    token = fresh.access_token;
    await adminDb.collection('connectors').doc(row.id).update({
      access_token_enc: encrypt(fresh.access_token),
      refresh_token_enc: encrypt(fresh.refresh_token),
      token_expires_at: fresh.expires_in ? new Date(Date.now() + fresh.expires_in * 1000).toISOString() : null,
      status: 'connected',
      last_error: '',
      updated_at: new Date().toISOString(),
    });
  } else if (needsRefresh && !refresh) {
    await markError(row.id, 'Access token expired and no refresh token is available. Reconnect required.', 'expired');
    throw new ProviderError('This connection has expired. Please reconnect.', 401);
  }

  return token;
}

export async function markError(id, message, status = 'error') {
  await adminDb.collection('connectors').doc(id).update({
    status, last_error: String(message).slice(0, 500), updated_at: new Date().toISOString()
  });
}

export async function markHealthy(id, patch = {}) {
  await adminDb.collection('connectors').doc(id).update({
    status: 'connected',
    last_error: '',
    last_verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...patch,
  });
}

/**
 * Verify a raw credential against the provider's live API and persist the
 * connection. Nothing is stored unless the provider confirms the credential.
 */
export async function verifyAndSave({ userId, provider, token, refreshToken = '', expiresIn = 0, authType = 'token', scopes = [], extra = {} }) {
  const def = getProvider(provider);
  const cleaned = String(token || '').trim();
  if (!cleaned) throw new ProviderError(`${def.name}: a credential is required`, 400);

  const started = Date.now();
  let identity;
  try {
    identity = await def.verify(cleaned, extra);
  } catch (e) {
    await logEvent({
      userId,
      provider,
      action: 'verify',
      status: 'error',
      durationMs: Date.now() - started,
      summary: e.message,
      source: 'connect',
    });
    throw e instanceof ProviderError ? e : new ProviderError(e.message, 400);
  }

  const now = new Date().toISOString();
  const payload = {
    user_id: userId,
    provider,
    auth_type: authType,
    account_id: identity.account_id || '',
    account_name: identity.account_name || '',
    account_label: identity.account_label || '',
    account_avatar: identity.account_avatar || '',
    account_url: identity.account_url || '',
    scopes: scopes.length ? scopes : identity.scopes || [],
    access_token_enc: encrypt(cleaned),
    refresh_token_enc: refreshToken ? encrypt(refreshToken) : '',
    token_expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    meta: { ...(identity.meta || {}), ...extra },
    status: 'connected',
    last_error: '',
    last_verified_at: now,
    updated_at: now,
  };

  const existing = await loadConnector(userId, provider);
  let row;
  if (existing) {
    await adminDb.collection('connectors').doc(existing.id).update(payload);
    const updated = await adminDb.collection('connectors').doc(existing.id).get();
    row = { id: existing.id, ...updated.data() };
  } else {
    const docRef = await adminDb.collection('connectors').add({ ...payload, connected_at: now });
    const created = await docRef.get();
    row = { id: docRef.id, ...created.data() };
  }

  await logEvent({
    userId,
    provider,
    action: 'verify',
    status: 'ok',
    durationMs: Date.now() - started,
    summary: `Verified as ${identity.account_name || identity.account_id}`,
    source: 'connect',
  });

  return row;
}

/** Re-run the provider's identity endpoint to confirm the stored credential still works. */
export async function reverify(userId, provider) {
  const row = await loadConnector(userId, provider);
  if (!row) throw new ProviderError('Not connected', 404);
  const def = getProvider(provider);
  const started = Date.now();
  try {
    const token = await resolveToken(row);
    const identity = await def.verify(token, row.meta || {});
    await markHealthy(row.id, {
      account_id: identity.account_id || row.account_id,
      account_name: identity.account_name || row.account_name,
      account_label: identity.account_label || row.account_label,
      account_avatar: identity.account_avatar || row.account_avatar,
      account_url: identity.account_url || row.account_url,
    });
    await logEvent({
      userId,
      provider,
      action: 'verify',
      status: 'ok',
      durationMs: Date.now() - started,
      summary: `Live check passed for ${identity.account_name}`,
      source: 'test',
    });
    return { ok: true, identity };
  } catch (e) {
    await markError(row.id, e.message, e.status === 401 || e.status === 403 ? 'expired' : 'error');
    await logEvent({ userId, provider, action: 'verify', status: 'error', durationMs: Date.now() - started, summary: e.message, source: 'test' });
    throw e instanceof ProviderError ? e : new ProviderError(e.message, 400);
  }
}

/** Execute a real provider action with the user's stored credential. */
export async function runAction({ userId, provider, actionId, params = {}, source = 'manual' }) {
  const def = getProvider(provider);
  const action = def.actions?.[actionId];
  if (!action) throw new ProviderError(`Unknown action "${actionId}" for ${def.name}`, 404);

  const row = await loadConnector(userId, provider);
  if (!row) throw new ProviderError(`${def.name} is not connected`, 400);

  for (const p of action.params || []) {
    if (p.required && !String(params[p.name] ?? '').trim()) {
      throw new ProviderError(`${def.name}: "${p.name}" is required`, 400);
    }
  }

  const started = Date.now();
  try {
    const token = await resolveToken(row);
    const result = await action.run({ token, params, connector: row });
    const duration = Date.now() - started;
    await markHealthy(row.id);
    await logEvent({
      userId,
      provider,
      action: actionId,
      status: 'ok',
      durationMs: duration,
      summary: result.summary || 'Completed',
      detail: { rows: (result.rows || []).length, params: redactParams(params) },
      source,
    });
    return { ...result, provider, action: actionId, duration_ms: duration, executed_at: new Date().toISOString() };
  } catch (e) {
    const duration = Date.now() - started;
    if (e.status === 401 || e.status === 403) await markError(row.id, e.message, 'expired');
    else await markError(row.id, e.message);
    await logEvent({ userId, provider, action: actionId, status: 'error', durationMs: duration, summary: e.message, detail: { params: redactParams(params) }, source });
    throw e instanceof ProviderError ? e : new ProviderError(e.message, 500);
  }
}

function redactParams(params) {
  const out = {};
  for (const [k, v] of Object.entries(params || {})) {
    out[k] = typeof v === 'string' && v.length > 120 ? `${v.slice(0, 120)}…` : v;
  }
  return out;
}

/** Origin of the deployment, used to build real OAuth redirect URIs. */
export function originOf(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}