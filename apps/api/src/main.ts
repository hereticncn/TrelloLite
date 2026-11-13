import 'reflect-metadata'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from './app.module'
import { corsOrigins, env } from './config/env'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
  )

  await app.register(cookie)
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Слишком много запросов. Попробуйте через ${Math.ceil(
        Number(context.ttl) / 1000,
      )} сек.`,
    }),
  })

  app.setGlobalPrefix('api')
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  })
  app.enableShutdownHooks()

  await app.listen({ port: env.PORT, host: '0.0.0.0' })

  const url = await app.getUrl()
  console.log(`API запущен: ${url.replace('[::1]', 'localhost')}/api`)
}

bootstrap().catch((error: unknown) => {
  console.error('Не удалось запустить API', error)
  process.exit(1)
})
