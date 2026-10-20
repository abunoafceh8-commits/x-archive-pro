const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default async function handler(req, res) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { username, cursor } = body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  
  const cleanUser = username.replace('@', '').trim();
  const tweets = [];

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Syndication
    try {
      const r = await fetch(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${cleanUser}`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000)
      });
      const html = await r.text();
      const ids = [...html.matchAll(/data-tweet-id="(\d+)"/g)];
      const texts = [...html.matchAll(/<p[^>]*dir="ltr"[^>]*>([\s\S]*?)<\/p>/g)];
      ids.forEach((m, i) => {
        tweets.push({
          id: m[1],
          tweet_id: m[1],
          text: texts[i]?.[2]?.replace(/<[^>]+>/g, '').trim() || '',
          url: `https://x.com/${cleanUser}/status/${m[1]}`,
          status: 'live'
        });
      });
    } catch {}

    // Wayback CDX
    try {
      const offset = cursor || 0;
      const r = await fetch(`https://web.archive.org/cdx/search/cdx?url=twitter.com/${cleanUser}/status/*&output=json&limit=100&offset=${offset}&fl=timestamp,original,statuscode&collapse=urlkey&statuscode=200`, {
        signal: AbortSignal.timeout(8000)
      });
      const data = await r.json();
      const [, ...rows] = data;
      rows.forEach(row => {
        const tid = row[1]?.match(/\/status\/(\d+)/)?.[1];
        if (tid && !tweets.find(t => t.tweet_id === tid)) {
          tweets.push({
            id: tid, tweet_id: tid,
            url: row[1],
            archive_url: `https://web.archive.org/web/${row[0]}/${row[1]}`,
            date: `${row[0].slice(0,4)}-${row[0].slice(4,6)}-${row[0].slice(6,8)}`,
            status: 'archived'
          });
        }
      });
    } catch {}

    return res.json({
      username: cleanUser,
      tweets,
      total: tweets.length,
      cursor: (cursor || 0) + 100,
      has_more: tweets.length >= 100
    });
  } catch (e) {
    return res.json({ error: e.message, tweets: [], total: 0 });
  }
}
