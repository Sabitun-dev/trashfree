import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import { Root } from "./App";

async function start() {
  const w = window.Telegram?.WebApp;
  if (w) {
    w.ready();
    w.expand();
    w.disableVerticalSwipes?.();
  }
  // Browser preview with demo data (development only; removed from production builds).
  if (import.meta.env.DEV) {
    const mock = new URLSearchParams(location.search).get("mock");
    if (mock) await (await import("./mock")).installMock(mock);
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
}

void start();
