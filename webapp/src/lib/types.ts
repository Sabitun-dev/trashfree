// Shapes returned by the API (kept in sync with src/server/**/serialize.ts).
import type { PriceBreakdown } from "@domain/price";
import type { OrderStatus, PaymentMethod, PaymentStatus, Role } from "@domain/types";

export interface Named {
  nameUz: string;
  nameRu: string;
  nameEn: string;
}

export interface City extends Named {
  id: number;
  code: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  active: boolean;
}
export interface TrashType extends Named {
  id: number;
  code: string;
  icon: string;
  ikpu: string | null;
  packageCode: string | null;
  active: boolean;
  sort: number;
}
export interface PackageSize extends Named {
  id: number;
  code: string;
  liters: number;
  active: boolean;
  sort: number;
}
export interface PriceRule {
  id: number;
  trashTypeId: number;
  packageSizeId: number;
  firstPrice: number;
  extraPrice: number;
}
export interface TimeSlot {
  id: number;
  startMinute: number;
  endMinute: number;
  capacity: number | null;
  priority: boolean;
  active: boolean;
}
export interface Plan extends Named {
  id: number;
  code: string;
  pickups: number;
  price: number;
  durationDays: number;
  active: boolean;
}

export interface Me {
  id: number;
  name: string;
  phone: string | null;
  role: Role;
  language: "uz" | "ru" | "en";
  nameConfirmed: boolean;
  introSeen: string[];
  mutedCategories: string[];
  cityIds: number[];
  deletionRequested: boolean;
  botReachable: boolean;
  services: ("trash" | "carpet" | "curtain")[];
}

export interface SubscriptionDTO {
  id: number;
  status: string;
  plan: Named & { id: number; code: string; pickups: number };
  periodStart: string | null;
  periodEnd: string | null;
  pickupsTotal: number;
  pickupsUsed: number;
  left: number;
}

export interface Bootstrap {
  me: Me;
  startParam: string | null;
  catalog: { cities: City[]; trashTypes: TrashType[]; packageSizes: PackageSize[]; prices: PriceRule[]; slots: TimeSlot[]; plans: Plan[] };
  settings: {
    maxQuantity: number;
    maxPhotos: number;
    bookingDaysAhead: number;
    slotCutoffMinutes: number;
    paymentTimeoutMinutes: number;
    methods: Record<PaymentMethod, boolean>;
    prioritySlotsForSubscribers: boolean;
    supportPhone: string;
  };
  subscription: SubscriptionDTO | null;
  unread: number;
  services: { code: "trash" | "carpet" | "curtain"; visibility: "open" | "unavailable" | "hidden"; message: string | null }[];
  bot: { username: string | null; app: string };
}

export interface PersonDTO {
  id: number;
  name: string;
  phone?: string | null;
}

export interface OrderDTO {
  id: string;
  number: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  cityId: number;
  address: string;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  trashTypeId: number;
  packageSizeId: number;
  quantity: number;
  pickupDate: string;
  slotId: number;
  slotStart: number;
  slotEnd: number;
  priceTotal: number;
  priceBreakdown: PriceBreakdown;
  createdAt: string;
  paidAt: string | null;
  acceptedAt: string | null;
  onTheWayAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  expiresAt: string | null;
  rating: number | null;
  ratingComment: string | null;
  cashCollected: number | null;
  courier: PersonDTO | null;
  customer: PersonDTO | null;
  photos: { id: string; kind: "customer" | "completion" }[];
  receiptNo: string | null;
  canCancel: boolean;
}

export interface CreateOrderResult {
  order: OrderDTO;
  payment?: { mode: "telegram"; invoiceUrl: string } | { mode: "merchant"; url: string } | null;
}

export interface NotificationDTO {
  id: number;
  type: string;
  payload: Record<string, string | number>;
  readAt: string | null;
  createdAt: string;
}

export interface PaymentDTO {
  id: string;
  amount: number;
  method: PaymentMethod;
  provider: string;
  status: string;
  receiptNo: string | null;
  paidAt: string | null;
  createdAt: string;
  orderId: string | null;
  orderNumber: number | null;
  subscriptionId: number | null;
  planName: Named | null;
}

export interface AddressDTO {
  id: number;
  label: string;
  address: string;
  lat: number;
  lng: number;
  notes: string | null;
}
