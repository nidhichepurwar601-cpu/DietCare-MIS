/**
 * ============================================================
 *  DietCare MIS — Central API Configuration
 * ============================================================
 *  Runtime connection settings can be changed after build in
 *  public/runtime-config.js. Authentication is read from sessionStorage.
 *
 *  After deployment, edit dist/runtime-config.js and reload the app.
 *
 *  DO NOT hard-code IP addresses anywhere else in the codebase.
 *  Import { API_CONFIG } or named exports from this file instead.
 * ============================================================
 */

// Runtime settings override the Vite environment values, which are only
// available as defaults baked in during development/build.
const runtimeConfig = () =>
  typeof window !== "undefined" ? window.DIETCARE_RUNTIME_CONFIG || {} : {};

const setting = (runtimeKey, envValue, fallback = "") => {
  const config = runtimeConfig();
  const runtimeValue = config[runtimeKey];
  if (Object.hasOwn(config, runtimeKey) && runtimeValue !== null) {
    return String(runtimeValue ?? "").trim();
  }
  return (
    String(runtimeValue ?? "").trim() ||
    String(envValue ?? "").trim() ||
    fallback
  );
};

function getConnectionSettings() {
  return {
    protocol: setting(
      "VITE_API_PROTOCOL",
      import.meta.env.VITE_API_PROTOCOL,
      "http",
    ).replace(/:$/, ""),
    host: setting("VITE_API_HOST", import.meta.env.VITE_API_HOST),
    port: setting("VITE_API_PORT", import.meta.env.VITE_API_PORT),
    basePath: setting("VITE_API_BASE_PATH", import.meta.env.VITE_API_BASE_PATH),
  };
}

function buildBaseUrl() {
  const { protocol, host, port, basePath } = getConnectionSettings();
  if (!host) {
    throw new Error(
      "API host is not configured. Set VITE_API_HOST in runtime-config.js.",
    );
  }
  const address =
    host.startsWith("http://") || host.startsWith("https://")
      ? host
      : protocol + "://" + host;
  const url = new URL(address);
  if (port) url.port = port;
  const pathSegments = [url.pathname, basePath]
    .map((segment) => segment.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
  return url.origin + (pathSegments.length ? `/${pathSegments.join("/")}` : "");
}

const readSessionValue = (...keys) => {
  if (typeof sessionStorage === "undefined") return "";
  for (const key of keys) {
    const value = sessionStorage.getItem(key);
    if (value && value.trim()) return value.trim();
  }
  return "";
};

export function getSessionAuthHeaders() {
  const headers = {};
  const values = [
    ["userid", ["UserId", "userId", "userid"]],
    ["clinicid", ["ClinicId", "clinicId", "clinicid"]],
    ["zoneid", ["ZONEID", "ZoneId", "zoneId", "zoneid"]],
    ["Authorization", ["AUTHTOKEN", "Authorization", "authToken"]],
  ];
  values.forEach(([header, keys]) => {
    const value = readSessionValue(...keys);
    if (value) headers[header] = value;
  });
  return headers;
}

const TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS) || 20000;
const DEFAULT_HEADERS = { "Content-Type": "application/json" };

const ENDPOINTS = {
  DIET_TEMPLATE: {
    CREATE:        '/diet/template/create',
    GET_ALL:       '/diet/template/get/all',
    GET_BY_ID:     (id) => `/diet/template/get/by/${id}`,
    UPDATE:        '/diet/template/update',
    UPDATE_BY_ID:  (id) => `/diet/template/update/${id}`,
    DELETE:        (id) => `/diet/template/delete/${id}`,
  },
  TEMPLATE_ITEM: {
    CREATE:              '/diettemplate/item/create',
    GET_BY_ID:           (id) => `/diettemplate/item/get/by/${id}`,
    GET_BY_TEMPLATE_ID:  (id) => `/diettemplate/item/get/by/template/${id}`,
    UPDATE_BY_ID:        (id) => `/diettemplate/item/update/${id}`,
    DELETE:              (id) => `/diettemplate/item/delete/${id}`,
  },
  DIET_TYPE: {
    CREATE:       '/diet/type/create',
    GET_ALL:      '/diet/type/get',
    GET_BY_ID:    (id) => `/diet/type/get/by/${id}`,
    UPDATE_BY_ID: (id) => `/diet/type/update/${id}`,
    DELETE:       (id) => `/diet/type/delete/${id}`,
  },
  FOOD: {
    CREATE:       '/food/create',
    GET_ALL:      '/food/get',
    GET_BY_ID:    (id) => `/food/get/by/${id}`,
    UPDATE_BY_ID: (id) => `/food/update/${id}`,
    DELETE:       (id) => `/food/delete/${id}`,
  },
  FOOD_NUTRITION: {
    SAVE:         '/food/nutrition/save',
    CALCULATE:    '/food/nutrition/calculate',
    GET_BY_ID:    (id) => `/food/nutrition/get/by/${id}`,
    UPDATE_BY_ID: (id) => `/food/nutrition/update/${id}`,
    DELETE:       (id) => `/food/nutrition/delete/${id}`,
  },
  MEAL_TYPE: {
    CREATE:       '/mealtype/create',
    GET_ALL:      '/mealtype/get',
    GET_BY_ID:    (id) => `/mealtype/get/by/${id}`,
    UPDATE_BY_ID: (id) => `/mealtype/update/${id}`,
    DELETE:       (id) => `/mealtype/delete/${id}`,
  },
  KITCHEN_ORDER: {
    CREATE:       '/kitchen/create',
    GET_ALL:      '/kitchen/get',
    GET_BY_ID:    (id) => `/kitchen/get/by/${id}`,
    UPDATE_BY_ID: (id) => `/kitchen/update/${id}`,
    /** Update preparation status of an entire kitchen order */
    ORDER_STATUS: (id) => `/kitchen/update/status/${id}`,
    DELETE:       (id) => `/kitchen/delete/${id}`,
  },
  ORDER_ITEM: {
    /** Update status of a single prepared item inside a kitchen order */
    UPDATE_STATUS: (id) => `/kitchen/update/item/status/${id}`,
    ORDER_ITEM_STATUS: (id) => `/kitchen/update/item/status/${id}`,
  },
  KITCHEN_SUMMARY: {
    GET_BY_DATE: (date) => `/kitchen/summary?serviceDate=${encodeURIComponent(date)}`,
  },
  MEAL_DELIVERY: {
    CREATE:        '/mealdelivery/create',
    GET_ALL:       '/mealdelivery/get',
    GET_BY_ID:     (id) => `/mealdelivery/get/by/${id}`,
    UPDATE_BY_ID:  (id) => `/mealdelivery/update/${id}`,
    UPDATE_STATUS: (id) => `/mealdelivery/update/status/${id}`,
    SAVE_INTAKE:   (id) => `/mealdelivery/save/intake/${id}`,
    DELETE:        (id) => `/mealdelivery/delete/${id}`,
  },
  MEAL_DELIVERY_ITEM: {
    UPDATE_STATUS: (id) => `/mealdelivery/update/item/status/${id}`,
  },
  MEAL_DELIVERY_SUMMARY: {
    GET_BY_DATE: (date) => `/mealdelivery/summary?serviceDate=${encodeURIComponent(date)}`,
  },
  PATIENT_DETAILS: {
    CREATE:       '/patient/create',
    GET_ALL:      '/patient/get',
    GET_BY_ID:    (id) => `/patient/get/by/${id}`,
    UPDATE_BY_ID: (id) => `/patient/update/${id}`,
    DELETE:       (id) => `/patient/delete/${id}`,
  },
  PATIENT_DIET_PLAN: {
    CREATE:    '/dietmanager/create',
    GET_BY_ID: (id) => `/dietmanager/get/by/${id}`,
  },
  DIET_MANAGER: {
    CREATE:        '/dietmanager/create',
    GET_BY_ID:     (id) => `/dietmanager/get/by/${id}`,
    GET_ALL:       '/dietmanager/get',
    UPDATE_BY_ID:  (id) => `/dietmanager/update/${id}`,
    DELETE:        (id) => `/dietmanager/delete/${id}`,
    UPDATE_STATUS: (id) => `/dietmanager/update/status/${id}`,
  },
  CLINICAL_ALERT: {
    CREATE:       '/clinicalalert/create',
    GET_BY_ID:    (id) => `/clinicalalert/get/by/${id}`,
    GET_ALL:      '/clinicalalert/get',
    UPDATE_BY_ID: (id) => `/clinicalalert/update/${id}`,
    ACKNOWLEDGE:  (id) => `/clinicalalert/acknowledge/${id}`,
    DELETE:       (id) => `/clinicalalert/delete/${id}`,
  },
  NOTIFICATION: {
    CREATE:        '/notification/create',
    GET_BY_ID:     (id) => `/notification/get/by/${id}`,
    GET_ALL:       '/notification/get',
    STATUS_UPDATE: (id) => `/notification/update/status/${id}`,
    DELETE:        (id) => `/notification/delete/${id}`,
  },
  DASHBOARD: {
    POST: '/dashboard/get',
  },
};

// ── Named exports (tree-shakeable) ───────────────────────────
export { ENDPOINTS, DEFAULT_HEADERS, TIMEOUT_MS };

export const API_CONFIG = {
  get BASE_URL() {
    return buildBaseUrl();
  },
  ENDPOINTS,
  DEFAULT_HEADERS,
  TIMEOUT_MS,
};

export const BASE_URL = API_CONFIG.BASE_URL;
export const HOST = setting("VITE_API_HOST", import.meta.env.VITE_API_HOST);
export const PORT = setting("VITE_API_PORT", import.meta.env.VITE_API_PORT);
export const BASE_PATH = setting("VITE_API_BASE_PATH", import.meta.env.VITE_API_BASE_PATH);

export default API_CONFIG;
