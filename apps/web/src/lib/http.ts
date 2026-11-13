import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { AuthResponse } from '@trello/shared'

const baseURL = import.meta.env.VITE_API_URL || '/api'

export const api = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 15_000,
  headers: { Accept: 'application/json' },
})

const refreshClient = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 15_000,
  headers: { Accept: 'application/json' },
})

let accessToken: string | null = null
let refreshPromise: Promise<AuthResponse> | null = null

const NO_RETRY_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout']

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean }

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string): void {
  accessToken = token
}

export function clearAccessToken(): void {
  accessToken = null
}

/**
 * Refresh is deduplicated: parallel 401 responses share a single request,
 * so token rotation never races against itself in one tab.
 */
export function refreshAccessToken(): Promise<AuthResponse> {
  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post<AuthResponse>('/auth/refresh', {})
      .then(({ data }) => {
        accessToken = data.accessToken
        return data
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined

    const canRetry =
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !NO_RETRY_ENDPOINTS.some((endpoint) => original.url?.includes(endpoint))

    if (!canRetry) {
      return Promise.reject(error)
    }

    original._retry = true

    try {
      await refreshAccessToken()
      original.headers.Authorization = `Bearer ${accessToken}`
      return api.request(original)
    } catch {
      accessToken = null
      window.dispatchEvent(new Event('auth:expired'))
      return Promise.reject(error)
    }
  },
)
