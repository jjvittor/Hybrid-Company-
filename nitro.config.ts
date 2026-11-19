import { fileURLToPath } from "node:url";
import { defineNitroConfig } from "nitro/config";

export default defineNitroConfig({
  modules: [
    (nitro) => {
      if (nitro.options.preset !== "cloudflare-module") return;
      nitro.options.alias["#ybrd-origin-worker"] = nitro.options.entry;
      nitro.options.entry = fileURLToPath(new URL("./deploy/worker.mjs", import.meta.url));
      const cf = (nitro.options.cloudflare ??= {});
      cf.wrangler = {
        ...cf.wrangler,
        durable_objects: { bindings: [{ name: "YBRD_TRAFFIC", class_name: "TrafficBudget" }] },
        triggers: { crons: ["* * * * *"] },
        migrations: [{ tag: "ybrd-traffic-v1", new_sqlite_classes: ["TrafficBudget"] }],
      };
    },
  ],
});
