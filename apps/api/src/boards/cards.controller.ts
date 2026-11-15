import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import {
  createCardSchema,
  moveCardSchema,
  updateCardSchema,
  type CardDto,
  type CreateCardInput,
  type MoveCardInput,
  type UpdateCardInput,
} from '@trello/shared'
import type { AuthenticatedUser } from '../auth/auth.types'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe'
import { CardsService } from './cards.service'

@Controller()
@UseGuards(JwtAuthGuard)
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  @Post('columns/:columnId/cards')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('columnId', new ParseUUIDPipe()) columnId: string,
    @Body(new ZodValidationPipe(createCardSchema)) input: CreateCardInput,
  ): Promise<CardDto> {
    return this.cards.create(user.id, columnId, input)
  }

  @Get('cards/:id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CardDto> {
    return this.cards.get(user.id, id)
  }

  @Patch('cards/:id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateCardSchema)) input: UpdateCardInput,
  ): Promise<CardDto> {
    return this.cards.update(user.id, id, input)
  }

  @Delete('cards/:id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.cards.remove(user.id, id)
  }

  @Post('cards/:id/move')
  @HttpCode(200)
  move(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(moveCardSchema)) input: MoveCardInput,
  ): Promise<CardDto> {
    return this.cards.move(user.id, id, input)
  }
}
