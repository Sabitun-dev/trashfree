import { fileURLToPath } from "node:url";

const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: [fileURLToPath(new URL("./index.html", import.meta.url)), fileURLToPath(new URL("./src/**/*.{ts,tsx}", import.meta.url))],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        page: v("page"),
        card: v("card"),
        ink: v("ink"),
        hint: v("hint"),
        line: v("line"),
        accent: v("accent"),
        "on-accent": v("on-accent"),
        "accent-soft": v("accent-soft"),
        "accent-ink": v("accent-ink"),
        warn: v("warn"),
        "warn-soft": v("warn-soft"),
        danger: v("danger"),
        "danger-soft": v("danger-soft"),
        info: v("info"),
        "info-soft": v("info-soft"),
        violet: v("violet"),
        "violet-soft": v("violet-soft"),
        mute: v("mute"),
        "mute-soft": v("mute-soft"),
        chart: v("chart"),
      },
      fontSize: { body: ["17px", "24px"], title: ["24px", "30px"], hero: ["28px", "34px"] },
      borderRadius: { card: "16px" },
      minHeight: { tap: "48px", "tap-lg": "56px" },
      keyframes: {
        pop: { "0%": { transform: "scale(.9)", opacity: 0 }, "100%": { transform: "scale(1)", opacity: 1 } },
        up: { "0%": { transform: "translateY(100%)" }, "100%": { transform: "translateY(0)" } },
        fade: { "0%": { opacity: 0 }, "100%": { opacity: 1 } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        fall: { "0%": { transform: "translateY(-10vh) rotate(0)", opacity: 1 }, "100%": { transform: "translateY(100vh) rotate(540deg)", opacity: 0 } },
      },
      animation: {
        pop: "pop .25s ease-out",
        up: "up .25s cubic-bezier(.2,.8,.2,1)",
        fade: "fade .2s ease-out",
        shimmer: "shimmer 1.4s linear infinite",
      },
    },
  },
  plugins: [],
};
