// Weekly delta export: from the classified leads, write a CSV of ONLY the
// newly-qualified people who haven't been exported before, then record them
// in the ledger so they never appear again.
//
// Flow each week:  npm run fetch && npm run classify && npm run export:new
//   → data/to-import-<date>.csv  (drag this into your outreach campaign)
//
// The ledger (data/pushed.json) is the single source of "already exported."
// It's gitignored and local, so run this on one machine (or a stateful job),
// not ephemeral CI, otherwise the dedupe memory is lost.

import { readFile, writeFile } from "node:fs/promises";
import { normalizeLinkedInUrl } from "./normalize.mjs";
import { QUALIFYING_TIERS } from "./icp.mjs";

// Pass a date string in (env DATE) since Date.now() isn't available everywhere;
// falls back to "latest" for the filename if not provided.
const STAMP = process.env.DATE || "latest";

async function loadJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

function toCsv(rows) {
  const cols = ["linkedinUrl", "firstName", "lastName", "title", "company", "companyIndustry"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map((r) =>
    [r.url, r.firstName, r.lastName, r.title, r.company, r.companyIndustry].map(esc).join(","))].join("\n");
}

async function main() {
  const classified = await loadJson("data/classified.json", null);
  if (!classified) throw new Error("No data/classified.json — run `npm run classify` first.");

  const ledger = new Set(await loadJson("data/pushed.json", []));

  const qualified = classified.filter((c) => QUALIFYING_TIERS.includes(c.verdict?.fit));
  const delta = qualified.filter((c) => {
    const url = normalizeLinkedInUrl(c.url);
    return url && !ledger.has(url);
  });

  if (!delta.length) {
    console.log(`No new qualified leads. (${qualified.length} qualified total, all already exported.)`);
    return;
  }

  const csvPath = `data/to-import-${STAMP}.csv`;
  await writeFile(csvPath, toCsv(delta));

  // Record them as exported.
  for (const c of delta) ledger.add(normalizeLinkedInUrl(c.url));
  await writeFile("data/pushed.json", JSON.stringify([...ledger], null, 2));

  console.log(`${delta.length} new qualified leads (tiers: ${QUALIFYING_TIERS.join(", ")}).`);
  console.log(`Wrote ${csvPath} — drop this into your outreach campaign.`);
  console.log(`Ledger now tracks ${ledger.size} exported leads.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
