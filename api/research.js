// Public research content endpoint — no auth required, this page is public.
//   GET /api/research            → everything the research page needs
//   GET /api/research?part=specs → a single collection
import supabase from './db-client.js';

const COLLECTIONS = {
  specs: { table: 'model_specs', order: 'order_index' },
  sections: { table: 'research_sections', order: 'order_index' },
  benchmarks: { table: 'benchmarks', order: 'order_index' },
  training: { table: 'training_stages', order: 'order_index' },
  roadmap: { table: 'roadmap_items', order: 'order_index' },
  metrics: { table: 'company_metrics', order: 'order_index' },
  papers: { table: 'papers', order: 'order_index' },
};

async function fetchAll(key) {
  const { table, order } = COLLECTIONS[key];
  const { data, error } = await supabase.from(table).select('*').order(order, { ascending: true });
  if (error) throw error;
  return data || [];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const part = req.query?.part;
    if (part) {
      if (!COLLECTIONS[part]) return res.status(400).json({ error: `Unknown part "${part}"` });
      return res.status(200).json(await fetchAll(part));
    }

    const keys = Object.keys(COLLECTIONS);
    const results = await Promise.all(keys.map((k) => fetchAll(k)));
    const payload = Object.fromEntries(keys.map((k, i) => [k, results[i]]));

    // Cache at the edge: this content changes rarely and the page is public.
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    return res.status(200).json(payload);
  } catch (err) {
    console.error('research error', err);
    return res.status(500).json({ error: err.message });
  }
}
