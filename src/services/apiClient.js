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

