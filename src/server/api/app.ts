// All /api/* routes. This file is platform-neutral: a VPS can serve it with @hono/node-server.
import { auth, createApp } from "./context";
import { adminRoutes } from "./routes/admin";
import { courierRoutes } from "./routes/courier";
import { customerRoutes } from "./routes/customer";
import { meRoutes } from "./routes/me";
import { notificationRoutes } from "./routes/notifications";
import { paymentRoutes } from "./routes/payments";
import { subscriptionRoutes } from "./routes/subscriptions";

export function buildApi() {
  const app = createApp().basePath("/api");
  app.get("/health", (c) => c.json({ ok: true }));
  app.use("*", auth);
  app.route("/", meRoutes);
  app.route("/", customerRoutes);
  app.route("/", courierRoutes);
  app.route("/", notificationRoutes);
  app.route("/", paymentRoutes);
  app.route("/", subscriptionRoutes);
  app.route("/", adminRoutes);
  return app;
}
