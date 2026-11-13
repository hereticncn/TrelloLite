import { Controller, Get } from '@nestjs/common'
import { PrismaService } from './prisma/prisma.service'

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  async health(): Promise<{ status: 'ok'; database: 'up'; timestamp: string }> {
    await this.prisma.$queryRaw`SELECT 1`

    return {
      status: 'ok',
      database: 'up',
      timestamp: new Date().toISOString(),
    }
  }
}
