import axios from 'axios'

type ApiErrorBody = {
  message?: string | string[]
  fieldErrors?: Record<string, string[]>
}

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    if (!error.response) {
      return 'Не удалось связаться с сервером. Проверьте, что API запущен.'
    }

    const { message } = error.response.data ?? {}

    if (Array.isArray(message)) {
      return message[0] ?? 'Что-то пошло не так'
    }

    if (typeof message === 'string' && message.length > 0) {
      return message
    }
  }

  return 'Что-то пошло не так. Попробуйте ещё раз.'
}

export function getApiFieldErrors(error: unknown): Record<string, string> {
  if (!axios.isAxiosError<ApiErrorBody>(error)) {
    return {}
  }

  const fieldErrors = error.response?.data?.fieldErrors ?? {}
  const flattened: Record<string, string> = {}

  for (const [field, messages] of Object.entries(fieldErrors)) {
    const message = messages[0]
    if (message) {
      flattened[field] = message
    }
  }

  return flattened
}
