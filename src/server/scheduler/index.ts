// All scheduled jobs are registered here.
import { subscriptionReminders } from "../subscriptions/jobs";
import { registerJob } from "./jobs";

registerJob({ name: "subscription_reminders", run: subscriptionReminders });

export { runScheduler } from "./jobs";
