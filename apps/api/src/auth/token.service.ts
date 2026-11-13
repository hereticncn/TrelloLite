import { createHash, randomUUID } from 'node:crypto'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { User } from '@prisma/client'
import { env } from '../config/env'
import { PrismaService } from '../prisma/prisma.service'
import type { RequestMeta } from './auth.types'

export type AccessPayload = {
  sub: string
  type: 'access'
}

export type RefreshPayload = {
  sub: string
  type: 'refresh'
  jti: string
}

export type TokenPair = {
  accessToken: string
  refreshToken: string
  refreshExpiresAt: Date
}

const ACCESS_TYPE = 'access'
const REFRESH_TYPE = 'refresh'

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }

  async issueTokenPair(user: User, meta: RequestMeta): Promise<TokenPair> {
    const jti = randomUUID()
    const refreshTtlSeconds = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60
    const accessTtlSeconds = env.ACCESS_TOKEN_TTL_MINUTES * 60

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync({ sub: user.id, type: ACCESS_TYPE } satisfies AccessPayload, {
        secret: env.JWT_ACCESS_SECRET,
        expiresIn: accessTtlSeconds,
      }),
      this.jwt.signAsync(
        { sub: user.id, type: REFRESH_TYPE } satisfies Omit<RefreshPayload, 'jti'>,
        {
          secret: env.JWT_REFRESH_SECRET,
          expiresIn: refreshTtlSeconds,
          jwtid: jti,
        },
      ),
    ])

    const refreshExpiresAt = new Date(Date.now() + refreshTtlSeconds * 1000)

    await this.prisma.refreshToken.create({
      data: {
        id: jti,
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: refreshExpiresAt,
        userAgent: meta.userAgent?.slice(0, 512),
        ip: meta.ip?.slice(0, 64),
      },
    })

    return { accessToken, refreshToken, refreshExpiresAt }
  }

  async verifyAccessToken(token: string): Promise<AccessPayload> {
    const payload = await this.verifyAsync<AccessPayload>(token, env.JWT_ACCESS_SECRET)

    if (payload.type !== ACCESS_TYPE || !payload.sub) {
      throw new UnauthorizedException('Некорректный access-токен')
    }

    return payload
  }

  async verifyRefreshToken(token: string): Promise<RefreshPayload> {
    const payload = await this.verifyAsync<RefreshPayload>(token, env.JWT_REFRESH_SECRET)

    if (payload.type !== REFRESH_TYPE || !payload.sub || !payload.jti) {
      throw new UnauthorizedException('Некорректный refresh-токен')
    }

    return payload
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  private async verifyAsync<T extends object>(token: string, secret: string): Promise<T> {
    try {
      return await this.jwt.verifyAsync<T>(token, { secret })
    } catch {
      throw new UnauthorizedException('Токен недействителен или истёк')
    }
  }
}
