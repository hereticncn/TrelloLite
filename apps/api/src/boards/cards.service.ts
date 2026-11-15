import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { CardDto, CreateCardInput, MoveCardInput, UpdateCardInput } from '@trello/shared'
import { PrismaService } from '../prisma/prisma.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { lockBoardRow } from './board-lock'
import { BoardsService } from './boards.service'
import { toCardDto } from './card.mapper'
const CARD_GAP = 1000

type LockedCardRow = {
  id: string
  columnId: string
  version: number
  position: Prisma.Decimal
}

type DestinationCardRow = {
  id: string
  position: Prisma.Decimal
}

@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boards: BoardsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async get(userId: string, cardId: string): Promise<CardDto> {
    const card = await this.findCardWithAccess(userId, cardId)
    return toCardDto(card)
  }

  async create(userId: string, columnId: string, input: CreateCardInput): Promise<CardDto> {
    const column = await this.prisma.column.findUnique({
      where: { id: columnId },
      select: { boardId: true },
    })

    if (!column) {
      throw new NotFoundException('Колонка не найдена')
    }

    await this.boards.assertEditor(userId, column.boardId)

    const card = await this.prisma.$transaction(async (tx) => {
      await lockBoardRow(tx, column.boardId)

      const columnExists = await tx.column.findUnique({
        where: { id: columnId },
        select: { id: true },
      })

      if (!columnExists) {
        throw new NotFoundException('Колонка не найдена')
      }

      const aggregate = await tx.card.aggregate({
        where: { columnId },
        _max: { position: true },
      })
      const maxPosition = aggregate._max.position
      const position = maxPosition ? maxPosition.plus(CARD_GAP) : new Prisma.Decimal(CARD_GAP)

      const created = await tx.card.create({
        data: {
          columnId,
          title: input.title,
          description: input.description,
          position,
          createdById: userId,
        },
      })

      await this.touchBoard(tx, column.boardId)

      return toCardDto(created)
    })

    this.realtime.emitCardCreated(column.boardId, card)
    return card
  }

  async update(userId: string, cardId: string, input: UpdateCardInput): Promise<CardDto> {
    const card = await this.findCardWithAccess(userId, cardId)
    const boardId = card.column.boardId
    await this.boards.assertEditor(userId, boardId)

    const updatedCard = await this.prisma.$transaction(async (tx) => {
      await lockBoardRow(tx, boardId)
      const locked = await this.lockCard(tx, cardId)

      if (input.expectedVersion !== undefined && locked.version !== input.expectedVersion) {
        throw new ConflictException(
          'Карточка уже была изменена. Обновите доску и попробуйте снова.',
        )
      }

      const updated = await tx.card.update({
        where: { id: cardId },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          version: { increment: 1 },
        },
      })

      await this.touchBoard(tx, boardId)

      return toCardDto(updated)
    })

    this.realtime.emitCardUpdated(boardId, updatedCard)
    return updatedCard
  }

  async remove(userId: string, cardId: string): Promise<void> {
    const card = await this.findCardWithAccess(userId, cardId)
    const boardId = card.column.boardId
    await this.boards.assertEditor(userId, boardId)

    await this.prisma.$transaction(async (tx) => {
      await lockBoardRow(tx, boardId)

      const deleted = await tx.card.deleteMany({ where: { id: cardId } })
      if (deleted.count === 0) {
        throw new NotFoundException('Карточка не найдена')
      }

      await this.touchBoard(tx, boardId)
    })

    this.realtime.emitCardDeleted(boardId, cardId, card.columnId)
  }

  /**
   * Moves a card into a target column in a single transaction.
   *
   * The board row is locked first, which serializes all card mutations within a
   * board and keeps concurrent moves from computing the same neighbor positions.
   * The moved card and destination cards are additionally locked with
   * SELECT ... FOR UPDATE so the version check and neighbor validation happen
   * against a stable snapshot.
   */
  async move(userId: string, cardId: string, input: MoveCardInput): Promise<CardDto> {
    const card = await this.findCardWithAccess(userId, cardId)
    const boardId = card.column.boardId
    await this.boards.assertEditor(userId, boardId)

    const beforeCardId = input.beforeCardId ?? null
    const afterCardId = input.afterCardId ?? null

    if (beforeCardId === cardId || afterCardId === cardId) {
      throw new BadRequestException('Карточка не может быть соседом сама себе')
    }

    const movedCard = await this.prisma.$transaction(async (tx) => {
      await lockBoardRow(tx, boardId)

      const locked = await this.lockCard(tx, cardId)
      if (locked.version !== input.expectedVersion) {
        throw new ConflictException(
          'Карточка уже была изменена. Обновите доску и попробуйте снова.',
        )
      }

      const targetColumn = await tx.column.findFirst({
        where: { id: input.toColumnId, boardId },
        select: { id: true },
      })

      if (!targetColumn) {
        throw new NotFoundException('Колонка не найдена')
      }

      const destinationCards = await tx.$queryRaw<DestinationCardRow[]>`
        SELECT id, position
        FROM cards
        WHERE column_id = ${targetColumn.id}::uuid AND id <> ${cardId}::uuid
        ORDER BY position ASC, created_at ASC
        FOR UPDATE
      `

      const position = this.computePosition(destinationCards, beforeCardId, afterCardId)

      const updated = await tx.card.update({
        where: { id: cardId },
        data: {
          columnId: targetColumn.id,
          position,
          version: { increment: 1 },
        },
      })

      await this.touchBoard(tx, boardId)

      return toCardDto(updated)
    })

    this.realtime.emitCardMoved(boardId, movedCard)
    return movedCard
  }

  private computePosition(
    cards: DestinationCardRow[],
    beforeCardId: string | null,
    afterCardId: string | null,
  ): Prisma.Decimal {
    if (!beforeCardId && !afterCardId) {
      const last = cards.at(-1)
      return last ? last.position.plus(CARD_GAP) : new Prisma.Decimal(CARD_GAP)
    }

    const beforeIndex = beforeCardId ? cards.findIndex((card) => card.id === beforeCardId) : -1
    const afterIndex = afterCardId ? cards.findIndex((card) => card.id === afterCardId) : -1

    if (beforeCardId && beforeIndex === -1) {
      throw this.staleOrderError()
    }

    if (afterCardId && afterIndex === -1) {
      throw this.staleOrderError()
    }

    if (beforeCardId && afterCardId) {
      if (afterIndex !== beforeIndex + 1) {
        throw this.staleOrderError()
      }

      const before = cards[beforeIndex] as DestinationCardRow
      const after = cards[afterIndex] as DestinationCardRow
      const midpoint = before.position.plus(after.position).div(2).toDecimalPlaces(6)

      if (midpoint.lte(before.position) || midpoint.gte(after.position)) {
        throw new ConflictException(
          'Позиции карточек стали слишком плотными. Обновите доску, чтобы продолжить.',
        )
      }

      return midpoint
    }

    if (beforeCardId) {
      if (beforeIndex !== cards.length - 1) {
        throw this.staleOrderError()
      }

      const before = cards[beforeIndex] as DestinationCardRow
      return before.position.plus(CARD_GAP)
    }

    if (afterIndex !== 0) {
      throw this.staleOrderError()
    }

    const after = cards[afterIndex] as DestinationCardRow
    return after.position.minus(CARD_GAP)
  }

  private async findCardWithAccess(userId: string, cardId: string) {
    const card = await this.prisma.card.findFirst({
      where: {
        id: cardId,
        column: { board: { members: { some: { userId } } } },
      },
      include: { column: { select: { boardId: true } } },
    })

    if (!card) {
      throw new NotFoundException('Карточка не найдена')
    }

    return card
  }

  private async lockCard(tx: Prisma.TransactionClient, cardId: string): Promise<LockedCardRow> {
    const [card] = await tx.$queryRaw<LockedCardRow[]>`
      SELECT id, column_id AS "columnId", version, position
      FROM cards
      WHERE id = ${cardId}::uuid
      FOR UPDATE
    `

    if (!card) {
      throw new NotFoundException('Карточка не найдена')
    }

    return card
  }

  private async touchBoard(tx: Prisma.TransactionClient, boardId: string): Promise<void> {
    await tx.board.update({
      where: { id: boardId },
      data: { updatedAt: new Date() },
    })
  }

  private staleOrderError(): ConflictException {
    return new ConflictException(
      'Порядок карточек изменился. Обновите доску и повторите перемещение.',
    )
  }
}
