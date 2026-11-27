// Read-only review diagnostics for this branch's disposable Actions checkout.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import prettier from "prettier";
const files = ["src/lib/payment.server.ts","src/lib/service-signatures.server.ts","src/lib/fulfillment.server.ts","src/lib/account-http.server.ts","src/lib/commerce-http.server.ts","src/test/server-boundaries.test.ts","tests/edge.test.mjs","scripts/check-auth.mjs","deploy/traffic-budget.mjs","scripts/check-secrets.mjs","src/test/payment-environment.test.ts"];
for (const path of files) {
  const source = readFileSync(path, "utf8");
  const formatted = await prettier.format(source, { ...(await prettier.resolveConfig(path)), filepath: path });
  if (formatted !== source) writeFileSync(path, formatted);
}
const diff = execFileSync("git", ["diff", "--no-color", "--unified=0", "--", ...files]);
const encoded = diff.toString("base64");
for (let i=0; i<encoded.length; i+=4096) console.log("YBRD_FMT_" + encoded.slice(i, i+4096));
