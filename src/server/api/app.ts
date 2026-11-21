// All /api/* routes. This file is platform-neutral: a VPS can serve it with @hono/node-server.
import { auth, createApp } from "./context";
import { meRoutes } from "./routes/me";

export function buildApi() {
  const app = createApp().basePath("/api");
  app.get("/health", (c) => c.json({ ok: true }));
  app.use("*", auth);
  app.route("/", meRoutes);
  return app;
}
