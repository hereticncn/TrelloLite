import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { PrismaService } from '../prisma/prisma.service'
import type { AuthenticatedUser } from './auth.types'
import { TokenService } from './token.service'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>()
    const [scheme, token] = (request.headers.authorization ?? '').split(' ')

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Требуется авторизация')
    }

    const payload = await this.tokens.verifyAccessToken(token)
    const user: AuthenticatedUser | null = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, createdAt: true },
    })

    if (!user) {
      throw new UnauthorizedException('Пользователь не найден')
    }

    request.user = user
    return true
  }
}
