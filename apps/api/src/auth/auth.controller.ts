import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import {
  REFRESH_COOKIE_NAME,
  loginSchema,
  refreshSchema,
  registerSchema,
  type AuthResponse,
  type LoginInput,
  type RefreshInput,
  type RegisterInput,
} from '@trello/shared'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe'
import { env } from '../config/env'
import { AuthService, type AuthResult } from './auth.service'
import type { AuthenticatedUser, RequestMeta } from './auth.types'
import { JwtAuthGuard } from './jwt-auth.guard'

const REFRESH_COOKIE_PATH = '/api/auth'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(201)
  async register(
    @Body(new ZodValidationPipe(registerSchema)) input: RegisterInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponse> {
    const result = await this.auth.register(input, this.meta(request))
    this.setRefreshCookie(reply, result)
    return this.toResponse(result)
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) input: LoginInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponse> {
    const result = await this.auth.login(input, this.meta(request))
    this.setRefreshCookie(reply, result)
    return this.toResponse(result)
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body(new ZodValidationPipe(refreshSchema)) input: RefreshInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponse> {
    const rawToken = this.readRefreshToken(request, input)

    if (!rawToken) {
      throw new UnauthorizedException('Сессия не найдена. Войдите снова.')
    }

    try {
      const result = await this.auth.refresh(rawToken, this.meta(request))
      this.setRefreshCookie(reply, result)
      return this.toResponse(result)
    } catch (error) {
      this.clearRefreshCookie(reply)
      throw error
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body(new ZodValidationPipe(refreshSchema)) input: RefreshInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const rawToken = this.readRefreshToken(request, input)
    await this.auth.logout(rawToken)
    this.clearRefreshCookie(reply)
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser): Promise<{ user: AuthResponse['user'] }> {
    return { user: await this.auth.me(user.id) }
  }

  private meta(request: FastifyRequest): RequestMeta {
    return {
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    }
  }

  private readRefreshToken(request: FastifyRequest, input: RefreshInput): string | undefined {
    return request.cookies?.[REFRESH_COOKIE_NAME] ?? input.refreshToken
  }

  private setRefreshCookie(reply: FastifyReply, result: AuthResult): void {
    void reply.setCookie(REFRESH_COOKIE_NAME, result.refreshToken, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: env.COOKIE_SAME_SITE,
      path: REFRESH_COOKIE_PATH,
      maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
    })
  }

  private clearRefreshCookie(reply: FastifyReply): void {
    void reply.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH })
  }

  private toResponse(result: AuthResult): AuthResponse {
    return {
      accessToken: result.accessToken,
      user: result.user,
    }
  }
}
