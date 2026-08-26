// Connector catalog — wide range of apps for developers & influencers.
export interface ConnectorDef {
  id: string;
  name: string;
  category: 'Developer' | 'Productivity' | 'Social' | 'Comms' | 'Business' | 'Creative';
  emoji: string;
  color: string;
  blurb: string;
}

export const CONNECTORS: ConnectorDef[] = [
  { id: 'github', name: 'GitHub', category: 'Developer', emoji: '🐙', color: '#6e5494', blurb: 'Repos, issues, PRs & Actions' },
  { id: 'vercel', name: 'Vercel', category: 'Developer', emoji: '▲', color: '#111111', blurb: 'Deploys & project status' },
  { id: 'linear', name: 'Linear', category: 'Developer', emoji: '📐', color: '#5e6ad2', blurb: 'Issues & sprint planning' },
  { id: 'jira', name: 'Jira', category: 'Developer', emoji: '🧭', color: '#0052cc', blurb: 'Tickets & boards' },
  { id: 'figma', name: 'Figma', category: 'Creative', emoji: '🎨', color: '#a259ff', blurb: 'Designs & prototypes' },
  { id: 'webflow', name: 'Webflow', category: 'Creative', emoji: '🌐', color: '#4353ff', blurb: 'Sites & CMS' },
  { id: 'notion', name: 'Notion', category: 'Productivity', emoji: '📓', color: '#111111', blurb: 'Docs, wikis & databases' },
  { id: 'gdrive', name: 'Google Drive', category: 'Productivity', emoji: '📁', color: '#1fa463', blurb: 'Files & folders' },
  { id: 'gcal', name: 'Google Calendar', category: 'Productivity', emoji: '📅', color: '#4285f4', blurb: 'Events & scheduling' },
  { id: 'gmail', name: 'Gmail', category: 'Comms', emoji: '✉️', color: '#ea4335', blurb: 'Read & send email' },
  { id: 'slack', name: 'Slack', category: 'Comms', emoji: '💬', color: '#4a154b', blurb: 'Messages & channels' },
  { id: 'discord', name: 'Discord', category: 'Comms', emoji: '🎮', color: '#5865f2', blurb: 'Servers & DMs' },
  { id: 'twitter', name: 'X / Twitter', category: 'Social', emoji: '🐦', color: '#1d9bf0', blurb: 'Post & analyze threads' },
  { id: 'instagram', name: 'Instagram', category: 'Social', emoji: '📸', color: '#e1306c', blurb: 'Posts, reels & insights' },
  { id: 'youtube', name: 'YouTube', category: 'Social', emoji: '▶️', color: '#ff0000', blurb: 'Uploads & analytics' },
  { id: 'tiktok', name: 'TikTok', category: 'Social', emoji: '🎵', color: '#111111', blurb: 'Videos & trends' },
  { id: 'linkedin', name: 'LinkedIn', category: 'Social', emoji: '💼', color: '#0a66c2', blurb: 'Posts & network' },
  { id: 'stripe', name: 'Stripe', category: 'Business', emoji: '💳', color: '#635bff', blurb: 'Payments & revenue' },
  { id: 'hubspot', name: 'HubSpot', category: 'Business', emoji: '🧲', color: '#ff7a59', blurb: 'CRM & marketing' },
  { id: 'zapier', name: 'Zapier', category: 'Productivity', emoji: '⚡', color: '#ff4a00', blurb: 'Automate anything' },
];

export const CONNECTOR_MAP: Record<string, ConnectorDef> = Object.fromEntries(CONNECTORS.map((c) => [c.id, c]));

export const CATEGORIES: ConnectorDef['category'][] = ['Developer', 'Creative', 'Productivity', 'Comms', 'Social', 'Business'];

// Skill suggestions for manual agent editing
export const SKILL_LIBRARY = [
  'Code review', 'Bug triage', 'PR summaries', 'Docs writing', 'Research',
  'Content calendar', 'Caption writing', 'Hashtag strategy', 'Trend analysis',
  'Email drafting', 'Meeting notes', 'Data analysis', 'SQL', 'Math proofs',
  'Competitor analysis', 'SEO', 'Thread writing', 'Video scripting', 'Community replies',
  'Invoice tracking', 'Lead outreach', 'Standup summaries', 'Roadmap planning',
];

export const AGENT_COLORS = ['#c8781e', '#1e6e50', '#b5321a', '#4353ff', '#a259ff', '#0a66c2', '#e1306c', '#e0902a', '#37324f', '#2f7a5c'];
export const AGENT_EMOJIS = ['🪷', '🧠', '🛠️', '📊', '✍️', '🚀', '🔬', '🎨', '📣', '💼', '🌿', '⚙️', '📈', '🧭', '🦉', '🔮'];
