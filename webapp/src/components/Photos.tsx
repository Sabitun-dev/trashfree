// Photo picker (camera or gallery) with on-phone compression, and a private photo viewer.
import { useEffect, useRef, useState } from "react";
import { errorText, useT } from "../i18n";
import { api, ApiError, photoUrl } from "../lib/api";
import { compressImage } from "../lib/image";
import { haptic } from "../lib/tg";
import { Icon } from "../ui/Icon";
import { cx, Spinner } from "../ui/kit";
import { useToast } from "../ui/overlays";

export function PrivatePhoto({ id, className, onClick }: { id: string; className?: string; onClick?: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    photoUrl(id)
      .then((u) => alive && setSrc(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [id]);
  if (failed) return <div className={cx("flex items-center justify-center bg-line text-hint", className)}><Icon name="camera" /></div>;
  if (!src) return <div className={cx("skeleton animate-shimmer", className)} />;
  return <img src={src} alt="" onClick={onClick} className={cx("object-cover", className)} loading="lazy" />;
}

export function PhotoPicker({
  ids,
  onChange,
  max,
  kind = "customer",
  label,
  hint,
}: {
  ids: string[];
  onChange: (ids: string[]) => void;
  max: number;
  kind?: "customer" | "completion";
  label: string;
  hint?: string;
}) {
  const t = useT();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, Math.max(0, max - ids.length));
    if (!list.length) return toast(t("err_too_many_photos", { max }), "error");
    setBusy(list.length);
    const added: string[] = [];
    for (const f of list) {
      try {
        const blob = await compressImage(f);
        const form = new FormData();
        form.append("file", blob, "photo.jpg");
        form.append("kind", kind);
        const { id } = await api.upload<{ id: string }>("/uploads", form);
        added.push(id);
        haptic.success();
      } catch (e) {
        toast(errorText(t, e instanceof ApiError ? e.code : e instanceof Error ? e.message : undefined, { max }), "error");
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (added.length) onChange([...ids, ...added]);
    if (input.current) input.current.value = "";
  }

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {ids.map((id) => (
          <div key={id} className="relative h-24 w-24 shrink-0">
            <PrivatePhoto id={id} className="h-24 w-24 rounded-2xl" />
            <button
              aria-label={t("delete")}
              onClick={() => {
                haptic.tick();
                onChange(ids.filter((x) => x !== id));
              }}
              className="absolute -right-1.5 -top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-ink text-card shadow"
            >
              <Icon name="x" size={16} strokeWidth={3} />
            </button>
          </div>
        ))}
        {Array.from({ length: busy }, (_, i) => (
          <div key={`b${i}`} className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-line text-hint">
            <Spinner />
          </div>
        ))}
        {ids.length + busy < max && (
          <button
            onClick={() => {
              haptic.tick();
              input.current?.click();
            }}
            className={cx("card-hc flex h-24 shrink-0 items-center gap-3 rounded-2xl border-2 border-dashed border-accent/50 bg-accent-soft/40 px-4 text-left text-accent-ink", ids.length ? "w-24 justify-center" : "w-full")}
          >
            <Icon name="camera" size={28} />
            {!ids.length && (
              <span>
                <span className="block font-semibold">{label}</span>
                {hint && <span className="block text-[14px] leading-5 opacity-80">{hint}</span>}
              </span>
            )}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/*" multiple={kind === "customer"} className="hidden" onChange={(e) => add(e.target.files)} />
    </div>
  );
}
