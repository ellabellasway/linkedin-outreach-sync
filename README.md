# LinkedIn Outreach Sync

Qualifies your CRM leads with Claude, then adds only the good ones to a
LinkedIn outreach campaign, even though the outreach tool has no API to push
leads in.

## Why this exists

Plenty of LinkedIn outreach tools (this one was built against
[Dripify](https://dripify.io)) only work **outbound** through Zapier: they can
push data out after an invite, message, or reply, but there's no API and no
Zapier action to push a *new lead in*. The only programmatic way in is to
operate the tool's own web UI, which is what this does, via
[Browserless](https://browserless.io).

If your outreach tool already has a real "add lead" API, you don't need the
browser-automation half of this at all, just swap `push.mjs` for a direct API
call and keep the fetch + classify stages.

## Pipeline

```
CRM list ──► fetch ──► leads.json         (contact + company firmographics)
                          │
                          ▼
             classify ──► classified.json  (Claude, ICP tier per lead)
                          │   strong / possible / weak
                          ▼
                 push ──► outreach campaign (qualified tiers only)
```

No LinkedIn scraping. The ICP signal comes entirely from your CRM: the
contact's title plus their company's industry, employee count, and
description are stronger, lower-risk signals than a scraped profile.

| Stage | Script | Status |
|---|---|---|
| `npm run fetch` | `fetch-hubspot.mjs` | list membership + associated-company firmographics → `leads.json` |
| `npm run classify` | `classify-icp.mjs` | Claude Haiku, Batches API, structured JSON output |
| `npm run push` | `push-dripify.mjs` | ⚠️ scaffold — auth and navigation work; the add-leads UI interaction (`TODO:UI`) is stubbed until mapped against a real logged-in session |
| `npm run sync` | `sync.mjs` | runs all three in order |
| `npm run export:new` | `export-new.mjs` | delta-only CSV of newly-qualified leads, for a manual weekly drop |

**Your ICP rubric lives in `src/icp.mjs`.** The one shipped here is an
*example* for a developer-tools SaaS. Replace it with your own before running
this for real, the classifier is only as good as the criteria you give it.

## Setup

### 0. Try it with the bundled sample data first

No credentials needed for this part. `data/sample-leads.json` has five made-up
people at fictional companies (real API shapes, fake everyone), enough to see
the classifier actually work end to end:

```bash
npm install
cp data/sample-leads.json data/leads.json
npm run classify        # writes data/classified.json + prints a tier tally
```

The five sample leads were written to span the rubric: a devtools founder/CTO
and a senior engineering leader at a data-analytics company should land
`strong`/`possible`, a real-estate agent and an insurance account exec should
land `weak`. Claude's judgment isn't a lookup table, so treat that as what the
rubric is designed to produce, not a guarantee, and read the actual output
rather than assuming it matched. That's the whole engine. Once you trust it,
move on to your real data.

### 1. Wire up your own CRM, model, and browser access

```bash
cp .env.example .env
```

Fill in, in this order:

1. **`HUBSPOT_TOKEN`** — HubSpot > Settings > Integrations > Private Apps,
   with `crm.lists.read` and `crm.objects.contacts.read` scopes.
2. **`HUBSPOT_LIST_ID`** — open the active list you want to pull from in
   HubSpot and copy its numeric ID out of the URL.
3. **`ANTHROPIC_API_KEY`** — from the Anthropic Console.
4. **`BROWSERLESS_WS`** — from your Browserless account dashboard, a
   WebSocket URL with your token baked in.
5. **`DRIPIFY_CAMPAIGN_URL`** — open the campaign in your outreach tool and
   copy the URL.

### 2. Write your own ICP rubric

Replace the example `RUBRIC` string in `src/icp.mjs` with your own product
and buyer profile. This is the one step that can't be templated for you,
the classifier is only as good as what you put here.

### 3. Run it for real

```bash
npm run fetch      # writes data/leads.json + data/leads.csv from your live CRM list
npm run classify   # writes data/classified.json + prints a tier tally
```

### Outreach-tool auth (no password in code)

Export your outreach tool's session cookies into `dripify-cookies.json` (any
name, update `DRIPIFY_COOKIES_FILE`). Stale cookies produce a clear "session
expired" error rather than a silent failure.

## ICP classification

`classify-icp.mjs` runs each lead through `claude-haiku-4-5` with a forced
JSON schema (`strong | possible | weak` plus role-fit, company-fit, and a
one-line reasoning) via the **Batches API**, cheaper and built for volume that
isn't latency-sensitive. The rubric is sent as a cached system block. It judges
the contact's job title against the associated company's industry, employee
size, revenue, and description.

## Caveats, stated plainly

- **One `TODO:UI` remains.** The add-leads flow needs one logged-in pass
  against the real outreach tool to map its actual selectors. This repo ships
  the auth and navigation skeleton, not a finished integration. Automating a
  third-party tool's UI may also conflict with its terms of service, check
  before you point this at anything you don't have explicit permission to
  automate.
- **Respect the outreach platform's own rate limits.** LinkedIn connection
  requests are limited per week regardless of tool; the qualified set from a
  real CRM list will usually exceed what you can safely send, that's the
  funnel working, not a bug.
- **Company-data coverage is rarely total.** Employee count and revenue are
  often sparse in a CRM; the example rubric leans on industry and description
  and treats size/revenue as secondary. Spot-check the `weak` tier before
  trusting it fully.

## License

MIT. See `LICENSE`.
