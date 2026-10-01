/**
 * ============================================================
 *  DietCare MIS — Central API Configuration
 * ============================================================
 *  ✅ ALL server connection details are driven by .env
 *
 *  To point the app at a different server:
 *    1. Open .env in the project root
 *    2. Change VITE_API_HOST / VITE_API_PORT / VITE_API_BASE_PATH
 *    3. Save — Vite hot-reloads automatically (or restart dev server)
 *
 *  DO NOT hard-code IP addresses anywhere else in the codebase.
 *  Import { API_CONFIG } or named exports from this file instead.
 * ============================================================
 */

// ── Connection (from .env) ────────────────────────────────────
const HOST      = import.meta.env.VITE_API_HOST      || '192.168.1.14';
const PORT      = import.meta.env.VITE_API_PORT      || '8085';
const BASE_PATH = import.meta.env.VITE_API_BASE_PATH || '/dietcare';

// ── Auth (from .env) ─────────────────────────────────────────
const USER_ID    = import.meta.env.VITE_API_USER_ID    || 'aureus';
const CLINIC_ID  = import.meta.env.VITE_API_CLINIC_ID  || 'aureus';
const ZONE_ID    = import.meta.env.VITE_API_ZONE_ID    || 'aureus';
const AUTH_TOKEN = import.meta.env.VITE_API_AUTH_TOKEN ||
  'SmartCare eyJhbGciOiJIUzI1NiJ9.eyJjbGluaWMiOiJhdXJldXMiLCJzdWIiOiJkZW1vZDEyMzQiLCJpYXQiOjE3ODk5ODg5MDUsImV4cCI6MTc5MDAxMDUwNX0.TvzJxi7kCNtroWvoIBWNjlSV8yGUbPzlgCkFoV-0w7I';

// ── Misc (from .env) ─────────────────────────────────────────
const TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS) || 20000;

/**
 * Assembled base URL — e.g. "http://192.168.1.14:8085/dietcare"
 * Change HOST / PORT / BASE_PATH in .env; this updates automatically.
 */
const BASE_URL = `http://${HOST}:${PORT}${BASE_PATH}`;

// ── Default request headers ──────────────────────────────────
const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'userid':        USER_ID,
  'clinicid':      CLINIC_ID,
  'zoneid':        ZONE_ID,
  'Authorization': AUTH_TOKEN,
};

// ── Endpoint map (relative paths only) ──────────────────────
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
  },
  KITCHEN_SUMMARY: {
    GET_BY_DATE: (date) => `/kitchen/summary/get/by/${date}`,
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
    GET_BY_DATE: (date) => `/mealdelivery/summary/get/by/${date}`,
  },
  PATIENT_DETAILS: {
    CREATE:       '/patient/create',
    GET_ALL:      '/patient/get',
    GET_BY_ID:    (id) => `/patient/get/by/${id}`,
    UPDATE_BY_ID: (id) => `/patient/update/${id}`,
  },
  PATIENT_DIET_PLAN: {
    CREATE:    '/dietmanager/create',
    GET_BY_ID: (id) => `/dietmanager/get/by/${id}`,
  },
};

// ── Named exports (tree-shakeable) ───────────────────────────
export { BASE_URL, ENDPOINTS, DEFAULT_HEADERS, TIMEOUT_MS, HOST, PORT, BASE_PATH };

/**
 * Legacy-compatible named export.
 * All existing code using `import { API_CONFIG } from '../config/api.config'`
 * continues to work without any changes.
 */
export const API_CONFIG = {
  BASE_URL,
  ENDPOINTS,
  DEFAULT_HEADERS,
  TIMEOUT_MS,
};

export default API_CONFIG;
