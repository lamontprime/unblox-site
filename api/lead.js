// Vercel serverless function: captures leads from the site and writes them to Notion.
// Required env vars (Vercel dashboard -> Settings -> Environment Variables):
//   NOTION_API_KEY   - internal integration token from notion.so/my-integrations
//   NOTION_DB_ID     - ID of the "Unblox Leads" database (share the DB with the integration!)
// Optional:
//   RESEND_API_KEY   - if set, also emails you each lead via resend.com
//   LEAD_ALERT_EMAIL - where to send the alert (default hello@unblox.ai)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

const { name, email, org, segment, message, website, source } = req.body || {};

if (website) return res.status(200).json({ ok: true });

if (!name || !email || !message) {
  return res.status(400).json({ error: 'Missing required fields' });
}
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }

const clip = (s, n) => String(s || '').slice(0, n);

try {
  const notionRes = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { database_id: process.env.NOTION_DB_ID },
      properties: {
        'Name': { title: [{ text: { content: clip(name, 200) } }] },
        'Email': { email: clip(email, 200) },
        'Organisation': { rich_text: [{ text: { content: clip(org, 200) } }] },
        'Segment': { select: { name: clip(segment, 100) || 'Other' } },
        'Message': { rich_text: [{ text: { content: clip(message, 1900) } }] },
        'Status': { select: { name: 'New' } },
        'Source': { select: { name: clip(source, 100) || 'Website' } },
      },
    }),
  });

  if (!notionRes.ok) {
    const detail = await notionRes.text();
    console.error('Notion error:', detail);
    return res.status(502).json({ error: 'CRM write failed' });
  }

  if (process.env.RESEND_API_KEY) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Unblox Leads <leads@unblox.ai>',
        to: [process.env.LEAD_ALERT_EMAIL || 'hello@unblox.ai'],
        subject: `New lead: ${clip(name, 80)} (${clip(segment, 40)})`,
        text: `Name: ${name}\nEmail: ${email}\nOrg: ${org}\nSegment: ${segment}\n\n${message}`,
      }),
    }).catch((e) => console.error('Resend error (non-fatal):', e));
  }

  return res.status(200).json({ ok: true });
} catch (err) {
  console.error(err);
  return res.status(500).json({ error: 'Server error' });
}
}
