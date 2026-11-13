import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common'
import { Prisma, type User } from '@prisma/client'
import argon2 from 'argon2'
import type { LoginInput, RegisterInput, UserDto } from '@trello/shared'
import { PrismaService } from '../prisma/prisma.service'
import type { RequestMeta } from './auth.types'
import { TokenService } from './token.service'

export type AuthResult = {
  accessToken: string
  refreshToken: string
  user: UserDto
}

function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async register(input: RegisterInput, meta: RequestMeta): Promise<AuthResult> {
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    })

    let user: User

    try {
      user = await this.prisma.user.create({
        data: {
          name: input.name,
          email: input.email.toLowerCase(),
          passwordHash,
        },
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Пользователь с таким email уже существует')
      }
      throw error
    }

    return this.createSession(user, meta)
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    })

    if (!user || !(await argon2.verify(user.passwordHash, input.password))) {
      throw new UnauthorizedException('Неверный email или пароль')
    }

    return this.createSession(user, meta)
  }

  async refresh(rawToken: string, meta: RequestMeta): Promise<AuthResult> {
    const payload = await this.tokens.verifyRefreshToken(rawToken)
    const stored = await this.prisma.refreshToken.findUnique({
      where: { id: payload.jti },
      include: { user: true },
    })

    const invalidSession = new UnauthorizedException('Сессия недействительна. Войдите снова.')

    if (!stored || stored.userId !== payload.sub) {
      throw invalidSession
    }

    if (stored.revokedAt) {
      // A revoked token was replayed: revoke the whole token family of this user.
      await this.tokens.revokeAllForUser(stored.userId)
      throw invalidSession
    }

    if (stored.tokenHash !== this.tokens.hashToken(rawToken)) {
      await this.tokens.revokeAllForUser(stored.userId)
      throw invalidSession
    }

    if (stored.expiresAt <= new Date()) {
      throw new UnauthorizedException('Сессия истекла. Войдите снова.')
    }

    // Atomic compare-and-set protects against two concurrent refresh requests.
    const rotated = await this.prisma.refreshToken.updateMany({
      where: {
        id: stored.id,
        revokedAt: null,
        tokenHash: stored.tokenHash,
        expiresAt: { gt: new Date() },
      },
      data: { revokedAt: new Date() },
    })

    if (rotated.count === 0) {
      await this.tokens.revokeAllForUser(stored.userId)
      throw invalidSession
    }

    return this.createSession(stored.user, meta)
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) {
      return
    }

    try {
      const payload = await this.tokens.verifyRefreshToken(rawToken)
      await this.prisma.refreshToken.updateMany({
        where: {
          id: payload.jti,
          tokenHash: this.tokens.hashToken(rawToken),
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      })
    } catch {
      // Logout is intentionally idempotent: an invalid/expired token is also a logged-out state.
    }
  }

  async me(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })

    if (!user) {
      throw new UnauthorizedException('Пользователь не найден')
    }

    return toUserDto(user)
  }

  private async createSession(user: User, meta: RequestMeta): Promise<AuthResult> {
    const pair = await this.tokens.issueTokenPair(user, meta)

    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      user: toUserDto(user),
    }
  }
}
