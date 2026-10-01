import type { JobDefinition } from "./registry";
import { priceAlertsJob } from "./price-alerts";
import { top100Job } from "./top100";

export { runDueJobs, type JobOutcome } from "./registry";

/** Every scheduled job. Adding one is a defineJob() here. */
export function allJobs(): JobDefinition[] {
  return [top100Job(), priceAlertsJob()];
}
