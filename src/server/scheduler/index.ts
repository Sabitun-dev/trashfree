// All scheduled jobs are registered here.
import { resumeBroadcasts } from "../admin/broadcast";
import { dailyCleanup } from "../cleanup";
import { reopenScheduledServices } from "../services";
import { subscriptionReminders } from "../subscriptions/jobs";
import { registerJob } from "./jobs";

registerJob({ name: "reopen_services", run: reopenScheduledServices });
registerJob({ name: "subscription_reminders", run: subscriptionReminders });
registerJob({ name: "resume_broadcasts", run: resumeBroadcasts });
registerJob({ name: "daily_cleanup", run: dailyCleanup, daily: true });

export { runScheduler } from "./jobs";
