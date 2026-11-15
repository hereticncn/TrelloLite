import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { RealtimeModule } from '../realtime/realtime.module'
import { BoardsController } from './boards.controller'
import { BoardsService } from './boards.service'
import { CardsController } from './cards.controller'
import { CardsService } from './cards.service'
import { ColumnsController } from './columns.controller'

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [BoardsController, ColumnsController, CardsController],
  providers: [BoardsService, CardsService],
})
export class BoardsModule {}
