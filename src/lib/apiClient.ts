declare global {
  interface Window {
    __APP_CONFIG__?: {
      backendUrl?: string;
    };
  }
}

const runtimeBaseUrl = typeof window !== 'undefined' ? window.__APP_CONFIG__?.backendUrl : undefined;
const rawBaseUrl = runtimeBaseUrl ?? import.meta.env.VITE_BACKEND_URL ?? '';
const normalizedBaseUrl = rawBaseUrl.replace(/\/$/, '');

function buildUrl(path: string): string {
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
  if (!normalizedBaseUrl) {
    return path;
  }
  return `${normalizedBaseUrl}${path}`;
}

export function apiFetch(input: string, init?: RequestInit) {
  const url = buildUrl(input);
  return fetch(url, init);
}

export const API_BASE_URL = normalizedBaseUrl;
