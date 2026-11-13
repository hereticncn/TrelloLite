import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { AuthResponse, LoginInput, RegisterInput, UserDto } from '@trello/shared'
import { api, clearAccessToken, refreshAccessToken, setAccessToken } from '@/lib/http'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserDto | null>(null)
  const initialized = ref(false)
  const isAuthenticated = computed(() => user.value !== null)

  let initializePromise: Promise<void> | null = null

  function applySession(data: AuthResponse): void {
    setAccessToken(data.accessToken)
    user.value = data.user
  }

  function clearSession(): void {
    clearAccessToken()
    user.value = null
    initialized.value = true
  }

  async function initialize(): Promise<void> {
    if (initialized.value) {
      return
    }

    if (initializePromise) {
      return initializePromise
    }

    initializePromise = (async () => {
      try {
        applySession(await refreshAccessToken())
      } catch {
        clearSession()
      } finally {
        initialized.value = true
        initializePromise = null
      }
    })()

    return initializePromise
  }

  async function login(input: LoginInput): Promise<void> {
    const { data } = await api.post<AuthResponse>('/auth/login', input)
    applySession(data)
  }

  async function register(input: RegisterInput): Promise<void> {
    const { data } = await api.post<AuthResponse>('/auth/register', input)
    applySession(data)
  }

  async function logout(): Promise<void> {
    try {
      await api.post('/auth/logout', {})
    } finally {
      clearSession()
    }
  }

  return {
    user,
    initialized,
    isAuthenticated,
    initialize,
    login,
    register,
    logout,
    clearSession,
  }
})
