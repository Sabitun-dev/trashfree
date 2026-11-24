// All scheduled jobs are registered here.
import { resumeBroadcasts } from "../admin/broadcast";
import { dailyCleanup } from "../cleanup";
import { reopenScheduledServices } from "../services";
import { alertCashNotHandedOver, alertStuckWash, closeDeliveredWash } from "../wash/service";
import { subscriptionReminders } from "../subscriptions/jobs";
import { registerJob } from "./jobs";

registerJob({ name: "reopen_services", run: reopenScheduledServices });
registerJob({ name: "subscription_reminders", run: subscriptionReminders });
registerJob({ name: "resume_broadcasts", run: resumeBroadcasts });
registerJob({ name: "daily_cleanup", run: dailyCleanup, daily: true });
registerJob({ name: "wash_close_delivered", run: closeDeliveredWash });
registerJob({ name: "wash_stuck_alerts", run: (now) => alertStuckWash(now) });
registerJob({ name: "cash_not_handed_over", run: alertCashNotHandedOver, daily: true });

export { runScheduler } from "./jobs";
