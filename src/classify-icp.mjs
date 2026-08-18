// ICP classification: run each profile through Claude Haiku and tag it
// strong / possible / weak. Uses the Batches API (cheaper, async) since a
// full list is rarely latency-sensitive, and structured outputs so every
// response is valid JSON you can trust without parsing guesswork.
//
// Input:  data/leads.json (CRM contact + associated-company firmographics).
// Output: data/classified.json — each lead plus its verdict.

import { readFile, writeFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { RUBRIC, VERDICT_SCHEMA, QUALIFYING_TIERS } from "./icp.mjs";

const MODEL = "claude-haiku-4-5";
const client = new Anthropic(); // reads ANTHROPIC_API_KEY

async function loadInput() {
  const rows = JSON.parse(await readFile("data/leads.json", "utf8"));
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("data/leads.json empty — run `npm run fetch` first.");
  }
  console.log(`Classifying ${rows.length} leads`);
  return rows;
}

// Compact the lead + its associated-company firmographics into the text the
// model judges.
function profileText(r) {
  const lines = [
    r.title ? `Job title: ${r.title}` : "Job title: (unknown)",
    r.company ? `Company: ${r.company}` : null,
    r.companyIndustry ? `Industry: ${r.companyIndustry}` : null,
    r.companyEmployees ? `Employees: ${r.companyEmployees}` : null,
    r.companyRevenue ? `Annual revenue (USD): ${r.companyRevenue}` : null,
    r.companyCountry ? `Country: ${r.companyCountry}` : null,
    r.companyDescription ? `What the company does: ${r.companyDescription}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function buildRequest(r) {
  return {
    custom_id: String(r.id || r.url),
    params: {
      model: MODEL,
      max_tokens: 512,
      system: [
        { type: "text", text: RUBRIC, cache_control: { type: "ephemeral" } },
      ],
      output_config: { format: { type: "json_schema", schema: VERDICT_SCHEMA } },
      messages: [{ role: "user", content: profileText(r) }],
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const rows = await loadInput();
  const byId = new Map(rows.map((r) => [String(r.id || r.url), r]));

  console.log("Submitting batch…");
  const batch = await client.messages.batches.create({
    requests: rows.map(buildRequest),
  });
  console.log(`  batch ${batch.id} — polling until complete`);

  let status = batch;
  while (status.processing_status !== "ended") {
    await sleep(30_000);
    status = await client.messages.batches.retrieve(batch.id);
    const c = status.request_counts;
    console.log(`  ${status.processing_status} — done ${c.succeeded}, errored ${c.errored}, processing ${c.processing}`);
  }

  const classified = [];
  for await (const res of await client.messages.batches.results(batch.id)) {
    const lead = byId.get(res.custom_id);
    if (!lead) continue;
    if (res.result.type !== "succeeded") {
      classified.push({ ...lead, verdict: null, error: res.result.type });
      continue;
    }
    const text = res.result.message.content.find((b) => b.type === "text")?.text;
    let verdict = null;
    try {
      verdict = JSON.parse(text);
    } catch {
      // structured outputs make this rare; leave null on the odd malformed reply
    }
    classified.push({ ...lead, verdict });
  }

  await writeFile("data/classified.json", JSON.stringify(classified, null, 2));

  const tally = { strong: 0, possible: 0, weak: 0, unclassified: 0 };
  for (const c of classified) tally[c.verdict?.fit || "unclassified"]++;
  const qualified = classified.filter((c) => QUALIFYING_TIERS.includes(c.verdict?.fit));

  console.log("\nResults:");
  console.log(`  strong:   ${tally.strong}`);
  console.log(`  possible: ${tally.possible}`);
  console.log(`  weak:     ${tally.weak}`);
  if (tally.unclassified) console.log(`  unclassified: ${tally.unclassified}`);
  console.log(`\n${qualified.length} qualify for the outreach campaign (tiers: ${QUALIFYING_TIERS.join(", ")})`);
  console.log("Wrote data/classified.json");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
