// Sink half: connect to a Browserless-hosted Chrome, authenticate to the
// outreach tool via injected session cookies (no password ever touches this
// code), open the target campaign, and add the leads from data/leads.json.
//
// STATUS: the auth + navigation skeleton is real. The campaign "Add leads"
// interaction (marked TODO:UI below) is stubbed until we map the tool's
// actual DOM, that requires one logged-in look at the add-leads flow. This
// is shipped as a scaffold on purpose: the hard, tool-specific part is left
// for you to map against whatever outreach tool you're actually driving.

import { readFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { QUALIFYING_TIERS } from "./icp.mjs";

const WS = process.env.BROWSERLESS_WS;
const CAMPAIGN_URL = process.env.DRIPIFY_CAMPAIGN_URL;
const COOKIES_FILE = process.env.DRIPIFY_COOKIES_FILE || "dripify-cookies.json";

if (!WS) throw new Error("Missing BROWSERLESS_WS");
if (!CAMPAIGN_URL) throw new Error("Missing DRIPIFY_CAMPAIGN_URL");

// Only push ICP-qualified leads. Falls back to raw leads.json (no ICP screen)
// only if classification hasn't been run — with a loud warning.
async function loadLeads() {
  try {
    const classified = JSON.parse(await readFile("data/classified.json", "utf8"));
    const qualified = classified.filter((c) => QUALIFYING_TIERS.includes(c.verdict?.fit));
    if (qualified.length) {
      console.log(`${qualified.length} ICP-qualified leads (tiers: ${QUALIFYING_TIERS.join(", ")})`);
      return qualified;
    }
  } catch {
    // not classified yet — fall through
  }
  const leads = JSON.parse(await readFile("data/leads.json", "utf8"));
  if (!Array.isArray(leads) || leads.length === 0) {
    throw new Error("data/leads.json is empty — run `npm run fetch` first.");
  }
  console.warn("No data/classified.json — pushing UNSCREENED leads. Run `npm run classify` first to ICP-filter.");
  return leads;
}

async function loadCookies() {
  const raw = await readFile(COOKIES_FILE, "utf8");
  const cookies = JSON.parse(raw);
  // Accept either a raw array or an EditThisCookie-style export.
  return Array.isArray(cookies) ? cookies : cookies.cookies || [];
}

async function main() {
  const leads = await loadLeads();
  const cookies = await loadCookies();
  console.log(`Connecting to Browserless… (${leads.length} leads queued)`);

  const browser = await puppeteer.connect({ browserWSEndpoint: WS });
  const page = await browser.newPage();

  try {
    await page.setCookie(...cookies);
    await page.goto(CAMPAIGN_URL, { waitUntil: "networkidle2", timeout: 60_000 });

    // Guard: if cookies are stale we land on the login page.
    if (/\/login/i.test(page.url())) {
      throw new Error(
        "Session expired — re-export cookies into " + COOKIES_FILE,
      );
    }

    // TODO:UI — map these against the real add-leads flow of whatever
    // outreach tool you're driving:
    //   1. click the campaign's "Add leads" / "Add prospects" button
    //   2. choose "Import from a list of LinkedIn URLs" (or CSV upload)
    //   3. paste leads.map(l => l.url).join("\n")  OR  upload data/leads.csv
    //   4. confirm / start, and read back how many were accepted
    // Selectors and exact step order depend entirely on the tool, fill them
    // in once you've watched the real flow.
    throw new Error(
      "Add-leads interaction not yet mapped — log into the outreach tool so the flow can be recorded.",
    );
  } finally {
    await page.close();
    await browser.disconnect();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
