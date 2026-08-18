// Normalize a LinkedIn profile URL to a canonical form so dedupe works and
// the outreach tool accepts it: https://www.linkedin.com/in/<slug>
//
// CRMs store these inconsistently (with/without www, with query strings,
// trailing slashes, mixed case host). We only keep /in/ profile URLs, company
// pages, posts, and Sales Navigator links are dropped (an outreach campaign
// can't action them).

export function normalizeLinkedInUrl(raw) {
  if (!raw || typeof raw !== "string") return null;

  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;

  // Only personal profiles: /in/<slug>
  const match = url.pathname.match(/\/in\/([^/]+)/i);
  if (!match) return null;

  const slug = decodeURIComponent(match[1]).toLowerCase();
  return `https://www.linkedin.com/in/${slug}`;
}

// Dedupe a list of {url, ...} records by normalized URL, dropping invalids.
export function dedupeByUrl(records) {
  const seen = new Set();
  const out = [];
  for (const rec of records) {
    const url = normalizeLinkedInUrl(rec.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ ...rec, url });
  }
  return out;
}
