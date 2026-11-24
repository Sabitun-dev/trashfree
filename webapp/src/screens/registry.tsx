// Every screen by route name, and the tab roots per mode. Courier and admin screens load lazily.
import { lazy, type ComponentType } from "react";
import type { DictKey } from "../i18n/uz";
import type { Mode } from "../lib/session";
import { Invite, Support } from "./common/Invite";
import { Notifications } from "./common/Notifications";
import { Profile } from "./common/Profile";
import { Addresses } from "./customer/Addresses";
import { Home } from "./customer/Home";
import { NewOrder } from "./customer/NewOrder";
import { OrderDetail } from "./customer/OrderDetail";
import { Orders } from "./customer/Orders";
import { PaymentsHistory, ReceiptScreen } from "./customer/Payments";
import { Plans } from "./customer/Plans";

const courier = () => import("./courier");
const CourierList = lazy(() => courier().then((m) => ({ default: m.CourierList })));
const CourierMap = lazy(() => courier().then((m) => ({ default: m.CourierMap })));
const CourierToday = lazy(() => courier().then((m) => ({ default: m.CourierToday })));
const CourierOrderScreen = lazy(() => courier().then((m) => ({ default: m.CourierOrderScreen })));

const wash = () => import("./wash");
const WashNew = lazy(() => wash().then((m) => ({ default: m.WashNew })));
const WashOrderScreen = lazy(() => wash().then((m) => ({ default: m.WashOrderScreen })));
const CourierWash = lazy(() => wash().then((m) => ({ default: m.CourierWash })));
const WasherList = lazy(() => wash().then((m) => ({ default: m.WasherList })));
const WasherOrder = lazy(() => wash().then((m) => ({ default: m.WasherOrder })));

const admin = () => import("./admin");
const A = (name: keyof Awaited<ReturnType<typeof admin>>) => lazy(() => admin().then((m) => ({ default: m[name] as ComponentType<any> })));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SCREENS: Record<string, ComponentType<any>> = {
  home: Home,
  orders: Orders,
  new_order: NewOrder,
  order: OrderDetail,
  addresses: Addresses,
  payments: PaymentsHistory,
  receipt: ReceiptScreen,
  plans: Plans,
  profile: Profile,
  notifications: Notifications,
  invite: Invite,
  support: Support,
  wash_new: WashNew,
  wash_order: WashOrderScreen,
  c_wash: CourierWash,
  w_list: WasherList,
  w_order: WasherOrder,
  c_list: CourierList,
  c_order: CourierOrderScreen,
  c_map: CourierMap,
  c_today: CourierToday,
  a_dash: A("AdminDashboard"),
  a_orders: A("AdminOrders"),
  a_order: A("AdminOrder"),
  a_people: A("AdminPeople"),
  a_person: A("AdminPerson"),
  a_catalog: A("AdminCatalog"),
  a_entities: A("AdminEntities"),
  a_prices: A("AdminPrices"),
  a_more: A("AdminMore"),
  a_broadcast: A("AdminBroadcast"),
  a_cash: A("AdminCash"),
  a_audit: A("AdminAudit"),
  a_settings: A("AdminSettings"),
  a_services: A("AdminServices"),
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
  washer: [
    { name: "w_list", label: "tab_orders", icon: "list" },
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
