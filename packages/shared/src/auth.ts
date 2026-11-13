import { z } from 'zod'
import type { UserDto } from './user'

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Введите email')
  .max(255, 'Email слишком длинный')
  .email('Некорректный email')
  .transform((value) => value.toLowerCase())

export const passwordSchema = z
  .string()
  .min(8, 'Минимум 8 символов')
  .max(72, 'Максимум 72 символа')
  .regex(/[A-Za-zА-Яа-я]/, 'Должна быть хотя бы одна буква')
  .regex(/\d/, 'Должна быть хотя бы одна цифра')

export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Минимум 2 символа')
  .max(100, 'Максимум 100 символов')

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
})

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Введите пароль'),
})

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type RefreshInput = z.infer<typeof refreshSchema>

export type AuthResponse = {
  accessToken: string
  user: UserDto
}

export type FieldErrors = Record<string, string[]>
