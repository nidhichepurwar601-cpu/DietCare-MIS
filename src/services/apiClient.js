import { API_CONFIG, DEFAULT_HEADERS, TIMEOUT_MS } from '../config/api.config';
import { messageForHttpStatus } from '../lib/apiErrors.js';

/**
 * Custom API Error class to handle HTTP errors systematically.
 */
export class APIError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = 'APIError';
  }
}

const READ_CACHE_TTL_MS = 10000;
const readCache = new Map();
const pendingReads = new Map();
let cacheGeneration = 0;

const isReadOnlyPost = (endpoint) =>
  /\/(?:patient\/get|diet\/type\/get|diet\/template\/get\/all|diettemplate\/item\/get\/by\/template\/[^/]+|food\/get|mealtype\/get|dietmanager\/get|kitchen\/get|mealdelivery\/get|clinicalalert\/get|notification\/get|dashboard\/get)\/?$/.test(
    endpoint,
  );

const isCacheableRead = (endpoint, method) =>
  method === "GET" ||
  (method === "POST" && isReadOnlyPost(endpoint));

async function parseBody(response) {
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestOnce(url, config) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...config, signal: controller.signal });
    const data = await parseBody(response);
    if (!response.ok) {
      throw new APIError(
        messageForHttpStatus(response.status, data?.message),
        response.status,
        data
      );
    }
    return data;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Standard fetch wrapper with interceptor-like behavior.
 *
 * ✅ Auth headers & timeout come from api.config.js → driven by .env
 *    Do NOT hard-code any credentials here.
 *
 * @param {string} endpoint - Relative API endpoint path
 * @param {RequestInit} options - Standard fetch options
 * @returns {Promise<any>} - Parsed JSON response
 */
export async function apiClient(endpoint, { body, ...customConfig } = {}) {
  const config = {
    method: body ? 'POST' : 'GET',
    ...customConfig,
    headers: {
      ...DEFAULT_HEADERS,          // ← from .env via api.config.js
      ...customConfig.headers,     // ← per-call overrides (if any)
    },
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const url = `${API_CONFIG.BASE_URL}${endpoint}`;
  const method = String(config.method || 'GET').toUpperCase();
  const cacheable = isCacheableRead(endpoint, method);
  const cacheKey = cacheable
    ? `${method}:${url}:${body === undefined ? "" : JSON.stringify(body)}`
    : null;

  if (cacheKey) {
    const cached = readCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    if (cached) readCache.delete(cacheKey);
    const pending = pendingReads.get(cacheKey);
    if (pending) return pending;
  }

  const generation = cacheGeneration;
  const request = (async () => {
    try {
      try {
        return await requestOnce(url, config);
      } catch (error) {
        const retryable =
          method === 'GET' &&
          (error?.status === 502 || error?.status === 503 || error?.status === 504);
        if (retryable) {
          return await requestOnce(url, config);
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof APIError) throw error;
      if (error?.name === 'AbortError') {
        throw new Error('The request timed out. Please try again.');
      }
      console.error('[API Client] Network request failed:', url);
      throw new Error('Network error or server is unreachable. Please try again later.');
    }
  })();

  if (cacheKey) pendingReads.set(cacheKey, request);
  try {
    const data = await request;
    if (cacheKey && generation === cacheGeneration) {
      readCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + READ_CACHE_TTL_MS,
      });
    } else if (method !== "GET" && !isReadOnlyPost(endpoint)) {
      cacheGeneration += 1;
      readCache.clear();
      pendingReads.clear();
    }
    return data;
  } finally {
    if (cacheKey && pendingReads.get(cacheKey) === request) {
      pendingReads.delete(cacheKey);
    }
  }
}

apiClient.get = (endpoint, customConfig = {}) =>
  apiClient(endpoint, { ...customConfig, method: 'GET' });

apiClient.post = (endpoint, body, customConfig = {}) =>
  apiClient(endpoint, { ...customConfig, body, method: 'POST' });

apiClient.put = (endpoint, body, customConfig = {}) =>
  apiClient(endpoint, { ...customConfig, body, method: 'PUT' });

apiClient.delete = (endpoint, customConfig = {}) =>
  apiClient(endpoint, { ...customConfig, method: 'DELETE' });

export default apiClient;
