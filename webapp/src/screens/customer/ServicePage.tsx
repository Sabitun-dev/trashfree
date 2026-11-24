// A short page for each service: what we do, why us, how it works, the price — then "Buyurtma berish".
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { MainButton } from "../../lib/buttons";
import { clearDraft } from "../../lib/draft";
import { useQuery } from "../../lib/query";
import { useNav } from "../../lib/router";
import { useSession } from "../../lib/session";
import { Icon } from "../../ui/Icon";
import { Card, cx } from "../../ui/kit";
import { Page } from "../../ui/layout";
import { SERVICE_INFO } from "./serviceInfo";
import { TONE } from "./ServiceMenu";

type Code = "trash" | "carpet" | "curtain";
const LABEL = { trash: "svc_trash", carpet: "svc_carpet", curtain: "svc_curtain" } as const;
const ICON = { trash: "trash", carpet: "carpet", curtain: "curtain" } as const;

export function ServicePage({ service }: { service: Code }) {
  const t = useT();
  const nav = useNav();
  const s = useSession();
  const info = SERVICE_INFO[service][t.lang];
  const tone = TONE[service];
  const wash = service !== "trash";
  const washInfo = useQuery<{ pricePerM2: number; minOrder: number; deliveryFee: number; freeDeliveryFrom: number }>(wash ? `winfo:${service}` : null, () => api.get(`/wash/info?service=${service}`));
  const open = s.services.find((x) => x.code === service)?.visibility === "open";
  // Trash: the cheapest first-bag price across the active types and sizes.
  const trashFrom = s.catalog.prices.length ? Math.min(...s.catalog.prices.map((p) => p.firstPrice)) : null;

  function start() {
    if (service === "trash") {
      clearDraft();
      nav.push("new_order", { step: 1 });
    } else {
      nav.push("wash_new", { service });
    }
  }

  return (
    <Page hasMainButton>
      <div className={cx("card-hc rounded-[26px] border-2 p-5", tone.card)}>
        <span className={cx("flex h-16 w-16 items-center justify-center rounded-[20px]", tone.icon)}>
          <Icon name={ICON[service]} size={36} />
        </span>
        <h1 className="mt-4 text-[28px] font-extrabold leading-8 tracking-tight">{t(LABEL[service])}</h1>
        <p className="mt-2 text-[17px] leading-6 text-ink/80">{info.tagline}</p>
      </div>

      <h2 className="mb-2.5 mt-6 px-1 text-[19px] font-bold">{t("si_why")}</h2>
      <div className="grid grid-cols-1 gap-2.5">
        {info.benefits.map((b) => (
          <Card key={b.title} className="flex items-start gap-3 p-3.5">
            <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tone.icon)}>
              <Icon name={b.icon} size={20} />
            </span>
            <span className="min-w-0">
              <span className="block font-bold leading-5">{b.title}</span>
              <span className="mt-0.5 block text-[14px] leading-5 text-hint">{b.text}</span>
            </span>
          </Card>
        ))}
      </div>

      <h2 className="mb-2.5 mt-6 px-1 text-[19px] font-bold">{t("si_how")}</h2>
      <Card>
        <ol className="relative">
          {info.steps.map((step, i) => (
            <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
              {i < info.steps.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-28px)] w-0.5 bg-line" aria-hidden />}
              <span className={cx("relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[15px] font-bold", tone.icon)}>{i + 1}</span>
              <span className="pt-1 text-[16px] leading-6">{step}</span>
            </li>
          ))}
        </ol>
      </Card>

      {(wash ? washInfo.data : trashFrom != null) && (
        <Card className="mt-4">
          <p className="text-[15px] font-semibold text-hint">{t("price")}</p>
          {wash && washInfo.data ? (
            <ul className="mt-1 space-y-0.5 text-[16px]">
              <li>
                <b className="money">{t("wash_price_info", { price: t.som(washInfo.data.pricePerM2) })}</b>
              </li>
              <li className="text-hint">{t("wash_min_info", { min: t.som(washInfo.data.minOrder) })}</li>
              <li className="text-hint">{t("wash_delivery_info", { fee: t.som(washInfo.data.deliveryFee), free: t.som(washInfo.data.freeDeliveryFrom) })}</li>
            </ul>
          ) : (
            <p className="mt-1 text-[16px]">
              {t("si_trash_price")}: <b className="money">{t("si_from", { price: t.som(trashFrom!) })}</b>
            </p>
          )}
        </Card>
      )}

      {open ? <MainButton text={t("wash_place")} onClick={start} /> : <p className="mt-5 text-center font-semibold text-mute">{t("svc_unavailable")}</p>}
    </Page>
  );
}
