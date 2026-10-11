// Данные витрины, которые один раз приходят в браузер при входе и живут в его хранилище.
// Общие типы для сервера и браузера. Даты строками: день «2026-10-11», момент ISO.

import type { Action } from "./perms";
import type { BodyCode } from "./freight";

export type OrderStatusCode = "ACCEPTED" | "IN_TRANSIT" | "AT_WAREHOUSE" | "WITH_COURIER" | "DELIVERED" | "CANCELLED";
export type TripStatusCode = "PLANNED" | "IN_TRANSIT" | "ARRIVED";
export type DocKindCode = "CONTRACT" | "WAREHOUSE" | "CMR" | "ACT" | "INVOICE";
export type DocStatusCode = "DRAFT" | "SENT" | "SIGNED";
export type RoleCode = "OWNER" | "MANAGER" | "ACCOUNTANT" | "COURIER";

export type SOrder = {
  id: string;
  seq: number;
  clientId: string;
  routeId: string;
  tripId: string | null;
  loadIndex: number | null;
  cargo: string;
  places: number;
  pallets: number;
  weightKg: number;
  volumeM3: number;
  dims: string | null;
  declaredValue: number | null;
  loadCity: string;
  loadRegion: string;
  loadAddress: string | null;
  loadFrom: string;
  loadTo: string | null;
  loadTime: string | null;
  unloadCity: string;
  unloadRegion: string;
  unloadAddress: string | null;
  unloadFrom: string | null;
  unloadTo: string | null;
  unloadTime: string | null;
  distanceKm: number;
  body: BodyCode;
  loading: string;
  separate: boolean;
  delivery: boolean;
  recipientName: string | null;
  recipientPhone: string | null;
  // ставка и форма оплаты: в публичную часть не входят
  comment: string | null;
  status: OrderStatusCode;
  courierId: string | null;
  archived: boolean;
  archivedReason: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string | null;
  deliveredAt: string | null;
  /** заявка ещё сохраняется на сервере */
  pending?: boolean;
};

export type STrip = {
  id: string;
  number: number;
  routeId: string;
  driverId: string | null;
  vehicleId: string | null;
  departDate: string | null;
  arriveDate: string | null;
  departedAt: string | null;
  arrivedAt: string | null;
  status: TripStatusCode;
  createdAt: string;
  pending?: boolean;
};

export type SClient = {
  id: string;
  kind: "PERSON" | "COMPANY";
  name: string;
  residency: "RU" | "BY" | null;
  taxId: string | null;
  kpp: string | null;
  bankName: string | null;
  account: string | null;
  director: string | null;
  contactPerson: string | null;
  address: string | null;
  phones: string[];
  email: string | null;
  hidden: boolean;
  hiddenReason: string | null;
  createdAt: string;
};

export type SDoc = {
  id: string;
  kind: DocKindCode;
  number: string;
  date: string;
  tripId: string | null;
  orderId: string | null;
  clientId: string | null;
  status: DocStatusCode;
  sentTo: string | null;
  sentAt: string | null;
  signedAt: string | null;
  createdAt: string;
};

export type SAudit = { at: string; userName: string | null; objectType: string; objectId: string; action: string; field: string | null; oldValue: string | null; newValue: string | null; note: string | null };

export type SRoute = { id: string; fromCity: string; fromCountry: "RU" | "BY"; toCity: string; toCountry: "RU" | "BY"; distanceKm: number; ruKm: number; sortOrder: number; hidden: boolean };
export type SVehicle = { id: string; brand: string; title: string; body: BodyCode; frame: string; plate: string | null; trailerPlate: string | null; capacityKg: number; volumeM3: number; lengthM: number; widthM: number; heightM: number; pallets: number };
export type SPerson = { id: string; name: string; kind: "OWNER" | "MANAGER" | "ACCOUNTANT" | "DRIVER" | "COURIER"; phone: string; canLogin: boolean; vehicleId: string | null; hidden: boolean };

export type SCompany = {
  shortName: string;
  fullName: string;
  taxId: string;
  kpp: string | null;
  address: string;
  bankName: string;
  bankCode: string;
  account: string;
  director: string;
  phone: string;
  email: string;
  warehouseRu: string;
  byName: string;
  byTaxId: string;
  warehouseBy: string;
};

export type Snapshot = {
  version: string;
  /** день по Москве, на который построен мир, и «сейчас» сервера */
  today: string;
  now: string;
  me: { id: string; name: string; role: RoleCode; can: Action[] };
  company: SCompany;
  routes: SRoute[];
  vehicles: SVehicle[];
  persons: SPerson[];
  clients: SClient[];
  orders: SOrder[];
  trips: STrip[];
  docs: SDoc[];
  // оплаты и касса: в публичную часть не входят
  audit: SAudit[];
  marks: { loadingTripId: string | null; arrivingTripId: string | null; checklistTripId: string | null; arrivedTripId: string | null };
};
