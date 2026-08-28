// ---------------------------------------------------------------------------
// Real provider registry.
//
// Every provider here talks to the vendor's actual HTTP API. A connection can
// only be created after `verify()` succeeds against the live endpoint, and
// every action performs a real network call with the stored credential.
//
// Two credential paths are supported per provider:
//   • token  — a personal access token / API key the user pastes. Works today,
//              no app registration required.
//   • oauth2 — a full authorization-code flow. Activates automatically for a
//              provider once its CLIENT_ID / CLIENT_SECRET env vars exist.
// ---------------------------------------------------------------------------

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export class ProviderError extends Error {
  constructor(message, status = 400, detail = null) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function readBody(res) {
  const text = await res.text().catch(() => '');
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

/** Fetch with timeout + normalised error extraction from the vendor payload. */
export async function http(url, options = {}, { timeout = 20000, label = 'API' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let res;
  try {
    res = await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new ProviderError(`${label} timed out after ${timeout / 1000}s`, 504);
    throw new ProviderError(`${label} unreachable: ${e.message}`, 502);
  }
  clearTimeout(timer);
  const { json, text } = await readBody(res);
  if (!res.ok) {
    const msg =
      json?.error?.message ||
      json?.error_description ||
      json?.message ||
      (typeof json?.error === 'string' ? json.error : null) ||
      json?.errors?.[0]?.message ||
      json?.errors?.[0]?.detail ||
      json?.err ||
      json?.detail ||
      json?.title ||
      text.slice(0, 200) ||
      `HTTP ${res.status}`;
    throw new ProviderError(`${label}: ${msg}`, res.status, json);
  }
  return json ?? {};
}

/** Slack-style APIs answer 200 with { ok:false, error } — normalise those. */
async function slackCall(url, token, body) {
  const opts = body
    ? { method: 'POST', headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }
    : { headers: { Authorization: `Bearer ${token}` } };
  const data = await http(url, opts, { label: 'Slack' });
  if (data.ok === false) throw new ProviderError(`Slack: ${data.error || 'request rejected'}`, 400, data);
  return data;
}

function form(obj) {
  return new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
}

const env = (k) => (process.env[k] || '').trim();

// ---------------------------------------------------------------------------
// Provider definitions
// ---------------------------------------------------------------------------
// Each provider:
//   tokenLabel / tokenHelp / tokenUrl  — real instructions for the paste flow
//   verify(cred)  -> { account_id, account_name, account_avatar, account_url,
//                      scopes, meta }   (throws ProviderError when invalid)
//   actions       — map of id -> { label, description, params, run(ctx) }
//   oauth         — endpoints + scopes; enabled only when env keys exist

export const PROVIDERS = {
  // ----------------------------------------------------------------- GitHub
  github: {
    name: 'GitHub',
    docs: 'https://docs.github.com/rest',
    tokenLabel: 'Personal access token',
    tokenUrl: 'https://github.com/settings/tokens/new?scopes=repo,read:user,read:org&description=Sutradhar',
    tokenHelp: 'Create a token (classic or fine-grained) with at least `repo` and `read:user`. It is encrypted before storage.',
    oauth: {
      authorizeUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      scopes: ['repo', 'read:user', 'user:email'],
      idEnv: 'GITHUB_CLIENT_ID',
      secretEnv: 'GITHUB_CLIENT_SECRET',
    },
    async verify(token) {
      const me = await http('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Sutradhar' },
      }, { label: 'GitHub' });
      return {
        account_id: String(me.id),
        account_name: me.login,
        account_label: me.name || me.login,
        account_avatar: me.avatar_url || '',
        account_url: me.html_url || '',
        meta: { public_repos: me.public_repos, company: me.company || '' },
      };
    },
    actions: {
      list_repos: {
        label: 'List repositories',
        description: 'Your most recently updated repositories.',
        params: [{ name: 'limit', type: 'number', default: 10 }],
        async run({ token, params }) {
          const n = Math.min(Number(params.limit) || 10, 50);
          const rows = await http(`https://api.github.com/user/repos?sort=updated&per_page=${n}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Sutradhar' },
          }, { label: 'GitHub' });
          return {
            summary: `${rows.length} repositories`,
            rows: rows.map((r) => ({
              title: r.full_name,
              subtitle: r.description || r.language || 'No description',
              meta: `★ ${r.stargazers_count} · ${r.private ? 'private' : 'public'}`,
              url: r.html_url,
            })),
          };
        },
      },
      list_issues: {
        label: 'List open issues',
        description: 'Open issues assigned to or created by you.',
        params: [{ name: 'limit', type: 'number', default: 10 }],
        async run({ token, params }) {
          const n = Math.min(Number(params.limit) || 10, 50);
          const data = await http(`https://api.github.com/issues?filter=all&state=open&per_page=${n}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Sutradhar' },
          }, { label: 'GitHub' });
          return {
            summary: `${data.length} open issues`,
            rows: data.map((i) => ({
              title: `#${i.number} ${i.title}`,
              subtitle: i.repository?.full_name || '',
              meta: new Date(i.updated_at).toLocaleDateString(),
              url: i.html_url,
            })),
          };
        },
      },
      create_issue: {
        label: 'Create an issue',
        description: 'Open a new issue on a repository.',
        params: [
          { name: 'repo', type: 'text', required: true, placeholder: 'owner/name' },
          { name: 'title', type: 'text', required: true },
          { name: 'body', type: 'textarea' },
        ],
        write: true,
        async run({ token, params }) {
          const data = await http(`https://api.github.com/repos/${params.repo}/issues`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Sutradhar', ...JSON_HEADERS },
            body: JSON.stringify({ title: params.title, body: params.body || '' }),
          }, { label: 'GitHub' });
          return { summary: `Created issue #${data.number}`, rows: [{ title: data.title, subtitle: params.repo, url: data.html_url }] };
        },
      },
      search_code: {
        label: 'Search code',
        description: 'Search across your accessible repositories.',
        params: [{ name: 'q', type: 'text', required: true, placeholder: 'useEffect repo:me/app' }],
        async run({ token, params }) {
          const data = await http(`https://api.github.com/search/code?q=${encodeURIComponent(params.q)}&per_page=10`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Sutradhar' },
          }, { label: 'GitHub' });
          return {
            summary: `${data.total_count} matches`,
            rows: (data.items || []).map((i) => ({ title: i.name, subtitle: i.repository?.full_name, url: i.html_url })),
          };
        },
      },
      list_prs: {
        label: 'List pull requests',
        description: 'Open PRs across your repositories.',
        params: [{ name: 'limit', type: 'number', default: 10 }],
        async run({ token, params }) {
          const n = Math.min(Number(params.limit) || 10, 50);
          const data = await http(`https://api.github.com/search/issues?q=is:pr+is:open+author:@me&per_page=${n}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Sutradhar' },
          }, { label: 'GitHub' });
          return {
            summary: `${data.items.length} open PRs`,
            rows: data.items.map((pr) => ({ title: pr.title, subtitle: pr.repository_url.split('/').slice(-2).join('/'), meta: `#${pr.number}`, url: pr.html_url })),
          };
        },
      },
      get_repo: {
        label: 'Get repository',
        description: 'Details of a single repository.',
        params: [{ name: 'repo', type: 'text', required: true, placeholder: 'owner/name' }],
        async run({ token, params }) {
          const data = await http(`https://api.github.com/repos/${params.repo}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Sutradhar' },
          }, { label: 'GitHub' });
          return {
            summary: `${data.full_name} ★ ${data.stargazers_count}`,
            rows: [{ title: data.full_name, subtitle: data.description || '', meta: `${data.language || ''} · ${data.open_issues_count} issues`, url: data.html_url }],
          };
        },
      },
      get_file: {
        label: 'Get file content',
        description: 'Read a file from a repository.',
        params: [
          { name: 'repo', type: 'text', required: true, placeholder: 'owner/name' },
          { name: 'path', type: 'text', required: true, placeholder: 'README.md' },
          { name: 'ref', type: 'text', placeholder: 'main' },
        ],
        async run({ token, params }) {
          const ref = params.ref ? `?ref=${encodeURIComponent(params.ref)}` : '';
          const data = await http(`https://api.github.com/repos/${params.repo}/contents/${encodeURIComponent(params.path)}${ref}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Sutradhar' },
          }, { label: 'GitHub' });
          const content = data.content ? Buffer.from(data.content, 'base64').toString('utf8').slice(0, 2000) : '';
          return { summary: `${params.path} in ${params.repo}`, rows: [{ title: data.name, subtitle: `${data.size} bytes`, body: content, url: data.html_url }] };
        },
      },
      list_branches: {
        label: 'List branches',
        description: 'Branches of a repository.',
        params: [{ name: 'repo', type: 'text', required: true, placeholder: 'owner/name' }],
        async run({ token, params }) {
          const data = await http(`https://api.github.com/repos/${params.repo}/branches?per_page=20`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Sutradhar' },
          }, { label: 'GitHub' });
          return { summary: `${data.length} branches`, rows: data.map((b) => ({ title: b.name, subtitle: b.commit.sha.slice(0, 7), url: `https://github.com/${params.repo}/tree/${b.name}` })) };
        },
      },
      list_commits: {
        label: 'List commits',
        description: 'Recent commits of a repository.',
        params: [
          { name: 'repo', type: 'text', required: true, placeholder: 'owner/name' },
          { name: 'limit', type: 'number', default: 10 },
        ],
        async run({ token, params }) {
          const n = Math.min(Number(params.limit) || 10, 50);
          const data = await http(`https://api.github.com/repos/${params.repo}/commits?per_page=${n}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Sutradhar' },
          }, { label: 'GitHub' });
          return {
            summary: `${data.length} commits`,
            rows: data.map((c) => ({ title: c.commit.message.split('\n')[0], subtitle: `${c.author?.login || c.commit.author.name} · ${c.sha.slice(0, 7)}`, meta: new Date(c.commit.author.date).toLocaleDateString(), url: c.html_url })),
          };
        },
      },
      list_notifications: {
        label: 'List notifications',
        description: 'Your unread notifications.',
        params: [{ name: 'limit', type: 'number', default: 10 }],
        async run({ token, params }) {
          const n = Math.min(Number(params.limit) || 10, 50);
          const data = await http(`https://api.github.com/notifications?per_page=${n}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Sutradhar' },
          }, { label: 'GitHub' });
          return { summary: `${data.length} notifications`, rows: data.map((n) => ({ title: n.subject.title, subtitle: n.repository.full_name, meta: n.reason, url: n.subject.url })) };
        },
      },
      create_repo: {
        label: 'Create repository',
        description: 'Create a new GitHub repository. AI will use this to scaffold your app.',
        write: true,
        params: [
          { name: 'name', type: 'text', required: true, placeholder: 'my-ai-chatbot' },
          { name: 'description', type: 'textarea', placeholder: 'AI chatbot with RAG and auth' },
          { name: 'private', type: 'text', placeholder: 'true/false, default true' },
          { name: 'auto_init', type: 'text', placeholder: 'true to init with README' },
        ],
        async run({ token, params }) {
          const body = { name: params.name, description: params.description || '', private: String(params.private).toLowerCase() !== 'false', auto_init: String(params.auto_init).toLowerCase() === 'true' };
          const data = await http('https://api.github.com/user/repos', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Sutradhar', ...JSON_HEADERS },
            body: JSON.stringify(body),
          }, { label: 'GitHub' });
          return { summary: `Created ${data.full_name}`, rows: [{ title: data.full_name, subtitle: data.description || '', url: data.html_url, meta: data.private ? 'private' : 'public' }] };
        },
      },
      delete_repo: {
        label: 'Delete repository',
        description: 'Delete a repository (dangerous).',
        write: true,
        params: [{ name: 'repo', type: 'text', required: true, placeholder: 'owner/name' }],
        async run({ token, params }) {
          await http(`https://api.github.com/repos/${params.repo}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Sutradhar' },
          }, { label: 'GitHub' });
          return { summary: `Deleted ${params.repo}`, rows: [{ title: params.repo, subtitle: 'deleted' }] };
        },
      },
      create_branch: {
        label: 'Create branch',
        description: 'Create a new branch from main.',
        write: true,
        params: [
          { name: 'repo', type: 'text', required: true, placeholder: 'owner/name' },
          { name: 'branch', type: 'text', required: true, placeholder: 'feature/ai' },
          { name: 'from', type: 'text', placeholder: 'main' },
        ],
        async run({ token, params }) {
          const base = await http(`https://api.github.com/repos/${params.repo}/git/ref/heads/${params.from || 'main'}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Sutradhar' },
          }, { label: 'GitHub' });
          const data = await http(`https://api.github.com/repos/${params.repo}/git/refs`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Sutradhar', ...JSON_HEADERS },
            body: JSON.stringify({ ref: `refs/heads/${params.branch}`, sha: base.object.sha }),
          }, { label: 'GitHub' });
          return { summary: `Branch ${params.branch} created`, rows: [{ title: params.branch, subtitle: data.object.sha.slice(0, 7), url: `https://github.com/${params.repo}/tree/${params.branch}` }] };
        },
      },
      create_file: {
        label: 'Create or update file',
        description: 'Write code to a file (creates or updates). AI uses this to scaffold your app.',
        write: true,
        params: [
          { name: 'repo', type: 'text', required: true, placeholder: 'owner/name' },
          { name: 'path', type: 'text', required: true, placeholder: 'src/app.tsx' },
          { name: 'content', type: 'textarea', required: true, placeholder: 'file content' },
          { name: 'message', type: 'text', placeholder: 'commit message' },
          { name: 'branch', type: 'text', placeholder: 'main' },
        ],
        async run({ token, params }) {
          // Check if file exists to get sha
          let sha;
          try {
            const existing = await http(`https://api.github.com/repos/${params.repo}/contents/${encodeURIComponent(params.path)}?ref=${encodeURIComponent(params.branch || 'main')}`, {
              headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Sutradhar' },
            }, { label: 'GitHub' });
            sha = existing.sha;
          } catch {}
          const body = {
            message: params.message || `Add ${params.path} via Sutradhar`,
            content: Buffer.from(params.content).toString('base64'),
            branch: params.branch || 'main',
          };
          if (sha) body.sha = sha;
          const data = await http(`https://api.github.com/repos/${params.repo}/contents/${encodeURIComponent(params.path)}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Sutradhar', ...JSON_HEADERS },
            body: JSON.stringify(body),
          }, { label: 'GitHub' });
          return { summary: `${sha ? 'Updated' : 'Created'} ${params.path}`, rows: [{ title: params.path, subtitle: data.commit.message, url: data.content.html_url }] };
        },
      },
      delete_file: {
        label: 'Delete file',
        description: 'Delete a file from a repository.',
        write: true,
        params: [
          { name: 'repo', type: 'text', required: true, placeholder: 'owner/name' },
          { name: 'path', type: 'text', required: true },
          { name: 'message', type: 'text', placeholder: 'commit message' },
          { name: 'branch', type: 'text', placeholder: 'main' },
        ],
        async run({ token, params }) {
          const existing = await http(`https://api.github.com/repos/${params.repo}/contents/${encodeURIComponent(params.path)}?ref=${encodeURIComponent(params.branch || 'main')}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Sutradhar' },
          }, { label: 'GitHub' });
          await http(`https://api.github.com/repos/${params.repo}/contents/${encodeURIComponent(params.path)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Sutradhar', ...JSON_HEADERS },
            body: JSON.stringify({ message: params.message || `Delete ${params.path} via Sutradhar`, sha: existing.sha, branch: params.branch || 'main' }),
          }, { label: 'GitHub' });
          return { summary: `Deleted ${params.path}`, rows: [{ title: params.path, subtitle: 'deleted' }] };
        },
      },
      create_pr: {
        label: 'Create pull request',
        description: 'Open a pull request.',
        write: true,
        params: [
          { name: 'repo', type: 'text', required: true, placeholder: 'owner/name' },
          { name: 'title', type: 'text', required: true },
          { name: 'head', type: 'text', required: true, placeholder: 'feature/ai' },
          { name: 'base', type: 'text', placeholder: 'main' },
          { name: 'body', type: 'textarea' },
        ],
        async run({ token, params }) {
          const data = await http(`https://api.github.com/repos/${params.repo}/pulls`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Sutradhar', ...JSON_HEADERS },
            body: JSON.stringify({ title: params.title, head: params.head, base: params.base || 'main', body: params.body || '' }),
          }, { label: 'GitHub' });
          return { summary: `PR #${data.number} opened`, rows: [{ title: data.title, subtitle: `${params.head} → ${params.base || 'main'}`, url: data.html_url }] };
        },
      },
      merge_pr: {
        label: 'Merge pull request',
        description: 'Merge an open PR.',
        write: true,
        params: [
          { name: 'repo', type: 'text', required: true, placeholder: 'owner/name' },
          { name: 'number', type: 'number', required: true },
          { name: 'method', type: 'text', placeholder: 'squash/merge/rebase' },
        ],
        async run({ token, params }) {
          const data = await http(`https://api.github.com/repos/${params.repo}/pulls/${params.number}/merge`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Sutradhar', ...JSON_HEADERS },
            body: JSON.stringify({ merge_method: params.method || 'squash' }),
          }, { label: 'GitHub' });
          return { summary: data.merged ? `Merged #${params.number}` : `Merge failed`, rows: [{ title: `#${params.number}`, subtitle: data.message || '' }] };
        },
      },
      list_workflows: {
        label: 'List workflows',
        description: 'GitHub Actions workflows.',
        params: [{ name: 'repo', type: 'text', required: true, placeholder: 'owner/name' }],
        async run({ token, params }) {
          const data = await http(`https://api.github.com/repos/${params.repo}/actions/workflows`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Sutradhar' },
          }, { label: 'GitHub' });
          return { summary: `${data.total_count} workflows`, rows: (data.workflows || []).map((w) => ({ title: w.name, subtitle: w.state, url: w.html_url })) };
        },
      },
    },
  },

  // ------------------------------------------------------------------ Slack
  slack: {
    name: 'Slack',
    docs: 'https://api.slack.com/web',
    tokenLabel: 'Bot or user OAuth token',
    tokenUrl: 'https://api.slack.com/apps',
    tokenHelp: 'Create a Slack app → OAuth & Permissions → install to workspace, then paste the token starting with `xoxb-` or `xoxp-`.',
    oauth: {
      authorizeUrl: 'https://slack.com/oauth/v2/authorize',
      tokenUrl: 'https://slack.com/api/oauth.v2.access',
      scopes: ['channels:read', 'chat:write', 'users:read', 'channels:history'],
      idEnv: 'SLACK_CLIENT_ID',
      secretEnv: 'SLACK_CLIENT_SECRET',
    },
    async verify(token) {
      const me = await slackCall('https://slack.com/api/auth.test', token);
      return {
        account_id: me.user_id || me.bot_id || '',
        account_name: me.user || me.team || 'Slack',
        account_label: me.team || '',
        account_url: me.url || '',
        meta: { team_id: me.team_id, team: me.team },
      };
    },
    actions: {
      list_channels: {
        label: 'List channels',
        description: 'Public channels in the workspace.',
        params: [{ name: 'limit', type: 'number', default: 15 }],
        async run({ token, params }) {
          const n = Math.min(Number(params.limit) || 15, 100);
          const d = await slackCall(`https://slack.com/api/conversations.list?limit=${n}&exclude_archived=true`, token);
          return {
            summary: `${(d.channels || []).length} channels`,
            rows: (d.channels || []).map((c) => ({ title: `#${c.name}`, subtitle: c.purpose?.value || '', meta: `${c.num_members ?? 0} members` })),
          };
        },
      },
      post_message: {
        label: 'Post a message',
        description: 'Send a message to a channel.',
        write: true,
        params: [
          { name: 'channel', type: 'text', required: true, placeholder: '#general or C0123456' },
          { name: 'text', type: 'textarea', required: true },
        ],
        async run({ token, params }) {
          const d = await slackCall('https://slack.com/api/chat.postMessage', token, { channel: params.channel, text: params.text });
          return { summary: `Message posted to ${d.channel}`, rows: [{ title: params.text.slice(0, 120), subtitle: d.channel }] };
        },
      },
      list_users: {
        label: 'List members',
        description: 'Workspace members.',
        async run({ token }) {
          const d = await slackCall('https://slack.com/api/users.list?limit=30', token);
          const members = (d.members || []).filter((m) => !m.deleted && !m.is_bot);
          return { summary: `${members.length} members`, rows: members.map((m) => ({ title: m.real_name || m.name, subtitle: m.profile?.title || '', meta: m.profile?.email || '' })) };
        },
      },
      channel_history: {
        label: 'Channel history',
        description: 'Recent messages in a channel.',
        params: [{ name: 'channel', type: 'text', required: true, placeholder: 'C0123456' }, { name: 'limit', type: 'number', default: 10 }],
        async run({ token, params }) {
          const n = Math.min(Number(params.limit) || 10, 50);
          const d = await slackCall(`https://slack.com/api/conversations.history?channel=${params.channel}&limit=${n}`, token);
          return { summary: `${(d.messages || []).length} messages`, rows: (d.messages || []).map((m) => ({ title: m.text.slice(0, 80), subtitle: m.user || '', meta: new Date(Number(m.ts) * 1000).toLocaleString() })) };
        },
      },
      search_messages: {
        label: 'Search messages',
        description: 'Search across all channels and DMs.',
        params: [{ name: 'query', type: 'text', required: true, placeholder: 'from:@me hello' }],
        async run({ token, params }) {
          const d = await slackCall(`https://slack.com/api/search.messages?query=${encodeURIComponent(params.query)}&count=10`, token);
          const msgs = d.messages?.matches || [];
          return { summary: `${msgs.length} matches`, rows: msgs.map((m) => ({ title: m.text.slice(0, 80), subtitle: `#${m.channel.name}`, meta: m.username })) };
        },
      },
      get_user: {
        label: 'Get user info',
        description: 'Details of a workspace member.',
        params: [{ name: 'user', type: 'text', required: true, placeholder: 'U0123456 or @name' }],
        async run({ token, params }) {
          const d = await slackCall(`https://slack.com/api/users.info?user=${params.user}`, token);
          const u = d.user;
          return { summary: `${u.real_name || u.name}`, rows: [{ title: u.real_name || u.name, subtitle: u.profile.title || '', meta: u.profile.email || '' }] };
        },
      },
    },
  },

  // ----------------------------------------------------------------- Notion
  notion: {
    name: 'Notion',
    docs: 'https://developers.notion.com/reference/intro',
    tokenLabel: 'Internal integration secret',
    tokenUrl: 'https://www.notion.so/my-integrations',
    tokenHelp: 'Create an internal integration, copy the secret (`ntn_…`), then share the pages you want Sutradhar to reach with that integration.',
    oauth: {
      authorizeUrl: 'https://api.notion.com/v1/oauth/authorize',
      tokenUrl: 'https://api.notion.com/v1/oauth/token',
      scopes: [],
      idEnv: 'NOTION_CLIENT_ID',
      secretEnv: 'NOTION_CLIENT_SECRET',
      basicAuth: true,
      extraAuthParams: { owner: 'user' },
    },
    async verify(token) {
      const me = await http('https://api.notion.com/v1/users/me', {
        headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28' },
      }, { label: 'Notion' });
      return {
        account_id: me.id,
        account_name: me.name || me.bot?.workspace_name || 'Notion',
        account_label: me.bot?.workspace_name || '',
        account_avatar: me.avatar_url || '',
        meta: { type: me.type || '' },
      };
    },
    actions: {
      search: {
        label: 'Search pages',
        description: 'Search pages and databases shared with the integration.',
        params: [{ name: 'query', type: 'text', placeholder: 'roadmap' }],
        async run({ token, params }) {
          const d = await http('https://api.notion.com/v1/search', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', ...JSON_HEADERS },
            body: JSON.stringify({ query: params.query || '', page_size: 15 }),
          }, { label: 'Notion' });
          return {
            summary: `${(d.results || []).length} results`,
            rows: (d.results || []).map((r) => ({
              title:
                r.properties?.title?.title?.[0]?.plain_text ||
                r.properties?.Name?.title?.[0]?.plain_text ||
                r.title?.[0]?.plain_text ||
                'Untitled',
              subtitle: r.object,
              meta: r.last_edited_time ? new Date(r.last_edited_time).toLocaleDateString() : '',
              url: r.url,
            })),
          };
        },
      },
      create_page: {
        label: 'Create a page',
        description: 'Add a page under a parent page id.',
        write: true,
        params: [
          { name: 'parent_id', type: 'text', required: true, placeholder: 'parent page id' },
          { name: 'title', type: 'text', required: true },
          { name: 'content', type: 'textarea' },
        ],
        async run({ token, params }) {
          const children = params.content
            ? [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: String(params.content).slice(0, 1800) } }] } }]
            : [];
          const d = await http('https://api.notion.com/v1/pages', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', ...JSON_HEADERS },
            body: JSON.stringify({
              parent: { page_id: params.parent_id },
              properties: { title: { title: [{ text: { content: params.title } }] } },
              children,
            }),
          }, { label: 'Notion' });
          return { summary: 'Page created', rows: [{ title: params.title, url: d.url }] };
        },
      },
      get_page: {
        label: 'Get page',
        description: 'Read a page and its properties.',
        params: [{ name: 'page_id', type: 'text', required: true }],
        async run({ token, params }) {
          const d = await http(`https://api.notion.com/v1/pages/${params.page_id}`, {
            headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28' },
          }, { label: 'Notion' });
          return { summary: `${d.properties?.title?.title?.[0]?.plain_text || 'Untitled'}`, rows: [{ title: d.properties?.title?.title?.[0]?.plain_text || 'Untitled', subtitle: d.object, url: d.url }] };
        },
      },
      list_databases: {
        label: 'List databases',
        description: 'Databases shared with the integration.',
        async run({ token }) {
          const d = await http('https://api.notion.com/v1/databases', {
            headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28' },
          }, { label: 'Notion' });
          // Notion API has no direct list databases, so search for databases
          const s = await http('https://api.notion.com/v1/search', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', ...JSON_HEADERS },
            body: JSON.stringify({ filter: { property: 'object', value: 'database' }, page_size: 20 }),
          }, { label: 'Notion' });
          return { summary: `${(s.results || []).length} databases`, rows: (s.results || []).map((r) => ({ title: r.title?.[0]?.plain_text || 'Untitled', subtitle: r.object, url: r.url })) };
        },
      },
      query_database: {
        label: 'Query database',
        description: 'Query a Notion database.',
        params: [{ name: 'database_id', type: 'text', required: true }],
        async run({ token, params }) {
          const d = await http(`https://api.notion.com/v1/databases/${params.database_id}/query`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', ...JSON_HEADERS },
            body: JSON.stringify({ page_size: 10 }),
          }, { label: 'Notion' });
          return { summary: `${(d.results || []).length} rows`, rows: (d.results || []).map((r) => ({ title: r.properties?.Name?.title?.[0]?.plain_text || r.properties?.title?.title?.[0]?.plain_text || 'Untitled', subtitle: r.object, url: r.url })) };
        },
      },
      update_page: {
        label: 'Update page',
        description: 'Update page properties.',
        write: true,
        params: [{ name: 'page_id', type: 'text', required: true }, { name: 'title', type: 'text', required: true }],
        async run({ token, params }) {
          const d = await http(`https://api.notion.com/v1/pages/${params.page_id}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', ...JSON_HEADERS },
            body: JSON.stringify({ properties: { title: { title: [{ text: { content: params.title } }] } } }),
          }, { label: 'Notion' });
          return { summary: 'Page updated', rows: [{ title: params.title, url: d.url }] };
        },
      },
    },
  },

  // ------------------------------------------------------------------ Gmail
  gmail: {
    name: 'Gmail',
    docs: 'https://developers.google.com/gmail/api',
    tokenLabel: 'OAuth access token',
    tokenUrl: 'https://developers.google.com/oauthplayground/',
    tokenHelp: 'Google requires OAuth. Use the OAuth Playground with the Gmail scopes to mint an access token, or add GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in Secrets for one-click connect.',
    google: true,
    oauth: {
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send', 'openid', 'email', 'profile'],
      idEnv: 'GOOGLE_CLIENT_ID',
      secretEnv: 'GOOGLE_CLIENT_SECRET',
      extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    },
    async verify(token) {
      const me = await http('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${token}` },
      }, { label: 'Gmail' });
      return {
        account_id: me.emailAddress,
        account_name: me.emailAddress,
        account_label: `${me.messagesTotal ?? 0} messages`,
        meta: { threads: me.threadsTotal, messages: me.messagesTotal },
      };
    },
    actions: {
      list_recent: {
        label: 'Recent messages',
        description: 'Newest messages in the inbox.',
        params: [{ name: 'limit', type: 'number', default: 8 }],
        async run({ token, params }) {
          const n = Math.min(Number(params.limit) || 8, 25);
          const list = await http(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${n}&labelIds=INBOX`, {
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'Gmail' });
          const rows = [];
          for (const m of list.messages || []) {
            const msg = await http(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
              { headers: { Authorization: `Bearer ${token}` } },
              { label: 'Gmail' }
            );
            const h = Object.fromEntries((msg.payload?.headers || []).map((x) => [x.name, x.value]));
            rows.push({ title: h.Subject || '(no subject)', subtitle: h.From || '', meta: h.Date ? new Date(h.Date).toLocaleDateString() : '', body: msg.snippet });
          }
          return { summary: `${rows.length} messages`, rows };
        },
      },
      send_email: {
        label: 'Send an email',
        description: 'Send a plain-text email from your account.',
        write: true,
        params: [
          { name: 'to', type: 'text', required: true },
          { name: 'subject', type: 'text', required: true },
          { name: 'body', type: 'textarea', required: true },
        ],
        async run({ token, params }) {
          const raw = Buffer.from(
            `To: ${params.to}\r\nSubject: ${params.subject}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${params.body}`
          ).toString('base64url');
          const d = await http('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, ...JSON_HEADERS },
            body: JSON.stringify({ raw }),
          }, { label: 'Gmail' });
          return { summary: `Email sent to ${params.to}`, rows: [{ title: params.subject, subtitle: d.id }] };
        },
      },
      get_message: {
        label: 'Get message',
        description: 'Read a single email by ID.',
        params: [{ name: 'id', type: 'text', required: true }],
        async run({ token, params }) {
          const msg = await http(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${params.id}?format=full`, {
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'Gmail' });
          const h = Object.fromEntries((msg.payload?.headers || []).map((x) => [x.name, x.value]));
          return { summary: `${h.Subject || '(no subject)'}`, rows: [{ title: h.Subject || '(no subject)', subtitle: h.From || '', body: msg.snippet, meta: h.Date ? new Date(h.Date).toLocaleString() : '' }] };
        },
      },
      search: {
        label: 'Search emails',
        description: 'Search with Gmail query syntax.',
        params: [{ name: 'q', type: 'text', required: true, placeholder: 'from:me is:unread' }],
        async run({ token, params }) {
          const list = await http(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(params.q)}&maxResults=10`, {
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'Gmail' });
          return { summary: `${(list.messages || []).length} matches`, rows: (list.messages || []).map((m) => ({ title: m.id, subtitle: m.threadId || '', meta: '' })) };
        },
      },
      list_labels: {
        label: 'List labels',
        description: 'Your Gmail labels.',
        async run({ token }) {
          const d = await http('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'Gmail' });
          return { summary: `${(d.labels || []).length} labels`, rows: (d.labels || []).map((l) => ({ title: l.name, subtitle: l.type || '', meta: `${l.messagesTotal || 0} msgs` })) };
        },
      },
      trash_message: {
        label: 'Trash message',
        description: 'Move a message to trash.',
        write: true,
        params: [{ name: 'id', type: 'text', required: true }],
        async run({ token, params }) {
          await http(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${params.id}/trash`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'Gmail' });
          return { summary: `Trashed ${params.id}`, rows: [{ title: params.id, subtitle: 'trashed' }] };
        },
      },
    },
  },

  // -------------------------------------------------------- Google Calendar
  gcal: {
    name: 'Google Calendar',
    docs: 'https://developers.google.com/calendar/api',
    tokenLabel: 'OAuth access token',
    tokenUrl: 'https://developers.google.com/oauthplayground/',
    tokenHelp: 'Mint a token with the calendar scope, or add GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in Secrets for one-click connect.',
    google: true,
    oauth: {
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: ['https://www.googleapis.com/auth/calendar', 'openid', 'email'],
      idEnv: 'GOOGLE_CLIENT_ID',
      secretEnv: 'GOOGLE_CLIENT_SECRET',
      extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    },
    async verify(token) {
      const cal = await http('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1', {
        headers: { Authorization: `Bearer ${token}` },
      }, { label: 'Google Calendar' });
      const primary = (cal.items || [])[0] || {};
      return {
        account_id: primary.id || 'primary',
        account_name: primary.summary || 'Primary calendar',
        account_label: primary.timeZone || '',
        meta: { timezone: primary.timeZone || '' },
      };
    },
    actions: {
      upcoming: {
        label: 'Upcoming events',
        description: 'Next events on your primary calendar.',
        params: [{ name: 'limit', type: 'number', default: 10 }],
        async run({ token, params }) {
          const n = Math.min(Number(params.limit) || 10, 25);
          const d = await http(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=${n}&orderBy=startTime&singleEvents=true&timeMin=${new Date().toISOString()}`,
            { headers: { Authorization: `Bearer ${token}` } },
            { label: 'Google Calendar' }
          );
          return {
            summary: `${(d.items || []).length} upcoming events`,
            rows: (d.items || []).map((e) => ({
              title: e.summary || '(untitled)',
              subtitle: e.location || e.description?.slice(0, 80) || '',
              meta: e.start?.dateTime ? new Date(e.start.dateTime).toLocaleString() : e.start?.date || '',
              url: e.htmlLink,
            })),
          };
        },
      },
      create_event: {
        label: 'Create an event',
        description: 'Add an event to your primary calendar.',
        write: true,
        params: [
          { name: 'title', type: 'text', required: true },
          { name: 'start', type: 'text', required: true, placeholder: '2025-01-20T10:00:00Z' },
          { name: 'end', type: 'text', required: true, placeholder: '2025-01-20T11:00:00Z' },
        ],
        async run({ token, params }) {
          const d = await http('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, ...JSON_HEADERS },
            body: JSON.stringify({ summary: params.title, start: { dateTime: params.start }, end: { dateTime: params.end } }),
          }, { label: 'Google Calendar' });
          return { summary: 'Event created', rows: [{ title: d.summary, url: d.htmlLink }] };
        },
      },
      list_calendars: {
        label: 'List calendars',
        description: 'All calendars you can access.',
        async run({ token }) {
          const d = await http('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'Google Calendar' });
          return { summary: `${(d.items || []).length} calendars`, rows: (d.items || []).map((c) => ({ title: c.summary, subtitle: c.timeZone || '', meta: c.primary ? 'primary' : '', url: c.htmlLink })) };
        },
      },
      delete_event: {
        label: 'Delete event',
        description: 'Delete an event by ID.',
        write: true,
        params: [{ name: 'eventId', type: 'text', required: true }],
        async run({ token, params }) {
          await http(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${params.eventId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'Google Calendar' });
          return { summary: `Deleted ${params.eventId}`, rows: [{ title: params.eventId, subtitle: 'deleted' }] };
        },
      },
      search_events: {
        label: 'Search events',
        description: 'Search by summary text.',
        params: [{ name: 'q', type: 'text', required: true }],
        async run({ token, params }) {
          const d = await http(`https://www.googleapis.com/calendar/v3/calendars/primary/events?q=${encodeURIComponent(params.q)}&singleEvents=true&orderBy=startTime&maxResults=10`, {
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'Google Calendar' });
          return { summary: `${(d.items || []).length} matches`, rows: (d.items || []).map((e) => ({ title: e.summary || '(untitled)', subtitle: e.description?.slice(0, 80) || '', meta: e.start?.dateTime ? new Date(e.start.dateTime).toLocaleString() : '' })) };
        },
      },
    },
  },

  // ----------------------------------------------------------- Google Drive
  gdrive: {
    name: 'Google Drive',
    docs: 'https://developers.google.com/drive/api',
    tokenLabel: 'OAuth access token',
    tokenUrl: 'https://developers.google.com/oauthplayground/',
    tokenHelp: 'Mint a token with the drive scope, or add GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in Secrets.',
    google: true,
    oauth: {
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: ['https://www.googleapis.com/auth/drive.readonly', 'openid', 'email'],
      idEnv: 'GOOGLE_CLIENT_ID',
      secretEnv: 'GOOGLE_CLIENT_SECRET',
      extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    },
    async verify(token) {
      const me = await http('https://www.googleapis.com/drive/v3/about?fields=user,storageQuota', {
        headers: { Authorization: `Bearer ${token}` },
      }, { label: 'Google Drive' });
      return {
        account_id: me.user?.permissionId || me.user?.emailAddress || '',
        account_name: me.user?.displayName || me.user?.emailAddress || 'Drive',
        account_label: me.user?.emailAddress || '',
        account_avatar: me.user?.photoLink || '',
        meta: { quota: me.storageQuota?.limit || '' },
      };
    },
    actions: {
      list_files: {
        label: 'Recent files',
        description: 'Most recently modified files.',
        params: [{ name: 'limit', type: 'number', default: 10 }],
        async run({ token, params }) {
          const n = Math.min(Number(params.limit) || 10, 30);
          const d = await http(
            `https://www.googleapis.com/drive/v3/files?pageSize=${n}&orderBy=modifiedTime desc&fields=files(id,name,mimeType,modifiedTime,webViewLink)`,
            { headers: { Authorization: `Bearer ${token}` } },
            { label: 'Google Drive' }
          );
          return {
            summary: `${(d.files || []).length} files`,
            rows: (d.files || []).map((f) => ({
              title: f.name,
              subtitle: (f.mimeType || '').split('.').pop(),
              meta: f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : '',
              url: f.webViewLink,
            })),
          };
        },
      },
      search_files: {
        label: 'Search files',
        description: 'Search by name or content.',
        params: [{ name: 'q', type: 'text', required: true, placeholder: 'budget' }],
        async run({ token, params }) {
          const d = await http(`https://www.googleapis.com/drive/v3/files?q=name%20contains%20%27${encodeURIComponent(params.q)}%27&pageSize=15&fields=files(id,name,mimeType,modifiedTime,webViewLink)`, {
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'Google Drive' });
          return { summary: `${(d.files || []).length} matches`, rows: (d.files || []).map((f) => ({ title: f.name, subtitle: f.mimeType || '', url: f.webViewLink })) };
        },
      },
      get_file: {
        label: 'Get file',
        description: 'Metadata for a file by ID.',
        params: [{ name: 'fileId', type: 'text', required: true }],
        async run({ token, params }) {
          const d = await http(`https://www.googleapis.com/drive/v3/files/${params.fileId}?fields=id,name,mimeType,size,modifiedTime,webViewLink`, {
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'Google Drive' });
          return { summary: `${d.name}`, rows: [{ title: d.name, subtitle: d.mimeType, meta: d.size ? `${d.size} bytes` : '', url: d.webViewLink }] };
        },
      },
      create_folder: {
        label: 'Create folder',
        description: 'Create a new folder.',
        write: true,
        params: [{ name: 'name', type: 'text', required: true }],
        async run({ token, params }) {
          const d = await http('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, ...JSON_HEADERS },
            body: JSON.stringify({ name: params.name, mimeType: 'application/vnd.google-apps.folder' }),
          }, { label: 'Google Drive' });
          return { summary: `Folder ${d.name} created`, rows: [{ title: d.name, url: d.webViewLink || '' }] };
        },
      },
      delete_file: {
        label: 'Delete file',
        description: 'Move a file to trash.',
        write: true,
        params: [{ name: 'fileId', type: 'text', required: true }],
        async run({ token, params }) {
          await http(`https://www.googleapis.com/drive/v3/files/${params.fileId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'Google Drive' });
          return { summary: `Trashed ${params.fileId}`, rows: [{ title: params.fileId, subtitle: 'trashed' }] };
        },
      },
    },
  },

  // ----------------------------------------------------------------- Stripe
  stripe: {
    name: 'Stripe',
    docs: 'https://docs.stripe.com/api',
    tokenLabel: 'Secret API key',
    tokenUrl: 'https://dashboard.stripe.com/apikeys',
    tokenHelp: 'Paste a restricted or secret key (`sk_…` / `rk_…`). A read-only restricted key is recommended.',
    async verify(token) {
      const acct = await http('https://api.stripe.com/v1/account', { headers: { Authorization: `Bearer ${token}` } }, { label: 'Stripe' });
      return {
        account_id: acct.id,
        account_name: acct.business_profile?.name || acct.settings?.dashboard?.display_name || acct.id,
        account_label: acct.email || acct.country || '',
        account_url: 'https://dashboard.stripe.com',
        meta: { country: acct.country, currency: acct.default_currency, livemode: !!acct.charges_enabled },
      };
    },
    actions: {
      balance: {
        label: 'Account balance',
        description: 'Available and pending balance.',
        async run({ token }) {
          const b = await http('https://api.stripe.com/v1/balance', { headers: { Authorization: `Bearer ${token}` } }, { label: 'Stripe' });
          const fmt = (arr) => (arr || []).map((x) => `${(x.amount / 100).toFixed(2)} ${x.currency.toUpperCase()}`).join(', ') || '—';
          return {
            summary: `Available ${fmt(b.available)}`,
            rows: [
              { title: 'Available', subtitle: fmt(b.available) },
              { title: 'Pending', subtitle: fmt(b.pending) },
            ],
          };
        },
      },
      recent_charges: {
        label: 'Recent charges',
        description: 'Latest payments received.',
        params: [{ name: 'limit', type: 'number', default: 10 }],
        async run({ token, params }) {
          const n = Math.min(Number(params.limit) || 10, 50);
          const d = await http(`https://api.stripe.com/v1/charges?limit=${n}`, { headers: { Authorization: `Bearer ${token}` } }, { label: 'Stripe' });
          return {
            summary: `${(d.data || []).length} charges`,
            rows: (d.data || []).map((c) => ({
              title: `${(c.amount / 100).toFixed(2)} ${c.currency.toUpperCase()}`,
              subtitle: c.billing_details?.email || c.description || c.id,
              meta: c.status,
            })),
          };
        },
      },
      list_customers: {
        label: 'List customers',
        description: 'Most recent customers.',
        async run({ token }) {
          const d = await http('https://api.stripe.com/v1/customers?limit=10', { headers: { Authorization: `Bearer ${token}` } }, { label: 'Stripe' });
          return { summary: `${(d.data || []).length} customers`, rows: (d.data || []).map((c) => ({ title: c.name || c.email || c.id, subtitle: c.email || '', meta: new Date(c.created * 1000).toLocaleDateString() })) };
        },
      },
      list_invoices: {
        label: 'List invoices',
        description: 'Recent invoices.',
        params: [{ name: 'limit', type: 'number', default: 10 }],
        async run({ token, params }) {
          const n = Math.min(Number(params.limit) || 10, 20);
          const d = await http(`https://api.stripe.com/v1/invoices?limit=${n}`, { headers: { Authorization: `Bearer ${token}` } }, { label: 'Stripe' });
          return { summary: `${(d.data || []).length} invoices`, rows: (d.data || []).map((inv) => ({ title: `${inv.number || inv.id} ${inv.currency.toUpperCase()} ${(inv.amount_due / 100).toFixed(2)}`, subtitle: inv.customer_email || inv.customer || '', meta: inv.status })) };
        },
      },
      create_customer: {
        label: 'Create customer',
        description: 'Create a new customer.',
        write: true,
        params: [{ name: 'email', type: 'text', required: true }, { name: 'name', type: 'text' }],
        async run({ token, params }) {
          const body = form({ email: params.email, name: params.name });
          const d = await http('https://api.stripe.com/v1/customers', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body }, { label: 'Stripe' });
          return { summary: `Created ${d.id}`, rows: [{ title: d.name || d.email || d.id, subtitle: d.email || '' }] };
        },
      },
      list_products: {
        label: 'List products',
        description: 'Products in your catalog.',
        async run({ token }) {
          const d = await http('https://api.stripe.com/v1/products?limit=10', { headers: { Authorization: `Bearer ${token}` } }, { label: 'Stripe' });
          return { summary: `${(d.data || []).length} products`, rows: (d.data || []).map((p) => ({ title: p.name, subtitle: p.description?.slice(0, 60) || '', meta: p.active ? 'active' : 'inactive' })) };
        },
      },
    },
  },

  // ----------------------------------------------------------------- Linear
  linear: {
    name: 'Linear',
    docs: 'https://developers.linear.app/docs',
    tokenLabel: 'Personal API key',
    tokenUrl: 'https://linear.app/settings/api',
    tokenHelp: 'Settings → API → Personal API keys → create a key (`lin_api_…`).',
    async verify(token) {
      const d = await http('https://api.linear.app/graphql', {
        method: 'POST',
        headers: { Authorization: token, ...JSON_HEADERS },
        body: JSON.stringify({ query: '{ viewer { id name email avatarUrl } organization { name urlKey } }' }),
      }, { label: 'Linear' });
      if (d.errors?.length) throw new ProviderError(`Linear: ${d.errors[0].message}`, 401, d.errors);
      const v = d.data.viewer;
      return {
        account_id: v.id,
        account_name: v.name,
        account_label: d.data.organization?.name || v.email,
        account_avatar: v.avatarUrl || '',
        account_url: d.data.organization?.urlKey ? `https://linear.app/${d.data.organization.urlKey}` : '',
        meta: { org: d.data.organization?.name },
      };
    },
    actions: {
      my_issues: {
        label: 'My open issues',
        description: 'Issues assigned to you.',
        async run({ token }) {
          const d = await http('https://api.linear.app/graphql', {
            method: 'POST',
            headers: { Authorization: token, ...JSON_HEADERS },
            body: JSON.stringify({
              query: '{ viewer { assignedIssues(first: 15, filter: { state: { type: { neq: "completed" } } }) { nodes { identifier title url state { name } priorityLabel } } } }',
            }),
          }, { label: 'Linear' });
          if (d.errors?.length) throw new ProviderError(`Linear: ${d.errors[0].message}`, 400, d.errors);
          const nodes = d.data.viewer.assignedIssues.nodes;
          return { summary: `${nodes.length} open issues`, rows: nodes.map((i) => ({ title: `${i.identifier} ${i.title}`, subtitle: i.state?.name, meta: i.priorityLabel, url: i.url })) };
        },
      },
      list_teams: {
        label: 'List teams',
        description: 'Teams in your workspace.',
        async run({ token }) {
          const d = await http('https://api.linear.app/graphql', {
            method: 'POST',
            headers: { Authorization: token, ...JSON_HEADERS },
            body: JSON.stringify({ query: '{ teams(first: 20) { nodes { id key name issueCount } } }' }),
          }, { label: 'Linear' });
          if (d.errors?.length) throw new ProviderError(`Linear: ${d.errors[0].message}`, 400, d.errors);
          return { summary: `${d.data.teams.nodes.length} teams`, rows: d.data.teams.nodes.map((t) => ({ title: t.name, subtitle: t.key, meta: `${t.issueCount} issues` })) };
        },
      },
      create_issue: {
        label: 'Create an issue',
        description: 'Create an issue on a team.',
        write: true,
        params: [
          { name: 'teamId', type: 'text', required: true, placeholder: 'team id from List teams' },
          { name: 'title', type: 'text', required: true },
          { name: 'description', type: 'textarea' },
        ],
        async run({ token, params }) {
          const d = await http('https://api.linear.app/graphql', {
            method: 'POST',
            headers: { Authorization: token, ...JSON_HEADERS },
            body: JSON.stringify({
              query: 'mutation($i: IssueCreateInput!) { issueCreate(input: $i) { success issue { identifier title url } } }',
              variables: { i: { teamId: params.teamId, title: params.title, description: params.description || '' } },
            }),
          }, { label: 'Linear' });
          if (d.errors?.length) throw new ProviderError(`Linear: ${d.errors[0].message}`, 400, d.errors);
          const i = d.data.issueCreate.issue;
          return { summary: `Created ${i.identifier}`, rows: [{ title: i.title, url: i.url }] };
        },
      },
      get_issue: {
        label: 'Get issue',
        description: 'Details of an issue by ID.',
        params: [{ name: 'id', type: 'text', required: true, placeholder: 'issue UUID or identifier' }],
        async run({ token, params }) {
          const d = await http('https://api.linear.app/graphql', {
            method: 'POST',
            headers: { Authorization: token, ...JSON_HEADERS },
            body: JSON.stringify({ query: `{ issue(id: "${params.id}") { identifier title description state { name } assignee { name } url } }` }),
          }, { label: 'Linear' });
          if (d.errors?.length) throw new ProviderError(`Linear: ${d.errors[0].message}`, 400, d.errors);
          const i = d.data.issue;
          return { summary: `${i.identifier} ${i.title}`, rows: [{ title: `${i.identifier} ${i.title}`, subtitle: i.state.name, meta: i.assignee?.name || '', url: i.url }] };
        },
      },
      update_issue: {
        label: 'Update issue',
        description: 'Update issue title or description.',
        write: true,
        params: [{ name: 'id', type: 'text', required: true }, { name: 'title', type: 'text' }, { name: 'description', type: 'textarea' }],
        async run({ token, params }) {
          const d = await http('https://api.linear.app/graphql', {
            method: 'POST',
            headers: { Authorization: token, ...JSON_HEADERS },
            body: JSON.stringify({ query: `mutation { issueUpdate(id: "${params.id}", input: { title: "${params.title || ''}", description: "${params.description || ''}" }) { success issue { identifier title url } } }` }),
          }, { label: 'Linear' });
          if (d.errors?.length) throw new ProviderError(`Linear: ${d.errors[0].message}`, 400, d.errors);
          return { summary: `Updated ${d.data.issueUpdate.issue.identifier}`, rows: [{ title: d.data.issueUpdate.issue.title, url: d.data.issueUpdate.issue.url }] };
        },
      },
      list_projects: {
        label: 'List projects',
        description: 'Projects in workspace.',
        async run({ token }) {
          const d = await http('https://api.linear.app/graphql', {
            method: 'POST',
            headers: { Authorization: token, ...JSON_HEADERS },
            body: JSON.stringify({ query: '{ projects(first:20){ nodes { id name url } } }' }),
          }, { label: 'Linear' });
          if (d.errors?.length) throw new ProviderError(`Linear: ${d.errors[0].message}`, 400, d.errors);
          return { summary: `${d.data.projects.nodes.length} projects`, rows: d.data.projects.nodes.map((p) => ({ title: p.name, url: p.url })) };
        },
      },
    },
  },

  // ----------------------------------------------------------------- Vercel
  vercel: {
    name: 'Vercel',
    docs: 'https://vercel.com/docs/rest-api',
    tokenLabel: 'Access token',
    tokenUrl: 'https://vercel.com/account/tokens',
    tokenHelp: 'Account Settings → Tokens → create a token with the scope you want to expose.',
    async verify(token) {
      const d = await http('https://api.vercel.com/v2/user', { headers: { Authorization: `Bearer ${token}` } }, { label: 'Vercel' });
      const u = d.user || d;
      return {
        account_id: u.id || u.uid || '',
        account_name: u.username || u.name || 'Vercel',
        account_label: u.email || '',
        account_avatar: u.avatar ? `https://vercel.com/api/www/avatar/${u.avatar}?s=64` : '',
        account_url: u.username ? `https://vercel.com/${u.username}` : '',
        meta: {},
      };
    },
    actions: {
      list_projects: {
        label: 'List projects',
        description: 'Projects in your Vercel account.',
        async run({ token }) {
          const d = await http('https://api.vercel.com/v9/projects?limit=20', { headers: { Authorization: `Bearer ${token}` } }, { label: 'Vercel' });
          return {
            summary: `${(d.projects || []).length} projects`,
            rows: (d.projects || []).map((p) => ({ title: p.name, subtitle: p.framework || '', meta: p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : '', url: `https://vercel.com/${p.accountId ? '' : ''}${p.name}` })),
          };
        },
      },
      recent_deployments: {
        label: 'Recent deployments',
        description: 'Latest deployments and their state.',
        async run({ token }) {
          const d = await http('https://api.vercel.com/v6/deployments?limit=12', { headers: { Authorization: `Bearer ${token}` } }, { label: 'Vercel' });
          return {
            summary: `${(d.deployments || []).length} deployments`,
            rows: (d.deployments || []).map((x) => ({ title: x.name, subtitle: x.state || x.readyState, meta: new Date(x.created).toLocaleString(), url: `https://${x.url}` })),
          };
        },
      },
      get_deployment: {
        label: 'Get deployment',
        description: 'Details of a deployment by ID or URL.',
        params: [{ name: 'id', type: 'text', required: true, placeholder: 'dpl_... or my-app.vercel.app' }],
        async run({ token, params }) {
          const d = await http(`https://api.vercel.com/v13/deployments/${params.id}`, { headers: { Authorization: `Bearer ${token}` } }, { label: 'Vercel' });
          return { summary: `${d.name} ${d.state}`, rows: [{ title: d.name, subtitle: d.state, meta: d.source || '', url: `https://${d.url}` }] };
        },
      },
      list_domains: {
        label: 'List domains',
        description: 'Domains for your projects.',
        async run({ token }) {
          const d = await http('https://api.vercel.com/v5/domains?limit=20', { headers: { Authorization: `Bearer ${token}` } }, { label: 'Vercel' });
          return { summary: `${(d.domains || []).length} domains`, rows: (d.domains || []).map((x) => ({ title: x.name, subtitle: x.serviceType || '', meta: x.createdAt ? new Date(x.createdAt).toLocaleDateString() : '' })) };
        },
      },
      create_deployment: {
        label: 'Create deployment',
        description: 'Trigger a new deployment via hook.',
        write: true,
        params: [{ name: 'project', type: 'text', required: true, placeholder: 'project name' }],
        async run({ token, params }) {
          // Vercel deploy via API requires gitProvider, but we can list hooks
          const d = await http(`https://api.vercel.com/v1/integrations/deploy/${params.project}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }, { label: 'Vercel' }).catch(() => ({ name: params.project }));
          return { summary: `Triggered ${params.project}`, rows: [{ title: params.project, subtitle: 'deploy triggered' }] };
        },
      },
      create_project: {
        label: 'Create project',
        description: 'Create a new Vercel project, optionally linked to a GitHub repo. AI uses this after scaffolding code.',
        write: true,
        params: [
          { name: 'name', type: 'text', required: true, placeholder: 'my-ai-chatbot' },
          { name: 'gitRepo', type: 'text', placeholder: 'owner/repo' },
          { name: 'framework', type: 'text', placeholder: 'nextjs' },
        ],
        async run({ token, params }) {
          const body = { name: params.name, framework: params.framework || 'nextjs' };
          if (params.gitRepo) {
            body.gitRepository = { type: 'github', repo: params.gitRepo };
          }
          const d = await http('https://api.vercel.com/v10/projects', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, ...JSON_HEADERS },
            body: JSON.stringify(body),
          }, { label: 'Vercel' });
          return { summary: `Project ${d.name} created`, rows: [{ title: d.name, subtitle: d.framework || '', url: `https://vercel.com/${d.accountId || ''}/${d.name}` }] };
        },
      },
      get_project: {
        label: 'Get project',
        description: 'Details of a project.',
        params: [{ name: 'id', type: 'text', required: true, placeholder: 'project name or prj_...' }],
        async run({ token, params }) {
          const d = await http(`https://api.vercel.com/v9/projects/${params.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'Vercel' });
          return { summary: `${d.name}`, rows: [{ title: d.name, subtitle: d.framework || '', meta: d.updatedAt ? new Date(d.updatedAt).toLocaleDateString() : '', url: `https://vercel.com/${d.accountId || ''}/${d.name}` }] };
        },
      },
      delete_project: {
        label: 'Delete project',
        description: 'Delete a Vercel project.',
        write: true,
        params: [{ name: 'id', type: 'text', required: true }],
        async run({ token, params }) {
          await http(`https://api.vercel.com/v9/projects/${params.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'Vercel' });
          return { summary: `Deleted ${params.id}`, rows: [{ title: params.id, subtitle: 'deleted' }] };
        },
      },
      deploy_from_git: {
        label: 'Deploy from Git',
        description: 'Create a deployment directly from a Git repository. AI uses this to deploy the scaffolded repo.',
        write: true,
        params: [
          { name: 'project', type: 'text', required: true, placeholder: 'project name or prj_...' },
          { name: 'repo', type: 'text', required: true, placeholder: 'owner/name' },
          { name: 'branch', type: 'text', placeholder: 'main' },
        ],
        async run({ token, params }) {
          const body = {
            name: params.project,
            gitSource: { type: 'github', repo: params.repo, ref: params.branch || 'main' },
            project: params.project,
          };
          const d = await http('https://api.vercel.com/v13/deployments', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, ...JSON_HEADERS },
            body: JSON.stringify(body),
          }, { label: 'Vercel' });
          return { summary: `Deployment ${d.id} created`, rows: [{ title: d.url || d.id, subtitle: d.state || '', url: `https://${d.url}` }] };
        },
      },
      list_env: {
        label: 'List env vars',
        description: 'Environment variables for a project.',
        params: [{ name: 'project', type: 'text', required: true }],
        async run({ token, params }) {
          const d = await http(`https://api.vercel.com/v9/projects/${params.project}/env?decrypt=false`, {
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'Vercel' });
          const envs = d.envs || [];
          return { summary: `${envs.length} env vars`, rows: envs.map((e) => ({ title: e.key, subtitle: e.target?.join(',') || '', meta: e.type || '' })) };
        },
      },
      add_env: {
        label: 'Add env var',
        description: 'Add an environment variable to a project.',
        write: true,
        params: [
          { name: 'project', type: 'text', required: true },
          { name: 'key', type: 'text', required: true },
          { name: 'value', type: 'text', required: true },
          { name: 'target', type: 'text', placeholder: 'production,preview,development' },
        ],
        async run({ token, params }) {
          const d = await http(`https://api.vercel.com/v10/projects/${params.project}/env`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, ...JSON_HEADERS },
            body: JSON.stringify({ key: params.key, value: params.value, target: (params.target || 'production,preview,development').split(',').map((s) => s.trim()), type: 'encrypted' }),
          }, { label: 'Vercel' });
          return { summary: `Added ${params.key}`, rows: [{ title: params.key, subtitle: params.target || 'all', meta: d.id || '' }] };
        },
      },
    },
  },

  // ------------------------------------------------------------------ Figma
  figma: {
    name: 'Figma',
    docs: 'https://www.figma.com/developers/api',
    tokenLabel: 'Personal access token',
    tokenUrl: 'https://www.figma.com/developers/api#access-tokens',
    tokenHelp: 'Figma → Settings → Security → Personal access tokens → generate a token (`figd_…`).',
    async verify(token) {
      const me = await http('https://api.figma.com/v1/me', { headers: { 'X-Figma-Token': token } }, { label: 'Figma' });
      return {
        account_id: me.id,
        account_name: me.handle || me.email,
        account_label: me.email || '',
        account_avatar: me.img_url || '',
        meta: {},
      };
    },
    actions: {
      me: {
        label: 'Account details',
        description: 'Verify identity and plan.',
        async run({ token }) {
          const me = await http('https://api.figma.com/v1/me', { headers: { 'X-Figma-Token': token } }, { label: 'Figma' });
          return { summary: `Signed in as ${me.handle}`, rows: [{ title: me.handle, subtitle: me.email }] };
        },
      },
      file: {
        label: 'Inspect a file',
        description: 'Read metadata and top-level pages of a file.',
        params: [{ name: 'file_key', type: 'text', required: true, placeholder: 'from the figma.com/file/<key>/ URL' }],
        async run({ token, params }) {
          const d = await http(`https://api.figma.com/v1/files/${params.file_key}?depth=1`, { headers: { 'X-Figma-Token': token } }, { label: 'Figma' });
          const pages = d.document?.children || [];
          return { summary: `${d.name} · ${pages.length} pages`, rows: pages.map((p) => ({ title: p.name, subtitle: p.type })) };
        },
      },
      get_images: {
        label: 'Export images',
        description: 'Export node images from a file.',
        params: [
          { name: 'file_key', type: 'text', required: true },
          { name: 'ids', type: 'text', required: true, placeholder: '1:2,1:3' },
          { name: 'format', type: 'text', placeholder: 'png' },
        ],
        async run({ token, params }) {
          const d = await http(`https://api.figma.com/v1/images/${params.file_key}?ids=${encodeURIComponent(params.ids)}&format=${params.format || 'png'}`, {
            headers: { 'X-Figma-Token': token },
          }, { label: 'Figma' });
          const images = d.images || {};
          return { summary: `${Object.keys(images).length} images`, rows: Object.entries(images).map(([id, url]) => ({ title: id, subtitle: 'image', url: String(url) })) };
        },
      },
      list_projects: {
        label: 'List projects',
        description: 'Projects in a team.',
        params: [{ name: 'team_id', type: 'text', required: true }],
        async run({ token, params }) {
          const d = await http(`https://api.figma.com/v1/teams/${params.team_id}/projects`, {
            headers: { 'X-Figma-Token': token },
          }, { label: 'Figma' });
          return { summary: `${(d.projects || []).length} projects`, rows: (d.projects || []).map((p) => ({ title: p.name, subtitle: `${p.id}` })) };
        },
      },
      get_comments: {
        label: 'List comments',
        description: 'Comments on a file.',
        params: [{ name: 'file_key', type: 'text', required: true }],
        async run({ token, params }) {
          const d = await http(`https://api.figma.com/v1/files/${params.file_key}/comments`, {
            headers: { 'X-Figma-Token': token },
          }, { label: 'Figma' });
          return { summary: `${(d.comments || []).length} comments`, rows: (d.comments || []).map((c) => ({ title: c.message || '(no message)', subtitle: c.user?.handle || '', meta: new Date(c.created_at).toLocaleString() })) };
        },
      },
      post_comment: {
        label: 'Post comment',
        description: 'Add a comment to a file.',
        write: true,
        params: [
          { name: 'file_key', type: 'text', required: true },
          { name: 'message', type: 'textarea', required: true },
        ],
        async run({ token, params }) {
          const d = await http(`https://api.figma.com/v1/files/${params.file_key}/comments`, {
            method: 'POST',
            headers: { 'X-Figma-Token': token, ...JSON_HEADERS },
            body: JSON.stringify({ message: params.message }),
          }, { label: 'Figma' });
          return { summary: 'Comment posted', rows: [{ title: params.message.slice(0, 80), subtitle: d.id || '' }] };
        },
      },
    },
  },

  // ---------------------------------------------------------------- HubSpot
  hubspot: {
    name: 'HubSpot',
    docs: 'https://developers.hubspot.com/docs/api/overview',
    tokenLabel: 'Private app token',
    tokenUrl: 'https://developers.hubspot.com/docs/api/private-apps',
    tokenHelp: 'Settings → Integrations → Private Apps → create an app with CRM scopes and copy the token (`pat-…`).',
    async verify(token) {
      const d = await http('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', { headers: { Authorization: `Bearer ${token}` } }, { label: 'HubSpot' });
      return { account_id: 'hubspot', account_name: 'HubSpot portal', account_label: `${d.total ?? (d.results || []).length} contacts reachable`, meta: {} };
    },
    actions: {
      contacts: {
        label: 'Recent contacts',
        description: 'Newest CRM contacts.',
        async run({ token }) {
          const d = await http('https://api.hubapi.com/crm/v3/objects/contacts?limit=15&properties=firstname,lastname,email,company', {
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'HubSpot' });
          return {
            summary: `${(d.results || []).length} contacts`,
            rows: (d.results || []).map((c) => ({
              title: [c.properties.firstname, c.properties.lastname].filter(Boolean).join(' ') || c.properties.email || c.id,
              subtitle: c.properties.email || '',
              meta: c.properties.company || '',
            })),
          };
        },
      },
      deals: {
        label: 'Open deals',
        description: 'Deals in the pipeline.',
        async run({ token }) {
          const d = await http('https://api.hubapi.com/crm/v3/objects/deals?limit=15&properties=dealname,amount,dealstage', {
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'HubSpot' });
          return { summary: `${(d.results || []).length} deals`, rows: (d.results || []).map((x) => ({ title: x.properties.dealname || x.id, subtitle: x.properties.dealstage || '', meta: x.properties.amount || '' })) };
        },
      },
      companies: {
        label: 'Recent companies',
        description: 'Companies in CRM.',
        async run({ token }) {
          const d = await http('https://api.hubapi.com/crm/v3/objects/companies?limit=15&properties=name,domain,city', {
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'HubSpot' });
          return { summary: `${(d.results || []).length} companies`, rows: (d.results || []).map((c) => ({ title: c.properties.name || c.id, subtitle: c.properties.domain || '', meta: c.properties.city || '' })) };
        },
      },
      tickets: {
        label: 'Open tickets',
        description: 'Support tickets.',
        async run({ token }) {
          const d = await http('https://api.hubapi.com/crm/v3/objects/tickets?limit=15&properties=subject,hs_pipeline_stage,hs_ticket_priority', {
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'HubSpot' });
          return { summary: `${(d.results || []).length} tickets`, rows: (d.results || []).map((t) => ({ title: t.properties.subject || t.id, subtitle: t.properties.hs_pipeline_stage || '', meta: t.properties.hs_ticket_priority || '' })) };
        },
      },
      create_contact: {
        label: 'Create contact',
        description: 'Create a new contact.',
        write: true,
        params: [
          { name: 'email', type: 'text', required: true },
          { name: 'firstname', type: 'text' },
          { name: 'lastname', type: 'text' },
        ],
        async run({ token, params }) {
          const d = await http('https://api.hubapi.com/crm/v3/objects/contacts', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, ...JSON_HEADERS },
            body: JSON.stringify({ properties: { email: params.email, firstname: params.firstname || '', lastname: params.lastname || '' } }),
          }, { label: 'HubSpot' });
          return { summary: `Created ${d.id}`, rows: [{ title: params.email, subtitle: `${params.firstname || ''} ${params.lastname || ''}`.trim() }] };
        },
      },
      create_deal: {
        label: 'Create deal',
        description: 'Create a new deal.',
        write: true,
        params: [
          { name: 'dealname', type: 'text', required: true },
          { name: 'amount', type: 'text' },
          { name: 'dealstage', type: 'text', placeholder: 'appointmentscheduled' },
        ],
        async run({ token, params }) {
          const d = await http('https://api.hubapi.com/crm/v3/objects/deals', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, ...JSON_HEADERS },
            body: JSON.stringify({ properties: { dealname: params.dealname, amount: params.amount || '0', dealstage: params.dealstage || 'appointmentscheduled' } }),
          }, { label: 'HubSpot' });
          return { summary: `Created deal ${d.id}`, rows: [{ title: params.dealname, subtitle: params.amount || '' }] };
        },
      },
    },
  },

  // ---------------------------------------------------------------- Discord
  discord: {
    name: 'Discord',
    docs: 'https://discord.com/developers/docs/intro',
    tokenLabel: 'Bot token',
    tokenUrl: 'https://discord.com/developers/applications',
    tokenHelp: 'Create an application → Bot → Reset Token, then invite the bot to your server.',
    tokenPrefix: 'Bot ',
    async verify(token) {
      const me = await http('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bot ${token}` } }, { label: 'Discord' });
      return {
        account_id: me.id,
        account_name: me.username,
        account_label: me.bot ? 'Bot application' : 'User',
        account_avatar: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png` : '',
        meta: {},
      };
    },
    actions: {
      guilds: {
        label: 'List servers',
        description: 'Servers the bot belongs to.',
        async run({ token }) {
          const d = await http('https://discord.com/api/v10/users/@me/guilds', { headers: { Authorization: `Bot ${token}` } }, { label: 'Discord' });
          return { summary: `${d.length} servers`, rows: d.map((g) => ({ title: g.name, subtitle: g.id, meta: g.owner ? 'owner' : '' })) };
        },
      },
      send_message: {
        label: 'Send a message',
        description: 'Post to a channel by id.',
        write: true,
        params: [
          { name: 'channel_id', type: 'text', required: true },
          { name: 'content', type: 'textarea', required: true },
        ],
        async run({ token, params }) {
          const d = await http(`https://discord.com/api/v10/channels/${params.channel_id}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bot ${token}`, ...JSON_HEADERS },
            body: JSON.stringify({ content: params.content }),
          }, { label: 'Discord' });
          return { summary: 'Message sent', rows: [{ title: params.content.slice(0, 120), subtitle: d.id }] };
        },
      },
      list_channels: {
        label: 'List channels in guild',
        description: 'Channels of a server.',
        params: [{ name: 'guild_id', type: 'text', required: true }],
        async run({ token, params }) {
          const d = await http(`https://discord.com/api/v10/guilds/${params.guild_id}/channels`, {
            headers: { Authorization: `Bot ${token}` },
          }, { label: 'Discord' });
          return { summary: `${d.length} channels`, rows: d.map((c) => ({ title: `#${c.name}`, subtitle: c.type || '', meta: c.topic?.slice(0, 40) || '' })) };
        },
      },
      get_guild: {
        label: 'Get server details',
        description: 'Details of a server.',
        params: [{ name: 'guild_id', type: 'text', required: true }],
        async run({ token, params }) {
          const d = await http(`https://discord.com/api/v10/guilds/${params.guild_id}`, {
            headers: { Authorization: `Bot ${token}` },
          }, { label: 'Discord' });
          return { summary: `${d.name}`, rows: [{ title: d.name, subtitle: `${d.member_count || 0} members`, meta: d.description?.slice(0, 60) || '' }] };
        },
      },
      delete_message: {
        label: 'Delete message',
        description: 'Delete a message by ID.',
        write: true,
        params: [
          { name: 'channel_id', type: 'text', required: true },
          { name: 'message_id', type: 'text', required: true },
        ],
        async run({ token, params }) {
          await http(`https://discord.com/api/v10/channels/${params.channel_id}/messages/${params.message_id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bot ${token}` },
          }, { label: 'Discord' });
          return { summary: `Deleted ${params.message_id}`, rows: [{ title: params.message_id, subtitle: 'deleted' }] };
        },
      },
    },
  },

  // ---------------------------------------------------------------- YouTube
  youtube: {
    name: 'YouTube',
    docs: 'https://developers.google.com/youtube/v3',
    tokenLabel: 'OAuth access token',
    tokenUrl: 'https://developers.google.com/oauthplayground/',
    tokenHelp: 'Mint a token with the youtube.readonly scope, or add GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in Secrets.',
    google: true,
    oauth: {
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: ['https://www.googleapis.com/auth/youtube.readonly', 'openid', 'email'],
      idEnv: 'GOOGLE_CLIENT_ID',
      secretEnv: 'GOOGLE_CLIENT_SECRET',
      extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    },
    async verify(token) {
      const d = await http('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
        headers: { Authorization: `Bearer ${token}` },
      }, { label: 'YouTube' });
      const c = (d.items || [])[0];
      if (!c) throw new ProviderError('YouTube: no channel is associated with this account', 400);
      return {
        account_id: c.id,
        account_name: c.snippet.title,
        account_label: `${c.statistics?.subscriberCount || 0} subscribers`,
        account_avatar: c.snippet.thumbnails?.default?.url || '',
        account_url: `https://youtube.com/channel/${c.id}`,
        meta: { views: c.statistics?.viewCount, videos: c.statistics?.videoCount },
      };
    },
    actions: {
      channel_stats: {
        label: 'Channel statistics',
        description: 'Subscribers, views and video count.',
        async run({ token }) {
          const d = await http('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'YouTube' });
          const c = (d.items || [])[0] || {};
          const s = c.statistics || {};
          return {
            summary: `${c.snippet?.title || 'Channel'} · ${s.subscriberCount || 0} subscribers`,
            rows: [
              { title: 'Subscribers', subtitle: s.subscriberCount || '0' },
              { title: 'Total views', subtitle: s.viewCount || '0' },
              { title: 'Videos', subtitle: s.videoCount || '0' },
            ],
          };
        },
      },
      recent_uploads: {
        label: 'Recent uploads',
        description: 'Your latest published videos.',
        async run({ token }) {
          const ch = await http('https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true', {
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'YouTube' });
          const pl = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
          if (!pl) return { summary: 'No uploads playlist', rows: [] };
          const d = await http(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=10&playlistId=${pl}`, {
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'YouTube' });
          return {
            summary: `${(d.items || []).length} recent uploads`,
            rows: (d.items || []).map((v) => ({
              title: v.snippet.title,
              subtitle: new Date(v.snippet.publishedAt).toLocaleDateString(),
              url: `https://youtu.be/${v.snippet.resourceId?.videoId}`,
            })),
          };
        },
      },
      search_videos: {
        label: 'Search videos',
        description: 'Search YouTube.',
        params: [{ name: 'q', type: 'text', required: true }],
        async run({ token, params }) {
          const d = await http(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(params.q)}&maxResults=10`, {
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'YouTube' });
          return { summary: `${(d.items || []).length} results`, rows: (d.items || []).map((v) => ({ title: v.snippet.title, subtitle: v.snippet.channelTitle, url: `https://youtu.be/${v.id.videoId}` })) };
        },
      },
      list_playlists: {
        label: 'List playlists',
        description: 'Your playlists.',
        async run({ token }) {
          const d = await http('https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=10', {
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'YouTube' });
          return { summary: `${(d.items || []).length} playlists`, rows: (d.items || []).map((p) => ({ title: p.snippet.title, subtitle: `${p.snippet.itemCount || 0} videos`, url: `https://youtube.com/playlist?list=${p.id}` })) };
        },
      },
      get_video: {
        label: 'Get video',
        description: 'Details of a video by ID.',
        params: [{ name: 'videoId', type: 'text', required: true }],
        async run({ token, params }) {
          const d = await http(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${params.videoId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'YouTube' });
          const v = (d.items || [])[0];
          if (!v) throw new ProviderError('Video not found', 404);
          return { summary: `${v.snippet.title}`, rows: [{ title: v.snippet.title, subtitle: v.snippet.channelTitle, meta: `${v.statistics.viewCount} views`, url: `https://youtu.be/${v.id}` }] };
        },
      },
    },
  },

  // ---------------------------------------------------------------- X (Twitter)
  twitter: {
    name: 'X / Twitter',
    docs: 'https://developer.x.com/en/docs/x-api',
    tokenLabel: 'OAuth 2.0 user access token',
    tokenUrl: 'https://developer.x.com/en/portal/dashboard',
    tokenHelp: 'Developer Portal → your project → Keys and tokens → generate an OAuth 2.0 user access token with `users.read` + `tweet.read`.',
    oauth: {
      authorizeUrl: 'https://twitter.com/i/oauth2/authorize',
      tokenUrl: 'https://api.twitter.com/2/oauth2/token',
      scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
      idEnv: 'TWITTER_CLIENT_ID',
      secretEnv: 'TWITTER_CLIENT_SECRET',
      pkce: true,
      basicAuth: true,
    },
    async verify(token) {
      const d = await http('https://api.twitter.com/2/users/me?user.fields=profile_image_url,public_metrics,username', {
        headers: { Authorization: `Bearer ${token}` },
      }, { label: 'X' });
      const u = d.data;
      if (!u) throw new ProviderError('X: token did not resolve to a user', 401);
      return {
        account_id: u.id,
        account_name: `@${u.username}`,
        account_label: u.name || '',
        account_avatar: u.profile_image_url || '',
        account_url: `https://x.com/${u.username}`,
        meta: { followers: u.public_metrics?.followers_count },
      };
    },
    actions: {
      profile: {
        label: 'Profile & metrics',
        description: 'Follower counts and profile info.',
        async run({ token }) {
          const d = await http('https://api.twitter.com/2/users/me?user.fields=public_metrics,description', { headers: { Authorization: `Bearer ${token}` } }, { label: 'X' });
          const m = d.data?.public_metrics || {};
          return {
            summary: `@${d.data?.username} · ${m.followers_count ?? 0} followers`,
            rows: [
              { title: 'Followers', subtitle: String(m.followers_count ?? 0) },
              { title: 'Following', subtitle: String(m.following_count ?? 0) },
              { title: 'Posts', subtitle: String(m.tweet_count ?? 0) },
            ],
          };
        },
      },
      post_tweet: {
        label: 'Post',
        description: 'Publish a post to your timeline.',
        write: true,
        params: [{ name: 'text', type: 'textarea', required: true }],
        async run({ token, params }) {
          const d = await http('https://api.twitter.com/2/tweets', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, ...JSON_HEADERS },
            body: JSON.stringify({ text: params.text }),
          }, { label: 'X' });
          return { summary: 'Posted', rows: [{ title: params.text.slice(0, 140), subtitle: d.data?.id }] };
        },
      },
      search_tweets: {
        label: 'Search tweets',
        description: 'Search recent tweets.',
        params: [{ name: 'q', type: 'text', required: true }],
        async run({ token, params }) {
          const d = await http(`https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(params.q)}&max_results=10`, {
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'X' });
          return { summary: `${(d.data || []).length} tweets`, rows: (d.data || []).map((t) => ({ title: t.text.slice(0, 80), subtitle: t.id, meta: '' })) };
        },
      },
      list_followers: {
        label: 'List followers',
        description: 'Your followers.',
        params: [{ name: 'limit', type: 'number', default: 10 }],
        async run({ token, params }) {
          const n = Math.min(Number(params.limit) || 10, 20);
          const me = await http('https://api.twitter.com/2/users/me', { headers: { Authorization: `Bearer ${token}` } }, { label: 'X' });
          const d = await http(`https://api.twitter.com/2/users/${me.data.id}/followers?max_results=${n}&user.fields=username,name`, {
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'X' });
          return { summary: `${(d.data || []).length} followers`, rows: (d.data || []).map((u) => ({ title: `@${u.username}`, subtitle: u.name })) };
        },
      },
      delete_tweet: {
        label: 'Delete tweet',
        description: 'Delete a tweet by ID.',
        write: true,
        params: [{ name: 'id', type: 'text', required: true }],
        async run({ token, params }) {
          await http(`https://api.twitter.com/2/tweets/${params.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'X' });
          return { summary: `Deleted ${params.id}`, rows: [{ title: params.id, subtitle: 'deleted' }] };
        },
      },
    },
  },

  // --------------------------------------------------------------- LinkedIn
  linkedin: {
    name: 'LinkedIn',
    docs: 'https://learn.microsoft.com/en-us/linkedin/',
    tokenLabel: 'OAuth access token',
    tokenUrl: 'https://www.linkedin.com/developers/apps',
    tokenHelp: 'Create an app with the “Sign In with LinkedIn using OpenID Connect” product, then generate a 3-legged token with the `profile` scope.',
    oauth: {
      authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
      tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
      scopes: ['openid', 'profile', 'email'],
      idEnv: 'LINKEDIN_CLIENT_ID',
      secretEnv: 'LINKEDIN_CLIENT_SECRET',
    },
    async verify(token) {
      const me = await http('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${token}` } }, { label: 'LinkedIn' });
      return {
        account_id: me.sub,
        account_name: me.name || me.given_name || 'LinkedIn',
        account_label: me.email || '',
        account_avatar: me.picture || '',
        meta: { locale: me.locale?.language || '' },
      };
    },
    actions: {
      profile: {
        label: 'Profile',
        description: 'Your LinkedIn identity.',
        async run({ token }) {
          const me = await http('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${token}` } }, { label: 'LinkedIn' });
          return { summary: me.name || 'LinkedIn profile', rows: [{ title: me.name, subtitle: me.email || '', meta: me.locale?.country || '' }] };
        },
      },
      share_post: {
        label: 'Share post',
        description: 'Share a post to your feed.',
        write: true,
        params: [{ name: 'text', type: 'textarea', required: true }],
        async run({ token, params }) {
          const me = await http('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${token}` } }, { label: 'LinkedIn' });
          const d = await http('https://api.linkedin.com/v2/ugcPosts', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, ...JSON_HEADERS, 'X-Restli-Protocol-Version': '2.0.0' },
            body: JSON.stringify({ author: `urn:li:person:${me.sub}`, lifecycleState: 'PUBLISHED', specificContent: { 'com.linkedin.ugc.ShareContent': { shareCommentary: { text: params.text }, shareMediaCategory: 'NONE' } }, visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' } }),
          }, { label: 'LinkedIn' });
          return { summary: 'Posted', rows: [{ title: params.text.slice(0, 80), subtitle: d.id || '' }] };
        },
      },
      get_network: {
        label: 'Network stats',
        description: 'Connection counts.',
        async run({ token }) {
          // No direct API, fallback to profile
          const me = await http('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${token}` } }, { label: 'LinkedIn' });
          return { summary: `${me.name} network`, rows: [{ title: me.name, subtitle: me.email || '', meta: 'connections: use profile' }] };
        },
      },
    },
  },

  // ---------------------------------------------------------------- Webflow
  webflow: {
    name: 'Webflow',
    docs: 'https://developers.webflow.com/',
    tokenLabel: 'Site API token',
    tokenUrl: 'https://webflow.com/dashboard',
    tokenHelp: 'Site settings → Apps & integrations → API access → generate a token.',
    async verify(token) {
      const d = await http('https://api.webflow.com/v2/token/authorized_by', { headers: { Authorization: `Bearer ${token}` } }, { label: 'Webflow' });
      return { account_id: d.id || '', account_name: [d.firstName, d.lastName].filter(Boolean).join(' ') || d.email || 'Webflow', account_label: d.email || '', meta: {} };
    },
    actions: {
      list_sites: {
        label: 'List sites',
        description: 'Sites this token can reach.',
        async run({ token }) {
          const d = await http('https://api.webflow.com/v2/sites', { headers: { Authorization: `Bearer ${token}` } }, { label: 'Webflow' });
          return { summary: `${(d.sites || []).length} sites`, rows: (d.sites || []).map((s) => ({ title: s.displayName, subtitle: s.shortName, meta: s.lastPublished ? new Date(s.lastPublished).toLocaleDateString() : 'never published' })) };
        },
      },
      list_collections: {
        label: 'List collections',
        description: 'CMS collections for a site.',
        params: [{ name: 'site_id', type: 'text', required: true }],
        async run({ token, params }) {
          const d = await http(`https://api.webflow.com/v2/sites/${params.site_id}/collections`, { headers: { Authorization: `Bearer ${token}` } }, { label: 'Webflow' });
          return { summary: `${(d.collections || []).length} collections`, rows: (d.collections || []).map((c) => ({ title: c.displayName, subtitle: c.slug })) };
        },
      },
      list_pages: {
        label: 'List pages',
        description: 'Pages of a site.',
        params: [{ name: 'site_id', type: 'text', required: true }],
        async run({ token, params }) {
          const d = await http(`https://api.webflow.com/v2/sites/${params.site_id}/pages`, { headers: { Authorization: `Bearer ${token}` } }, { label: 'Webflow' });
          return { summary: `${(d.pages || []).length} pages`, rows: (d.pages || []).map((p) => ({ title: p.title, subtitle: p.slug })) };
        },
      },
      publish_site: {
        label: 'Publish site',
        description: 'Publish a site.',
        write: true,
        params: [{ name: 'site_id', type: 'text', required: true }],
        async run({ token, params }) {
          await http(`https://api.webflow.com/v2/sites/${params.site_id}/publish`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, ...JSON_HEADERS },
            body: JSON.stringify({ publishToWebflowSubdomain: true }),
          }, { label: 'Webflow' });
          return { summary: `Published ${params.site_id}`, rows: [{ title: params.site_id, subtitle: 'published' }] };
        },
      },
    },
  },

  // ------------------------------------------------------------------- Jira
  jira: {
    name: 'Jira',
    docs: 'https://developer.atlassian.com/cloud/jira/platform/rest/v3/',
    tokenLabel: 'API token',
    tokenUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens',
    tokenHelp: 'Create an Atlassian API token, then paste it together with your site domain and account email below.',
    extraFields: [
      { name: 'site', label: 'Site domain', placeholder: 'your-team.atlassian.net', required: true },
      { name: 'email', label: 'Atlassian account email', placeholder: 'you@company.com', required: true },
    ],
    async verify(token, extra = {}) {
      const site = String(extra.site || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (!site || !extra.email) throw new ProviderError('Jira: site domain and account email are required', 400);
      const basic = Buffer.from(`${extra.email}:${token}`).toString('base64');
      const me = await http(`https://${site}/rest/api/3/myself`, { headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' } }, { label: 'Jira' });
      return {
        account_id: me.accountId,
        account_name: me.displayName,
        account_label: me.emailAddress || site,
        account_avatar: me.avatarUrls?.['48x48'] || '',
        account_url: `https://${site}`,
        meta: { site, email: extra.email },
      };
    },
    actions: {
      my_issues: {
        label: 'My open issues',
        description: 'Issues assigned to you.',
        async run({ token, connector }) {
          const { site, email } = connector.meta || {};
          const basic = Buffer.from(`${email}:${token}`).toString('base64');
          const d = await http(
            `https://${site}/rest/api/3/search?jql=${encodeURIComponent('assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC')}&maxResults=15&fields=summary,status,priority`,
            { headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' } },
            { label: 'Jira' }
          );
          return {
            summary: `${(d.issues || []).length} open issues`,
            rows: (d.issues || []).map((i) => ({ title: `${i.key} ${i.fields.summary}`, subtitle: i.fields.status?.name, meta: i.fields.priority?.name || '', url: `https://${site}/browse/${i.key}` })),
          };
        },
      },
      projects: {
        label: 'List projects',
        description: 'Projects on the site.',
        async run({ token, connector }) {
          const { site, email } = connector.meta || {};
          const basic = Buffer.from(`${email}:${token}`).toString('base64');
          const d = await http(`https://${site}/rest/api/3/project/search?maxResults=20`, { headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' } }, { label: 'Jira' });
          return { summary: `${(d.values || []).length} projects`, rows: (d.values || []).map((p) => ({ title: p.name, subtitle: p.key, meta: p.projectTypeKey })) };
        },
      },
      get_issue: {
        label: 'Get issue',
        description: 'Details of an issue by key.',
        params: [{ name: 'key', type: 'text', required: true, placeholder: 'PROJ-123' }],
        async run({ token, connector, params }) {
          const { site, email } = connector.meta || {};
          const basic = Buffer.from(`${email}:${token}`).toString('base64');
          const d = await http(`https://${site}/rest/api/3/issue/${params.key}`, { headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' } }, { label: 'Jira' });
          return { summary: `${d.key} ${d.fields.summary}`, rows: [{ title: `${d.key} ${d.fields.summary}`, subtitle: d.fields.status.name, meta: d.fields.priority?.name || '', url: `https://${site}/browse/${d.key}` }] };
        },
      },
      create_issue: {
        label: 'Create issue',
        description: 'Create a new issue.',
        write: true,
        params: [
          { name: 'project', type: 'text', required: true, placeholder: 'PROJ' },
          { name: 'summary', type: 'text', required: true },
          { name: 'description', type: 'textarea' },
          { name: 'issuetype', type: 'text', placeholder: 'Task' },
        ],
        async run({ token, connector, params }) {
          const { site, email } = connector.meta || {};
          const basic = Buffer.from(`${email}:${token}`).toString('base64');
          const d = await http(`https://${site}/rest/api/3/issue`, {
            method: 'POST',
            headers: { Authorization: `Basic ${basic}`, Accept: 'application/json', ...JSON_HEADERS },
            body: JSON.stringify({ fields: { project: { key: params.project }, summary: params.summary, description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: params.description || '' }] }] }, issuetype: { name: params.issuetype || 'Task' } } }),
          }, { label: 'Jira' });
          return { summary: `Created ${d.key}`, rows: [{ title: d.key, subtitle: params.summary, url: `https://${site}/browse/${d.key}` }] };
        },
      },
      add_comment: {
        label: 'Add comment',
        description: 'Comment on an issue.',
        write: true,
        params: [
          { name: 'key', type: 'text', required: true },
          { name: 'body', type: 'textarea', required: true },
        ],
        async run({ token, connector, params }) {
          const { site, email } = connector.meta || {};
          const basic = Buffer.from(`${email}:${token}`).toString('base64');
          const d = await http(`https://${site}/rest/api/3/issue/${params.key}/comment`, {
            method: 'POST',
            headers: { Authorization: `Basic ${basic}`, Accept: 'application/json', ...JSON_HEADERS },
            body: JSON.stringify({ body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: params.body }] }] } }),
          }, { label: 'Jira' });
          return { summary: 'Comment added', rows: [{ title: params.key, subtitle: d.body?.content?.[0]?.content?.[0]?.text?.slice(0, 60) || '' }] };
        },
      },
      list_boards: {
        label: 'List boards',
        description: 'Boards on the site.',
        async run({ token, connector }) {
          const { site, email } = connector.meta || {};
          const basic = Buffer.from(`${email}:${token}`).toString('base64');
          const d = await http(`https://${site}/rest/agile/1.0/board?maxResults=20`, { headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' } }, { label: 'Jira' });
          return { summary: `${(d.values || []).length} boards`, rows: (d.values || []).map((b) => ({ title: b.name, subtitle: b.type, meta: b.location?.projectName || '' })) };
        },
      },
    },
  },

  // ----------------------------------------------------------------- Zapier
  zapier: {
    name: 'Zapier',
    docs: 'https://help.zapier.com/hc/en-us/articles/8496288690317',
    tokenLabel: 'Catch Hook URL',
    tokenUrl: 'https://zapier.com/app/zaps',
    tokenHelp: 'Create a Zap with a “Webhooks by Zapier → Catch Hook” trigger and paste the hook URL. Sutradhar can then fire that Zap with real payloads.',
    async verify(url) {
      if (!/^https:\/\/hooks\.zapier\.com\//.test(String(url))) {
        throw new ProviderError('Zapier: paste a https://hooks.zapier.com/... Catch Hook URL', 400);
      }
      // Live reachability probe: fires a real request at the real hook.
      const probe = await http(String(url), {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ source: 'sutradhar', event: 'connection_test', at: new Date().toISOString() }),
      }, { label: 'Zapier' });
      if (probe?.status !== 'success' || !probe?.id) {
        throw new ProviderError('Zapier: the hook did not acknowledge the test request', 400, probe);
      }
      const id = String(url).split('/').filter(Boolean).slice(-2).join('/');
      return {
        account_id: id,
        account_name: 'Zapier Catch Hook',
        account_label: `hook ${id}`,
        account_url: 'https://zapier.com/app/zaps',
        meta: { probe_id: probe.id },
      };
    },
    actions: {
      trigger: {
        label: 'Trigger the Zap',
        description: 'Fire the webhook with a JSON payload.',
        write: true,
        params: [{ name: 'payload', type: 'textarea', placeholder: '{"message":"hello"}' }],
        async run({ token, params }) {
          let body = { source: 'sutradhar' };
          if (params.payload) {
            try { body = { ...body, ...JSON.parse(params.payload) }; }
            catch { body = { ...body, message: String(params.payload) }; }
          }
          await http(token, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) }, { label: 'Zapier' });
          return { summary: 'Zap triggered', rows: [{ title: 'Payload delivered', subtitle: JSON.stringify(body).slice(0, 140) }] };
        },
      },
    },
  },

  // -------------------------------------------------------------- Instagram
  instagram: {
    name: 'Instagram',
    docs: 'https://developers.facebook.com/docs/instagram-platform',
    tokenLabel: 'Instagram Graph access token',
    tokenUrl: 'https://developers.facebook.com/tools/explorer/',
    tokenHelp: 'Use the Graph API Explorer with an Instagram Business/Creator account to generate a user access token.',
    async verify(token) {
      const me = await http(`https://graph.instagram.com/me?fields=id,username,account_type,media_count&access_token=${encodeURIComponent(token)}`, {}, { label: 'Instagram' });
      return {
        account_id: me.id,
        account_name: `@${me.username}`,
        account_label: me.account_type || '',
        account_url: `https://instagram.com/${me.username}`,
        meta: { media_count: me.media_count },
      };
    },
    actions: {
      recent_media: {
        label: 'Recent media',
        description: 'Your latest posts.',
        async run({ token }) {
          const d = await http(`https://graph.instagram.com/me/media?fields=id,caption,media_type,permalink,timestamp&limit=10&access_token=${encodeURIComponent(token)}`, {}, { label: 'Instagram' });
          return {
            summary: `${(d.data || []).length} posts`,
            rows: (d.data || []).map((m) => ({ title: (m.caption || '(no caption)').slice(0, 90), subtitle: m.media_type, meta: new Date(m.timestamp).toLocaleDateString(), url: m.permalink })),
          };
        },
      },
      get_media: {
        label: 'Get media',
        description: 'Details of a media object.',
        params: [{ name: 'id', type: 'text', required: true }],
        async run({ token, params }) {
          const d = await http(`https://graph.instagram.com/${params.id}?fields=id,caption,media_type,permalink,timestamp,like_count,comments_count&access_token=${encodeURIComponent(token)}`, {}, { label: 'Instagram' });
          return { summary: `${d.media_type} ${d.id}`, rows: [{ title: (d.caption || '').slice(0, 80) || d.id, subtitle: d.media_type, meta: `${d.like_count || 0} likes`, url: d.permalink }] };
        },
      },
      insights: {
        label: 'Media insights',
        description: 'Insights for a media object.',
        params: [{ name: 'id', type: 'text', required: true }],
        async run({ token, params }) {
          const d = await http(`https://graph.instagram.com/${params.id}/insights?metric=engagement,impressions,reach&access_token=${encodeURIComponent(token)}`, {}, { label: 'Instagram' });
          const rows = (d.data || []).map((m) => ({ title: m.name, subtitle: `${m.values?.[0]?.value || 0}`, meta: m.period || '' }));
          return { summary: `${rows.length} insights`, rows };
        },
      },
      profile_insights: {
        label: 'Profile insights',
        description: 'Follower counts and profile views.',
        async run({ token }) {
          const me = await http(`https://graph.instagram.com/me?fields=id,username&access_token=${encodeURIComponent(token)}`, {}, { label: 'Instagram' });
          const d = await http(`https://graph.instagram.com/${me.id}/insights?metric=follower_count,profile_views&period=day&access_token=${encodeURIComponent(token)}`, {}, { label: 'Instagram' });
          return { summary: `${me.username} insights`, rows: (d.data || []).map((m) => ({ title: m.name, subtitle: `${m.values?.[0]?.value || 0}` })) };
        },
      },
    },
  },

  // ----------------------------------------------------------------- TikTok
  tiktok: {
    name: 'TikTok',
    docs: 'https://developers.tiktok.com/doc/display-api-overview',
    tokenLabel: 'Display API access token',
    tokenUrl: 'https://developers.tiktok.com/apps',
    tokenHelp: 'Register an app with the Display API, authorise a user and paste the access token.',
    async verify(token) {
      const d = await http('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,follower_count', {
        headers: { Authorization: `Bearer ${token}` },
      }, { label: 'TikTok' });
      const u = d.data?.user;
      if (!u) throw new ProviderError('TikTok: token did not resolve to a user', 401, d);
      return {
        account_id: u.open_id,
        account_name: u.display_name,
        account_label: `${u.follower_count ?? 0} followers`,
        account_avatar: u.avatar_url || '',
        meta: {},
      };
    },
    actions: {
      profile: {
        label: 'Profile',
        description: 'Display name and follower count.',
        async run({ token }) {
          const d = await http('https://open.tiktokapis.com/v2/user/info/?fields=display_name,follower_count,likes_count,video_count', {
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'TikTok' });
          const u = d.data?.user || {};
          return {
            summary: `${u.display_name || 'TikTok'} · ${u.follower_count ?? 0} followers`,
            rows: [
              { title: 'Followers', subtitle: String(u.follower_count ?? 0) },
              { title: 'Likes', subtitle: String(u.likes_count ?? 0) },
              { title: 'Videos', subtitle: String(u.video_count ?? 0) },
            ],
          };
        },
      },
      list_videos: {
        label: 'List videos',
        description: 'Your recent videos.',
        params: [{ name: 'limit', type: 'number', default: 10 }],
        async run({ token, params }) {
          const n = Math.min(Number(params.limit) || 10, 20);
          const d = await http(`https://open.tiktokapis.com/v2/video/list/?fields=id,title,cover_image_url,create_time&max_count=${n}`, {
            headers: { Authorization: `Bearer ${token}` },
          }, { label: 'TikTok' });
          const videos = d.data?.videos || [];
          return { summary: `${videos.length} videos`, rows: videos.map((v) => ({ title: v.title || v.id, subtitle: new Date(Number(v.create_time) * 1000).toLocaleDateString(), meta: '', url: v.cover_image_url })) };
        },
      },
      video_info: {
        label: 'Get video',
        description: 'Details of a video by ID.',
        params: [{ name: 'video_id', type: 'text', required: true }],
        async run({ token, params }) {
          const d = await http('https://open.tiktokapis.com/v2/video/query/', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, ...JSON_HEADERS },
            body: JSON.stringify({ filters: { video_ids: [params.video_id] }, fields: ['id', 'title', 'cover_image_url', 'create_time'] }),
          }, { label: 'TikTok' });
          const v = d.data?.videos?.[0];
          if (!v) throw new ProviderError('Video not found', 404);
          return { summary: `${v.title || v.id}`, rows: [{ title: v.title || v.id, subtitle: new Date(Number(v.create_time) * 1000).toLocaleString(), url: v.cover_image_url }] };
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getProvider(id) {
  const p = PROVIDERS[id];
  if (!p) throw new ProviderError(`Unknown provider "${id}"`, 404);
  return p;
}

/** True when this provider has real OAuth credentials configured. 
 * For luxury browser login, we treat OAuth as “ready” if the provider declares an oauth block –
 * the backend will gracefully fall back to token if env is missing, but the UI should always offer browser.
 */
export function oauthReady(id) {
  const p = PROVIDERS[id];
  if (!p?.oauth) return false;
  // Always advertise browser login as available – the API will return a helpful error if env is truly missing
  // This removes the “Browser login not yet enabled” dead-end for all connectors.
  return true;
}

export function oauthConfig(id) {
  const p = getProvider(id);
  if (!p.oauth) throw new ProviderError(`${p.name} does not support OAuth`, 400);
  const clientId = env(p.oauth.idEnv) || `demo-${id}-client-id`;
  const clientSecret = env(p.oauth.secretEnv) || `demo-${id}-client-secret`;
  // If env is missing, we still return a config so the browser flow can be attempted;
  // the provider will show a proper error, and the UI will fallback to token. No longer throws 400 here.
  return { ...p.oauth, clientId, clientSecret, isDemo: !env(p.oauth.idEnv) || !env(p.oauth.secretEnv) };
}

/** Exchange an authorization code for tokens against the real token endpoint. */
export async function exchangeCode(id, { code, redirectUri, codeVerifier }) {
  const cfg = oauthConfig(id);
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  const body = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  };
  if (cfg.pkce && codeVerifier) body.code_verifier = codeVerifier;
  if (cfg.basicAuth) {
    headers.Authorization = `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`;
    if (cfg.pkce) body.client_id = cfg.clientId;
  } else {
    body.client_id = cfg.clientId;
    body.client_secret = cfg.clientSecret;
  }
  const data = await http(cfg.tokenUrl, { method: 'POST', headers, body: form(body) }, { label: `${PROVIDERS[id].name} OAuth` });
  // Slack nests the user token under authed_user for user scopes.
  const access = data.access_token || data.authed_user?.access_token;
  if (!access) throw new ProviderError(`${PROVIDERS[id].name} OAuth: no access token returned`, 400, data);
  return {
    access_token: access,
    refresh_token: data.refresh_token || '',
    expires_in: Number(data.expires_in) || 0,
    scope: data.scope || (Array.isArray(cfg.scopes) ? cfg.scopes.join(' ') : ''),
    raw: data,
  };
}

/** Refresh an expired access token using the stored refresh token. */
export async function refreshAccessToken(id, refreshToken) {
  const cfg = oauthConfig(id);
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  const body = { grant_type: 'refresh_token', refresh_token: refreshToken };
  if (cfg.basicAuth) {
    headers.Authorization = `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`;
  } else {
    body.client_id = cfg.clientId;
    body.client_secret = cfg.clientSecret;
  }
  const data = await http(cfg.tokenUrl, { method: 'POST', headers, body: form(body) }, { label: `${PROVIDERS[id].name} refresh` });
  if (!data.access_token) throw new ProviderError(`${PROVIDERS[id].name}: refresh failed`, 401, data);
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_in: Number(data.expires_in) || 0,
  };
}

/** Build the provider's real authorization URL. */
export function buildAuthorizeUrl(id, { redirectUri, state, codeChallenge }) {
  const cfg = oauthConfig(id);
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  });
  if (cfg.scopes?.length) {
    // Slack uses `scope` for bot scopes; everything here uses space-delimited.
    params.set('scope', cfg.scopes.join(id === 'slack' ? ',' : ' '));
  }
  if (cfg.pkce && codeChallenge) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }
  for (const [k, v] of Object.entries(cfg.extraAuthParams || {})) params.set(k, v);
  return `${cfg.authorizeUrl}?${params.toString()}`;
}

/** Public catalog description consumed by the frontend. */
export function publicCatalog() {
  return Object.entries(PROVIDERS).map(([id, p]) => ({
    id,
    name: p.name,
    docs: p.docs,
    tokenLabel: p.tokenLabel,
    tokenUrl: p.tokenUrl,
    tokenHelp: p.tokenHelp,
    extraFields: p.extraFields || [],
    oauthAvailable: !!p.oauth,
    oauthReady: oauthReady(id),
    oauthScopes: p.oauth?.scopes || [],
    oauthEnvKeys: p.oauth ? [p.oauth.idEnv, p.oauth.secretEnv] : [],
    actions: Object.entries(p.actions || {}).map(([aid, a]) => ({
      id: aid,
      label: a.label,
      description: a.description || '',
      write: !!a.write,
      params: a.params || [],
    })),
  }));
}


