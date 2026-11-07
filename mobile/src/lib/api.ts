import * as SecureStore from 'expo-secure-store';

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '') ||
  'https://dealer-crm.onrender.com';

export const SESSION_TOKEN_KEY = 'ideal_floor_crm_token';
export const SESSION_USER_KEY = 'ideal_floor_crm_user';

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  tokenOverride?: string | null,
): Promise<T> {
  const token =
    tokenOverride === undefined
      ? await SecureStore.getItemAsync(SESSION_TOKEN_KEY)
      : tokenOverride;

  const response = await fetch(API_BASE_URL + path, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload?.error === 'string'
        ? payload.error
        : `Ошибка API: ${response.status}`;
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}
