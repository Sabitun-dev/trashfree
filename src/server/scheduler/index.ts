// All scheduled jobs are registered here.
import { resumeBroadcasts } from "../admin/broadcast";
import { subscriptionReminders } from "../subscriptions/jobs";
import { registerJob } from "./jobs";

registerJob({ name: "subscription_reminders", run: subscriptionReminders });
registerJob({ name: "resume_broadcasts", run: resumeBroadcasts });

export { runScheduler } from "./jobs";
