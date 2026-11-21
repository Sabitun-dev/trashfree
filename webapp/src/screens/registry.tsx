// Every screen by route name, and the tab roots per mode. Courier and admin screens load lazily.
import { type ComponentType } from "react";
import type { DictKey } from "../i18n/uz";
import type { Mode } from "../lib/session";
import { Profile } from "./common/Profile";
import { Soon } from "./common/Soon";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SCREENS: Record<string, ComponentType<any>> = {
  home: Soon,
  orders: Soon,
  plans: Soon,
  profile: Profile,
  c_list: Soon,
  c_map: Soon,
  c_today: Soon,
  a_dash: Soon,
  a_orders: Soon,
  a_people: Soon,
  a_catalog: Soon,
  a_more: Soon,
};

export const TAB_ROOTS: Record<Mode, { name: string; label: DictKey; icon: string }[]> = {
  customer: [
    { name: "home", label: "tab_home", icon: "home" },
    { name: "orders", label: "tab_orders", icon: "list" },
    { name: "plans", label: "tab_plans", icon: "crown" },
    { name: "profile", label: "tab_profile", icon: "user" },
  ],
  courier: [
    { name: "c_list", label: "tab_orders", icon: "list" },
    { name: "c_map", label: "tab_map", icon: "map" },
    { name: "c_today", label: "tab_today", icon: "cash" },
    { name: "profile", label: "tab_profile", icon: "user" },
  ],
  admin: [
    { name: "a_dash", label: "tab_dashboard", icon: "chart" },
    { name: "a_orders", label: "tab_orders", icon: "list" },
    { name: "a_people", label: "tab_people", icon: "users" },
    { name: "a_catalog", label: "tab_catalog", icon: "box" },
    { name: "a_more", label: "more", icon: "settings" },
  ],
};
