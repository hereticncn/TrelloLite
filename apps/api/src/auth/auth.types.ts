import type { User } from '@prisma/client'

export type AuthenticatedUser = Pick<User, 'id' | 'email' | 'name' | 'createdAt'>

export type RequestMeta = {
  userAgent?: string
  ip?: string
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser
  }
}
