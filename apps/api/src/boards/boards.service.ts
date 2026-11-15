import { randomBytes } from 'node:crypto'
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, type BoardRole } from '@prisma/client'
import type {
  BoardColumnDto,
  BoardDto,
  BoardShareDto,
  BoardSummaryDto,
  ColumnDto,
  CreateBoardInput,
  CreateColumnInput,
  JoinBoardResultDto,
  ShareBoardInput,
  UpdateBoardInput,
  UpdateColumnInput,
} from '@trello/shared'
import { PrismaService } from '../prisma/prisma.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { lockBoardRow } from './board-lock'
import { toCardDto } from './card.mapper'

const DEFAULT_COLUMNS = [
  { title: 'Бэклог', position: 1000 },
  { title: 'В работе', position: 2000 },
  { title: 'Готово', position: 3000 },
]

const COLUMN_GAP = 1000

type ColumnRecord = {
  id: string
  boardId: string
  title: string
  position: Prisma.Decimal
  version: number
  createdAt: Date
  updatedAt: Date
}

type BoardSummaryRecord = {
  id: string
  title: string
  ownerId: string
  createdAt: Date
  updatedAt: Date
  members: Array<{ role: BoardRole }>
  _count: { columns: number }
}

function toColumnDto(column: ColumnRecord): ColumnDto {
  return {
    id: column.id,
    boardId: column.boardId,
    title: column.title,
    position: column.position.toNumber(),
    version: column.version,
    createdAt: column.createdAt.toISOString(),
    updatedAt: column.updatedAt.toISOString(),
  }
}

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async list(userId: string): Promise<BoardSummaryDto[]> {
    const boards = await this.prisma.board.findMany({
      where: { members: { some: { userId } } },
      orderBy: { updatedAt: 'desc' },
      include: {
        members: { where: { userId }, select: { role: true } },
        _count: { select: { columns: true } },
      },
    })

    return boards.map((board) => this.toSummary(board))
  }

  async get(userId: string, boardId: string): Promise<BoardDto> {
    const board = await this.prisma.board.findFirst({
      where: { id: boardId, members: { some: { userId } } },
      include: {
        members: { where: { userId }, select: { role: true } },
        columns: {
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          include: { cards: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
        },
        _count: { select: { columns: true } },
      },
    })

    if (!board) {
      throw new NotFoundException('Доска не найдена')
    }

    return {
      ...this.toSummary(board),
      columns: board.columns.map((column) => ({
        ...toColumnDto(column),
        cards: column.cards.map(toCardDto),
      })),
    }
  }

  async create(userId: string, input: CreateBoardInput): Promise<BoardDto> {
    const board = await this.prisma.board.create({
      data: {
        title: input.title,
        ownerId: userId,
        members: { create: { userId, role: 'editor' } },
        columns: {
          create: DEFAULT_COLUMNS.map((column) => ({
            title: column.title,
            position: new Prisma.Decimal(column.position),
          })),
        },
      },
      include: {
        members: { where: { userId }, select: { role: true } },
        columns: { orderBy: { position: 'asc' } },
        _count: { select: { columns: true } },
      },
    })

    return {
      ...this.toSummary(board),
      columns: board.columns.map((column): BoardColumnDto => ({
        ...toColumnDto(column),
        cards: [],
      })),
    }
  }

  async update(userId: string, boardId: string, input: UpdateBoardInput): Promise<BoardDto> {
    await this.assertEditor(userId, boardId)

    await this.prisma.board.update({
      where: { id: boardId },
      data: { title: input.title },
    })

    return this.get(userId, boardId)
  }

  async getShare(userId: string, boardId: string): Promise<BoardShareDto | null> {
    const board = await this.findBoardForSharing(userId, boardId)

    if (!board.shareToken) {
      return null
    }

    return { token: board.shareToken, role: board.shareRole }
  }

  async shareBoard(
    userId: string,
    boardId: string,
    input: ShareBoardInput,
  ): Promise<BoardShareDto> {
    const board = await this.findBoardForSharing(userId, boardId)
    const token =
      !board.shareToken || input.regenerate
        ? randomBytes(32).toString('base64url')
        : board.shareToken

    await this.prisma.board.update({
      where: { id: boardId },
      data: { shareToken: token, shareRole: input.role },
    })

    return { token, role: input.role }
  }

  async join(userId: string, shareToken: string): Promise<JoinBoardResultDto> {
    const board = await this.prisma.board.findUnique({
      where: { shareToken },
      select: { id: true, title: true, ownerId: true, shareRole: true },
    })

    if (!board) {
      throw new NotFoundException('Ссылка недействительна или устарела')
    }

    if (board.ownerId === userId) {
      return { boardId: board.id, title: board.title, role: 'editor' }
    }

    // Keep an existing role: a viewer link must not demote an editor who
    // already joined, and role changes only affect new participants.
    const member = await this.prisma.boardMember.upsert({
      where: { boardId_userId: { boardId: board.id, userId } },
      create: { boardId: board.id, userId, role: board.shareRole },
      update: {},
      select: { role: true },
    })

    return { boardId: board.id, title: board.title, role: member.role }
  }

  async remove(userId: string, boardId: string): Promise<void> {
    const board = await this.prisma.board.findFirst({
      where: { id: boardId, members: { some: { userId } } },
      select: { ownerId: true },
    })

    if (!board) {
      throw new NotFoundException('Доска не найдена')
    }

    if (board.ownerId !== userId) {
      throw new ForbiddenException('Удалить доску может только владелец')
    }

    await this.prisma.board.delete({ where: { id: boardId } })
  }

  async createColumn(
    userId: string,
    boardId: string,
    input: CreateColumnInput,
  ): Promise<ColumnDto> {
    await this.assertEditor(userId, boardId)

    const column = await this.prisma.$transaction(async (tx) => {
      await lockBoardRow(tx, boardId)

      const aggregate = await tx.column.aggregate({
        where: { boardId },
        _max: { position: true },
      })
      const maxPosition = aggregate._max.position
      const position = maxPosition
        ? maxPosition.plus(COLUMN_GAP)
        : new Prisma.Decimal(COLUMN_GAP)

      const created = await tx.column.create({
        data: { boardId, title: input.title, position },
      })

      await tx.board.update({
        where: { id: boardId },
        data: { updatedAt: new Date() },
      })

      return toColumnDto(created)
    })

    this.realtime.emitColumnCreated(boardId, column)
    return column
  }

  async updateColumn(
    userId: string,
    columnId: string,
    input: UpdateColumnInput,
  ): Promise<ColumnDto> {
    const existing = await this.findColumn(columnId)
    await this.assertEditor(userId, existing.boardId)

    const column = await this.prisma.$transaction(async (tx) => {
      await lockBoardRow(tx, existing.boardId)

      const updated = await tx.column.update({
        where: { id: columnId },
        data: { title: input.title, version: { increment: 1 } },
      })

      await tx.board.update({
        where: { id: existing.boardId },
        data: { updatedAt: new Date() },
      })

      return toColumnDto(updated)
    })

    this.realtime.emitColumnUpdated(existing.boardId, column)
    return column
  }

  async deleteColumn(userId: string, columnId: string): Promise<void> {
    const column = await this.findColumn(columnId)
    await this.assertEditor(userId, column.boardId)

    await this.prisma.$transaction(async (tx) => {
      await lockBoardRow(tx, column.boardId)

      await tx.column.delete({ where: { id: columnId } })

      await tx.board.update({
        where: { id: column.boardId },
        data: { updatedAt: new Date() },
      })
    })

    this.realtime.emitColumnDeleted(column.boardId, columnId)
  }

  private async findColumn(columnId: string): Promise<ColumnRecord> {
    const column = await this.prisma.column.findUnique({ where: { id: columnId } })

    if (!column) {
      throw new NotFoundException('Колонка не найдена')
    }

    return column
  }

  private async findBoardForSharing(
    userId: string,
    boardId: string,
  ): Promise<{ ownerId: string; shareToken: string | null; shareRole: BoardRole }> {
    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      select: { ownerId: true, shareToken: true, shareRole: true },
    })

    if (!board) {
      throw new NotFoundException('Доска не найдена')
    }

    if (board.ownerId !== userId) {
      throw new ForbiddenException('Ссылкой может управлять только владелец доски')
    }

    return board
  }

  async assertEditor(userId: string, boardId: string): Promise<void> {
    const member = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId } },
      select: { role: true },
    })

    if (!member) {
      throw new NotFoundException('Доска не найдена')
    }

    if (member.role !== 'editor') {
      throw new ForbiddenException('Недостаточно прав для изменения доски')
    }
  }

  private toSummary(board: BoardSummaryRecord): BoardSummaryDto {
    return {
      id: board.id,
      title: board.title,
      ownerId: board.ownerId,
      role: board.members[0]?.role ?? 'viewer',
      columnsCount: board._count.columns,
      createdAt: board.createdAt.toISOString(),
      updatedAt: board.updatedAt.toISOString(),
    }
  }
}
