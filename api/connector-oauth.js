// Genuine OAuth 2.0 authorization-code flow for connectors.
//   GET /api/connector-oauth?provider=github     → { url } for the popup to open
//   GET /api/connector-oauth?code=...&state=...  → the provider's callback
//
// The callback exchanges the code at the vendor's real token endpoint, verifies
// the resulting token against the vendor's identity API, stores it encrypted,
// then closes the popup via postMessage.
import crypto from 'node:crypto';
import supabase from './db-client.js';
import { buildAuthorizeUrl, exchangeCode, getProvider, oauthConfig, ProviderError } from './_providers.js';
import { cors, getUser, originOf, verifyAndSave } from './_connectors-runtime.js';
import { randomToken, sha256base64url } from './_crypto.js';

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function closingPage({ ok, provider, message }) {
  const payload = JSON.stringify({
    type: ok ? 'connector-oauth-success' : 'connector-oauth-error',
    provider,
    message,
  });
  const heading = ok ? 'Connection established' : 'Connection failed';
  const colour = ok ? '#8fd4b4' : '#ff8f7a';
  const delay = ok ? 900 : 5000;
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${heading}</title><style>`,
    'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#141110;color:#ece5d8;',
    'font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;padding:24px}',
    '.card{max-width:440px;padding:32px;border-radius:20px;background:#1b1714;border:1px solid rgba(184,115,51,.28);text-align:center}',
    `h1{font-size:19px;margin:0 0 10px;color:${colour}}`,
    'p{font-size:14px;line-height:1.55;color:#a99a7c;margin:0}',
    '</style></head><body><div class="card">',
    `<h1>${heading}</h1><p>${escapeHtml(message)}</p></div><script>`,
    `try{window.opener&&window.opener.postMessage(${payload},'*');}catch(e){}`,
    `setTimeout(function(){try{window.close();}catch(e){}},${delay});`,
    '</script></body></html>',
  ].join('');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { provider, code, state, error: oauthError, error_description: errorDescription } = req.query || {};

  // ---------------------------------------------------------------- callback
  if (code || state || oauthError) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (oauthError) {
      return res
        .status(200)
        .send(closingPage({ ok: false, provider: provider || '', message: errorDescription || oauthError }));
    }
    try {
      const { data: st } = await supabase.from('oauth_states').select('*').eq('state', state).maybeSingle();
      if (!st) throw new ProviderError('This authorization link has expired. Please start the connection again.', 400);
      await supabase.from('oauth_states').delete().eq('state', state);

      if (Date.now() - new Date(st.created_at).getTime() > 15 * 60 * 1000) {
        throw new ProviderError('Authorization timed out. Please try again.', 400);
      }

      const tokens = await exchangeCode(st.provider, {
        code,
        redirectUri: st.redirect_uri,
        codeVerifier: st.code_verifier,
      });

      const row = await verifyAndSave({
        userId: st.user_id,
        provider: st.provider,
        token: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
        authType: 'oauth2',
        scopes: String(tokens.scope || '')
          .split(/[\s,]+/)
          .filter(Boolean),
      });

      return res.status(200).send(
        closingPage({
          ok: true,
          provider: st.provider,
          message: `${getProvider(st.provider).name} connected as ${row.account_name || row.account_id}.`,
        })
      );
    } catch (e) {
      return res.status(200).send(closingPage({ ok: false, provider: provider || '', message: e.message }));
    }
  }

  // ------------------------------------------------------------------- start
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!provider) return res.status(400).json({ error: 'provider required' });

  try {
    const cfg = oauthConfig(provider); // throws a helpful message when unconfigured
    const redirectUri = `${originOf(req)}/api/connector-oauth`;
    const stateToken = randomToken(24);
    let codeVerifier = '';
    let codeChallenge = '';
    if (cfg.pkce) {
      codeVerifier = crypto.randomBytes(48).toString('base64url');
      codeChallenge = sha256base64url(codeVerifier);
    }

    const { error } = await supabase.from('oauth_states').insert({
      state: stateToken,
      user_id: user.id,
      provider,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      origin: originOf(req),
    });
    if (error) throw new ProviderError(error.message, 500);

    // Housekeeping: drop states older than an hour.
    await supabase.from('oauth_states').delete().lt('created_at', new Date(Date.now() - 3600_000).toISOString());

    const url = buildAuthorizeUrl(provider, { redirectUri, state: stateToken, codeChallenge });
    return res.status(200).json({ url, redirectUri, scopes: cfg.scopes });
  } catch (err) {
    const status = err instanceof ProviderError ? err.status || 400 : 500;
    return res.status(status).json({ error: err.message });
  }
}
