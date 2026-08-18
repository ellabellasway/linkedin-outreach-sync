// Input + enrichment: pull members of a HubSpot active list, read their LinkedIn
// URLs and job titles, AND their associated company's firmographics (industry,
// employee count, revenue, description). Normalize/dedupe and write
// data/leads.json + data/leads.csv.
//
// The associated company is the ICP signal, industry + employee size +
// description tell you far more than a job title alone. No LinkedIn scraping
// required.

import { writeFile, mkdir } from "node:fs/promises";
import { dedupeByUrl } from "./normalize.mjs";

const TOKEN = process.env.HUBSPOT_TOKEN;
const LIST_ID = process.env.HUBSPOT_LIST_ID;
const BASE = "https://api.hubapi.com";

if (!TOKEN) {
  console.error("Missing HUBSPOT_TOKEN — copy .env.example to .env and fill it in.");
  process.exit(1);
}
if (!LIST_ID) {
  console.error("Missing HUBSPOT_LIST_ID — set it to your own HubSpot active list's numeric ID.");
  process.exit(1);
}

async function hs(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`HubSpot ${path} -> ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// 1. Walk list memberships (paginated) → contact record IDs.
async function getMemberIds(listId) {
  const ids = [];
  let after;
  do {
    const qs = new URLSearchParams({ limit: "250", ...(after ? { after } : {}) });
    const page = await hs(`/crm/v3/lists/${listId}/memberships?${qs}`);
    for (const r of page.results || []) ids.push(r.recordId);
    after = page.paging?.next?.after;
  } while (after);
  return ids;
}

// Generic batch read helper.
async function batchRead(objectType, ids, properties) {
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const res = await hs(`/crm/v3/objects/${objectType}/batch/read`, {
      method: "POST",
      body: JSON.stringify({ properties, inputs: ids.slice(i, i + 100).map((id) => ({ id })) }),
    });
    out.push(...(res.results || []));
  }
  return out;
}

async function main() {
  console.log(`Reading HubSpot list ${LIST_ID} memberships…`);
  const ids = await getMemberIds(LIST_ID);
  console.log(`  ${ids.length} members`);

  console.log("Reading contacts…");
  const contacts = await batchRead("contacts", ids, [
    "hs_linkedin_url", "firstname", "lastname", "company", "jobtitle", "associatedcompanyid",
  ]);

  // 2. Resolve associated companies in one batch.
  const companyIds = [...new Set(contacts.map((c) => c.properties.associatedcompanyid).filter(Boolean))];
  console.log(`Reading ${companyIds.length} associated companies…`);
  const companies = await batchRead("companies", companyIds, [
    "name", "domain", "industry", "numberofemployees", "annualrevenue", "description", "country",
  ]);
  const companyById = new Map(companies.map((c) => [c.id, c.properties]));

  const merged = contacts.map((c) => {
    const co = companyById.get(c.properties.associatedcompanyid) || {};
    return {
      id: c.id,
      url: c.properties.hs_linkedin_url,
      firstName: c.properties.firstname || "",
      lastName: c.properties.lastname || "",
      title: c.properties.jobtitle || "",
      company: co.name || c.properties.company || "",
      companyDomain: co.domain || "",
      companyIndustry: co.industry || "",
      companyEmployees: co.numberofemployees || "",
      companyRevenue: co.annualrevenue || "",
      companyDescription: co.description || "",
      companyCountry: co.country || "",
    };
  });

  const leads = dedupeByUrl(merged.filter((c) => c.url));
  const dropped = merged.length - leads.length;
  console.log(`  ${leads.length} valid unique leads (${dropped} dropped: missing/invalid/dupe URL)`);
  const withCo = leads.filter((l) => l.companyIndustry || l.companyEmployees || l.companyDescription).length;
  console.log(`  ${withCo} have usable company firmographics`);

  await mkdir("data", { recursive: true });
  await writeFile("data/leads.json", JSON.stringify(leads, null, 2));
  await writeFile("data/leads.csv", toCsv(leads));
  console.log("Wrote data/leads.json and data/leads.csv");
}

function toCsv(rows) {
  const cols = ["url", "firstName", "lastName", "title", "company", "companyDomain",
    "companyIndustry", "companyEmployees", "companyRevenue", "companyCountry", "id"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map((r) => cols.map((k) => esc(r[k])).join(","))].join("\n");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
