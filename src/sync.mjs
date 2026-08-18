// Orchestrator: fetch → classify → push, in sequence.
// Each stage is also runnable on its own (npm run fetch / classify / push).

import { spawn } from "node:child_process";

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { stdio: "inherit" });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`)),
    );
  });
}

await run("src/fetch-hubspot.mjs"); // CRM list + company firmographics → leads.json
await run("src/classify-icp.mjs"); // leads.json → classified.json (Claude ICP tier)
await run("src/push-dripify.mjs"); // qualified → outreach campaign
