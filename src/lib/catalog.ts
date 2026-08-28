// Connector catalog — wide range of apps for developers & influencers.
export interface ConnectorDef {
  id: string;
  name: string;
  category: 'Developer' | 'Productivity' | 'Social' | 'Comms' | 'Business' | 'Creative';
  emoji: string;
  color: string;
  blurb: string;
  logo: string; // authentic brand logo (SVG via Simple Icons CDN)
}

export const CONNECTORS: ConnectorDef[] = [
  { id: 'github', name: 'GitHub', category: 'Developer', emoji: '🐙', color: '#24292f', blurb: 'Repos, issues, PRs & Actions', logo: 'https://cdn.simpleicons.org/github/181717' },
  { id: 'vercel', name: 'Vercel', category: 'Developer', emoji: '▲', color: '#000000', blurb: 'Deploys & project status', logo: 'https://cdn.simpleicons.org/vercel/000000' },
  { id: 'linear', name: 'Linear', category: 'Developer', emoji: '📐', color: '#5e6ad2', blurb: 'Issues & sprint planning', logo: 'https://cdn.simpleicons.org/linear/5E6AD2' },
  { id: 'jira', name: 'Jira', category: 'Developer', emoji: '🧭', color: '#0052cc', blurb: 'Tickets & boards', logo: 'https://cdn.simpleicons.org/jira/0052CC' },
  { id: 'figma', name: 'Figma', category: 'Creative', emoji: '🎨', color: '#a259ff', blurb: 'Designs & prototypes', logo: 'https://cdn.simpleicons.org/figma/F24E1E' },
  { id: 'webflow', name: 'Webflow', category: 'Creative', emoji: '🌐', color: '#4353ff', blurb: 'Sites & CMS', logo: 'https://cdn.simpleicons.org/webflow/4353FF' },
  { id: 'notion', name: 'Notion', category: 'Productivity', emoji: '📓', color: '#000000', blurb: 'Docs, wikis & databases', logo: 'https://cdn.simpleicons.org/notion/000000' },
  { id: 'gdrive', name: 'Google Drive', category: 'Productivity', emoji: '📁', color: '#4285f4', blurb: 'Files & folders', logo: 'https://cdn.simpleicons.org/googledrive/4285F4' },
  { id: 'gcal', name: 'Google Calendar', category: 'Productivity', emoji: '📅', color: '#4285f4', blurb: 'Events & scheduling', logo: 'https://cdn.simpleicons.org/googlecalendar/4285F4' },
  { id: 'gmail', name: 'Gmail', category: 'Comms', emoji: '✉️', color: '#ea4335', blurb: 'Read & send email', logo: 'https://cdn.simpleicons.org/gmail/EA4335' },
  { id: 'slack', name: 'Slack', category: 'Comms', emoji: '💬', color: '#4a154b', blurb: 'Messages & channels', logo: 'https://cdn.simpleicons.org/slack/4A154B' },
  { id: 'discord', name: 'Discord', category: 'Comms', emoji: '🎮', color: '#5865f2', blurb: 'Servers & DMs', logo: 'https://cdn.simpleicons.org/discord/5865F2' },
  { id: 'twitter', name: 'X / Twitter', category: 'Social', emoji: '🐦', color: '#000000', blurb: 'Post & analyze threads', logo: 'https://cdn.simpleicons.org/x/000000' },
  { id: 'instagram', name: 'Instagram', category: 'Social', emoji: '📸', color: '#e1306c', blurb: 'Posts, reels & insights', logo: 'https://cdn.simpleicons.org/instagram/E4405F' },
  { id: 'youtube', name: 'YouTube', category: 'Social', emoji: '▶️', color: '#ff0000', blurb: 'Uploads & analytics', logo: 'https://cdn.simpleicons.org/youtube/FF0000' },
  { id: 'tiktok', name: 'TikTok', category: 'Social', emoji: '🎵', color: '#000000', blurb: 'Videos & trends', logo: 'https://cdn.simpleicons.org/tiktok/000000' },
  { id: 'linkedin', name: 'LinkedIn', category: 'Social', emoji: '💼', color: '#0a66c2', blurb: 'Posts & network', logo: 'https://cdn.simpleicons.org/linkedin/0A66C2' },
  { id: 'stripe', name: 'Stripe', category: 'Business', emoji: '💳', color: '#635bff', blurb: 'Payments & revenue', logo: 'https://cdn.simpleicons.org/stripe/635BFF' },
  { id: 'hubspot', name: 'HubSpot', category: 'Business', emoji: '🧲', color: '#ff7a59', blurb: 'CRM & marketing', logo: 'https://cdn.simpleicons.org/hubspot/FF7A59' },
  { id: 'zapier', name: 'Zapier', category: 'Productivity', emoji: '⚡', color: '#ff4a00', blurb: 'Automate anything', logo: 'https://cdn.simpleicons.org/zapier/FF4A00' },
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
