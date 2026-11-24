// First launch: a skippable 3-screen intro per role.
import { useState } from "react";
import { useT } from "../../i18n";
import type { DictKey } from "../../i18n/uz";
import { MainButton } from "../../lib/buttons";
import type { Mode } from "../../lib/session";
import { Icon } from "../../ui/Icon";
import { cx } from "../../ui/kit";

const SLIDES: Record<Mode, { icon: string; t: DictKey; d: DictKey }[]> = {
  customer: [
    { icon: "trash", t: "intro_c1_t", d: "intro_c1_d" },
    { icon: "calendar", t: "intro_c2_t", d: "intro_c2_d" },
    { icon: "bell", t: "intro_c3_t", d: "intro_c3_d" },
  ],
  courier: [
    { icon: "map", t: "intro_k1_t", d: "intro_k1_d" },
    { icon: "check", t: "intro_k2_t", d: "intro_k2_d" },
    { icon: "cash", t: "intro_k3_t", d: "intro_k3_d" },
  ],
  washer: [
    { icon: "box", t: "intro_w1_t", d: "intro_w1_d" },
    { icon: "edit", t: "intro_w2_t", d: "intro_w2_d" },
    { icon: "sparkle", t: "intro_w3_t", d: "intro_w3_d" },
  ],
  admin: [
    { icon: "chart", t: "intro_a1_t", d: "intro_a1_d" },
    { icon: "settings", t: "intro_a2_t", d: "intro_a2_d" },
    { icon: "megaphone", t: "intro_a3_t", d: "intro_a3_d" },
  ],
};

export function Intro({ mode, onDone }: { mode: Mode; onDone: () => void }) {
  const t = useT();
  const [i, setI] = useState(0);
  const slides = SLIDES[mode];
  const s = slides[i];
  const last = i === slides.length - 1;
  return (
    <main className="mx-auto flex min-h-full max-w-[480px] flex-col px-6 pb-32 pt-4">
      <div className="flex justify-end">
        <button onClick={onDone} className="min-h-tap px-3 text-[16px] font-semibold text-hint">
          {t("skip")}
        </button>
      </div>
      <div key={i} className="flex flex-1 flex-col items-center justify-center text-center animate-fade">
        <div className="mb-8 flex h-40 w-40 items-center justify-center rounded-[48px] bg-accent-soft text-accent-ink">
          <Icon name={s.icon} size={80} strokeWidth={1.6} />
        </div>
        <h1 className="text-hero font-extrabold tracking-tight">{t(s.t)}</h1>
        <p className="mt-3 text-[18px] text-hint">{t(s.d)}</p>
      </div>
      <div className="flex justify-center gap-2 py-6" aria-hidden>
        {slides.map((_, k) => (
          <span key={k} className={cx("h-2 rounded-full transition-all", k === i ? "w-6 bg-accent" : "w-2 bg-line")} />
        ))}
      </div>
      <MainButton text={last ? t("start") : t("next")} onClick={() => (last ? onDone() : setI(i + 1))} />
    </main>
  );
}
