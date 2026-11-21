// Mini App deep links: t.me/<bot>/<app>?startapp=<param>. Param: ≤64 chars of [A-Za-z0-9_-].

export type Screen =
  | { name: "home" }
  | { name: "order"; id: string }
  | { name: "courier" }
  | { name: "courier_order"; id: string }
  | { name: "plans" }
  | { name: "support" }
  | { name: "invite"; token: string }
  | { name: "admin" }
  | { name: "admin_user"; id: number }
  | { name: "new_order" }
  | { name: "notifications" };

const SAFE = /^[A-Za-z0-9_-]{1,64}$/;

export function encodeStartParam(s: Screen): string {
  let p: string;
  switch (s.name) {
    case "order":
      p = `order_${s.id}`;
      break;
    case "courier_order":
      p = `corder_${s.id}`;
      break;
    case "invite":
      p = `inv_${s.token}`;
      break;
    case "admin_user":
      p = `auser_${s.id}`;
      break;
    default:
      p = s.name;
  }
  if (!SAFE.test(p)) throw new Error("bad_start_param");
  return p;
}

export function decodeStartParam(p: string | null | undefined): Screen {
  if (!p || !SAFE.test(p)) return { name: "home" };
  const [head, ...rest] = p.split("_");
  const tail = rest.join("_");
  switch (head) {
    case "order":
      return tail ? { name: "order", id: tail } : { name: "home" };
    case "corder":
      return tail ? { name: "courier_order", id: tail } : { name: "courier" };
    case "inv":
      return tail ? { name: "invite", token: tail } : { name: "home" };
    case "auser":
      return Number(tail) > 0 ? { name: "admin_user", id: Number(tail) } : { name: "admin" };
  }
  if (["courier", "plans", "support", "admin", "new_order", "notifications"].includes(p)) {
    return { name: p } as Screen;
  }
  if (p === "new") return { name: "new_order" };
  return { name: "home" };
}
