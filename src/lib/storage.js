export const KEYS = {
  PATIENTS:     'hd_patients',
  DIET_TYPES:   'hd_diet_types',
  DIET_TEMPLATES: 'hd_diet_templates',
  MEAL_TYPES:   'hd_meal_types',
  FOOD_MASTER:  'hd_food_master',
  DIET_MAPPING: 'hd_diet_mapping',
  DIET_HISTORY: 'hd_diet_history',
};

export const STANDARD_UNITS = ["g", "kg", "ml", "L", "piece", "slice", "cup", "bowl", "glass"];

const appStore = new Map();
const PRESERVED_APP_STORAGE_KEYS = new Set(["hd_role_permissions"]);

export function clearLegacyAppStorage() {
  appStore.clear();
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index),
    ).filter(
      (key) =>
        key &&
        ((key.startsWith("hd_") && !PRESERVED_APP_STORAGE_KEYS.has(key)) ||
          key === "mealConsumptionDaily"),
    );
    keys.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.warn("Could not clear legacy DietCare browser data.", error);
  }
}

const cloneStoreValue = (value) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));

export function normalizeUnit(unit) {
  const value = String(unit || "").trim().toLowerCase();
  const aliases = {
    gram: "g",
    grams: "g",
    gm: "g",
    kgs: "kg",
    millilitre: "ml",
    millilitres: "ml",
    milliliter: "ml",
    milliliters: "ml",
    pc: "piece",
    pcs: "piece",
    pieces: "piece",
    slices: "slice",
    cups: "cup",
    bowls: "bowl",
    glasses: "glass",
  };
  const normalized = aliases[value] || value;
  return STANDARD_UNITS.includes(normalized) ? normalized : "";
}

export function positiveQuantity(value) {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

export function resolveQuantity(mappingQuantity, foodQuantity) {
  return positiveQuantity(mappingQuantity) ?? positiveQuantity(foodQuantity);
}

export function resolveDisplayUnit(
  mappingUnit,
  foodUnit,
  canonicalUnit,
  quantity,
  canonicalQuantity,
) {
  const normalizedMappingUnit = normalizeUnit(mappingUnit);
  const normalizedFoodUnit = normalizeUnit(foodUnit);
  const normalizedCanonicalUnit = normalizeUnit(canonicalUnit);
  const inheritedCanonicalQuantity =
    positiveQuantity(quantity) !== null &&
    positiveQuantity(quantity) === positiveQuantity(canonicalQuantity);

  if (inheritedCanonicalQuantity && normalizedCanonicalUnit) {
    return normalizedCanonicalUnit;
  }
  return normalizedMappingUnit || normalizedFoodUnit || normalizedCanonicalUnit;
}

export function getStore(key, fallback = []) {
  return appStore.has(key) ? cloneStoreValue(appStore.get(key)) : fallback;
}

export function setStore(key, data) {
  appStore.set(key, cloneStoreValue(data));
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("dietcare-store-updated", { detail: { key } }),
    );
  }
}

export function initStore(key, seedData) {
  if (!appStore.has(key)) setStore(key, seedData);
}

export function addRecord(key, record) {
  const data = getStore(key);
  const id = data.length > 0 ? Math.max(...data.map(d => d.id || 0)) + 1 : 1;
  const newRecord = { ...record, id, createdAt: new Date().toISOString() };
  setStore(key, [...data, newRecord]);
  return newRecord;
}

export function updateRecord(key, id, patch) {
  const data = getStore(key);
  const i = data.findIndex(r => r.id === id);
  if (i !== -1) {
    data[i] = { ...data[i], ...patch, updatedAt: new Date().toISOString() };
    setStore(key, data);
    return data[i];
  }
  return null;
}


export function getLocalDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return new Date().toLocaleDateString("en-CA");
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const MEAL_STATUS_ORDER = [
  "Pending",
  "Assigned",
  "Approved",
  "Preparing",
  "Prepared",
  "Delivering",
  "Delivered",
];

export function deriveWorkflowStatusFromMealStatuses(statusMap = {}, patientId, serviceDate = getLocalDateKey()) {
  const meals = ["Breakfast", "Mid-Morning", "Lunch", "Evening Snack", "Dinner", "Bedtime"];
  const statuses = meals.map((meal) =>
    statusMap?.[`${serviceDate}-${patientId}-${meal}`] || statusMap?.[`${patientId}-${meal}`] || "Pending",
  );
  const active = statuses.filter((status) => status && status !== "Pending");
  if (!active.length) return "Assigned";
  if (active.every((status) => status === "Delivered")) return "Delivered";
  if (active.some((status) => ["Delivering", "Dispatched"].includes(status))) return "Delivering";
  if (active.some((status) => status === "Prepared" || status === "Ready")) return "Prepared";
  if (active.some((status) => status === "Preparing")) return "Preparing";
  return "Assigned";
}

export function syncWorkflowFromMealStatuses(patientId, serviceDate, statusMap, module = "Kitchen Operations") {
  const flowKey = "hd_diet_workflow";
  const current = getStore(flowKey, []);
  const flow = current.find((item) => String(item.patientId) === String(patientId));
  // Historical terminal workflows must never be recalculated by a new meal/day.
  if (!flow || flow.status === "Cancelled" || flow.status === "Discharged") return null;
  const nextStatus = deriveWorkflowStatusFromMealStatuses(statusMap, patientId, serviceDate);
  if (flow.status === nextStatus) return flow;
  const updated = { ...flow, status: nextStatus, serviceDate, updatedAt: new Date().toISOString() };
  setStore(flowKey, current.map((item) => item.id === flow.id ? updated : item));
  return updated;
}

export function appendHistoryEvent(event = {}) {
  const history = getStore(KEYS.DIET_HISTORY, []);
  const record = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    eventDate: new Date().toISOString(),
    serviceDate: event.serviceDate || new Date().toISOString().slice(0, 10),
    ...event,
  };
  setStore(KEYS.DIET_HISTORY, [record, ...history]);
  return record;
}

export function getHistoryForDate(serviceDate) {
  return getStore(KEYS.DIET_HISTORY, []).filter(
    (event) => String(event.serviceDate) === String(serviceDate),
  );
}

export function deleteRecord(key, id) {
  setStore(key, getStore(key).filter(r => r.id !== id));
}
