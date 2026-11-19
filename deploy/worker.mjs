import origin from "#ybrd-origin-worker";
import { withTrafficBudget, runMaintenance } from "./traffic-budget.mjs";

export { TrafficBudget } from "./traffic-budget.mjs";
export default {
  ...origin,
  fetch: withTrafficBudget(origin),
  async scheduled(event, env, ctx) {
    await Promise.all([origin.scheduled?.(event, env, ctx), runMaintenance(origin, env, ctx)]);
  },
};
