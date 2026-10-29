export const API_BASE = (import.meta.env?.VITE_API_BASE || 'https://hackathon-backend-d180.onrender.com/api/v1').replace(/\/+$/, '');

const TOKEN_KEY = 'hcm_token';
const readCache = new Map();
const pendingReads = new Map();
let readGeneration = 0;
export function clearReadCache() { readGeneration++; readCache.clear(); pendingReads.clear(); }

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  clearReadCache();
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor({ status, message, errors, requestId, fallback, kind, url }) {
    super(message || 'Request failed');
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors || [];
    this.requestId = requestId;
    this.fallback = fallback;
    this.kind = kind;
    this.url = url;
  }
}

export function buildUrl(path, query) {
  const relative = `/${String(path).replace(/^\/+/, '').replace(/^api\/v1\/?/, '')}`;
  const url = new URL(`${API_BASE}${relative}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

const pendingWrites = new Set();
const pendingListeners = new Set();
export const subscribeWrites = (listener) => { pendingListeners.add(listener); return () => pendingListeners.delete(listener); };
export const hasPendingWrites = () => pendingWrites.size > 0;
const notifyWrites = () => pendingListeners.forEach((listener) => listener());

export async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const cacheMs = Math.min(30000, Math.max(0, options.cacheMs || 0));
  if (method !== 'GET') {
    clearReadCache();
    try { return await performRequest(path, options); }
    finally { clearReadCache(); }
  }
  if (!cacheMs) return performRequest(path, options);
  const token = options.token === undefined ? getToken() : options.token;
  const key = JSON.stringify([token, buildUrl(path, options.query).href, options.responseType || 'json']);
  const hit = readCache.get(key);
  if (hit && hit.expires > Date.now()) return structuredClone(hit.value);
  const generation = readGeneration;
  if (pendingReads.has(key)) return structuredClone(await pendingReads.get(key));
  const request = performRequest(path, options);
  pendingReads.set(key, request);
  try {
    const value = await request;
    if (generation === readGeneration) readCache.set(key, { expires: Date.now() + cacheMs, value: structuredClone(value) });
    return value;
  } finally { if (pendingReads.get(key) === request) pendingReads.delete(key); }
}

async function performRequest(path, options = {}) {
  const form = typeof document === 'undefined' ? null : document.activeElement?.form || document.activeElement?.closest('form');
  const method = (options.method || 'GET').toUpperCase();
  const write = !['GET', 'HEAD'].includes(method);
  const key = `${method}:${path}`;
  if (write && pendingWrites.has(key)) throw new ApiError({ status: 0, message: 'This action is already in progress. Please wait.' });
  if (write) { pendingWrites.add(key); notifyWrites(); }
  const retries = method === 'GET' ? Math.min(2, Math.max(0, options.retries ?? 2)) : 0;
  const session = options.token === undefined ? getToken() : options.token;
  try {
    for (let attempt = 0; ; attempt++) {
      try { return await request(path, { ...options, method, token: session }); }
      catch (error) {
        const transient = error.kind === 'network' || error.kind === 'timeout' || [408, 502, 503, 504].includes(error.status);
        if (!transient || attempt >= retries || (session && session !== getToken())) throw error;
        options.onRetry?.(attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs ?? 1000 * (attempt + 1)));
      }
    }
  } catch (error) {
    if (error.errors?.length && form) form.dispatchEvent(new CustomEvent('hcm:field-errors', { detail: error.errors }));
    throw error;
  } finally { if (write) { pendingWrites.delete(key); notifyWrites(); } }
}

async function request(path, { method = 'GET', body, query, token, responseType = 'json', timeoutMs } = {}) {
  if (body !== undefined && (!body || typeof body !== 'object' || Array.isArray(body))) {
    throw new ApiError({ status: 0, message: 'Unable to submit this form. Please check the fields.' });
  }
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const publicRequest = ['/setup-status', '/setup', '/workspaces', '/auth/login'].includes(path);
  const auth = publicRequest ? null : token === undefined ? getToken() : token;
  if (auth) headers.Authorization = `Bearer ${auth}`;

  const controller = new AbortController();
  const ms = timeoutMs ?? (String(path).startsWith('/ai/') ? 30000 : 75000);
  const timer = setTimeout(() => controller.abort(), ms);

  let res;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ApiError({
        status: 0,
        message: String(path).startsWith('/ai/')
          ? 'The assistant timed out. Use the ordinary form or dashboard numbers.'
          : 'The service is taking longer than usual to start. Please try again. If you were saving, check whether it completed before submitting again.',
        fallback: true,
        kind: 'timeout',
        url: buildUrl(path).href,
      });
    }
    throw new ApiError({ status: 0, kind: 'network', url: buildUrl(path).href, message: 'The browser could not connect to the workspace service. A network failure or the service’s allowed browser addresses may be blocking the request.' });
  } finally {
    clearTimeout(timer);
  }

  const requestId = res.headers.get('X-Request-Id');
  let failure;
  if (!res.ok) {
    try { failure = await res.clone().json(); } catch { /* Non-JSON errors still retain their HTTP status. */ }
  }

  // Never deliver a previous account's in-flight response to a newer session.
  if (auth && auth !== getToken() && path !== '/auth/logout') {
    throw new ApiError({ status: 401, message: 'Your session changed. Please sign in again.' });
  }

  const incorrectCurrentPassword = path === '/auth/change-password' && failure?.message === 'Current password is incorrect';
  if (res.status === 401 && auth && path !== '/auth/login' && !incorrectCurrentPassword && getToken() === auth) {
    setToken(null);
    window.dispatchEvent(new Event('hcm:unauthorized'));
  }
  if (res.status === 403 && auth && path !== '/auth/me') {
    window.dispatchEvent(new Event('hcm:forbidden'));
  }

  if (responseType === 'blob' || responseType === 'text') {
    if (!res.ok) {
      let payload;
      try {
        payload = await res.json();
      } catch {
        payload = { message: res.statusText };
      }
      throw new ApiError({
        status: res.status,
        message: payload.message,
        errors: payload.errors,
        requestId: payload.requestId || requestId,
      });
    }
    return responseType === 'blob' ? res.blob() : res.text();
  }

  if (res.status === 204) return null;
  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new ApiError({ status: res.status, message: 'Invalid server response', requestId });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new ApiError({ status: res.status, kind: 'response', message: 'The service returned an unexpected response. Please try again.', requestId });
  if (!res.ok || payload.success === false) {
    throw new ApiError({
      status: res.status,
      message: payload.message || 'Request failed',
      errors: payload.errors || (incorrectCurrentPassword ? [{ field: 'currentPassword', reason: 'Your current password is incorrect.' }] : undefined),
      requestId: payload.requestId || requestId,
    });
  }

  if (payload.success !== true || !Object.hasOwn(payload, 'data')) {
    throw new ApiError({ status: res.status, kind: 'response', message: 'The service returned an unexpected response. Please try again or contact your administrator.', requestId });
  }
  return payload.data;
}

export const formatApiError = (error) => {
  if (!(error instanceof ApiError)) return error.message || 'Something went wrong';
  const details = (error.errors || [])
    .map((item) => [item.row ? `Row ${item.row}` : null, item.field, item.reason].filter(Boolean).join(' · '))
    .filter(Boolean);
  return [error.message, ...details].join('\n');
};
