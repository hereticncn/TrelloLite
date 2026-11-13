import 'dotenv/config'
import { z } from 'zod'

const booleanFromString = z.enum(['true', 'false']).transform((value) => value === 'true')

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL обязателен'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET должен быть не короче 32 символов'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET должен быть не короче 32 символов'),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_SECURE: booleanFromString.default('false'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n')
  console.error(`\nОшибка конфигурации окружения:\n${details}\n`)
  process.exit(1)
}

export const env = parsed.data

export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

if (env.COOKIE_SAME_SITE === 'none' && !env.COOKIE_SECURE) {
  console.warn(
    'COOKIE_SAME_SITE=none требует COOKIE_SECURE=true, иначе браузер отклонит refresh-cookie.',
  )
}
