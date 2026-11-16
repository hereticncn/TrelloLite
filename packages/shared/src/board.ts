import { z } from 'zod'
import type { CardDto } from './card'

const titleSchema = (label: string) =>
  z.string().trim().min(1, `Введите ${label}`).max(80, 'Максимум 80 символов')

export const boardTitleSchema = titleSchema('название доски')
export const columnTitleSchema = titleSchema('название колонки')

export const createBoardSchema = z.object({
  title: boardTitleSchema,
})

export const updateBoardSchema = z.object({
  title: boardTitleSchema,
})

export const createColumnSchema = z.object({
  title: columnTitleSchema,
})

export const updateColumnSchema = z.object({
  title: columnTitleSchema,
})

export const boardRoleSchema = z.enum(['editor', 'viewer'])

export const shareBoardSchema = z.object({
  role: boardRoleSchema,
  regenerate: z.boolean().optional().default(false),
})

export const joinBoardSchema = z.object({
  shareToken: z.string().trim().min(20, 'Некорректная ссылка').max(64, 'Некорректная ссылка'),
})

export const updateBoardMemberSchema = z.object({
  role: boardRoleSchema,
})

export type CreateBoardInput = z.infer<typeof createBoardSchema>
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>
export type CreateColumnInput = z.infer<typeof createColumnSchema>
export type UpdateColumnInput = z.infer<typeof updateColumnSchema>
export type ShareBoardInput = z.infer<typeof shareBoardSchema>
export type JoinBoardInput = z.infer<typeof joinBoardSchema>
export type UpdateBoardMemberInput = z.infer<typeof updateBoardMemberSchema>

export type BoardRoleDto = z.infer<typeof boardRoleSchema>

export type ColumnDto = {
  id: string
  boardId: string
  title: string
  position: number
  version: number
  createdAt: string
  updatedAt: string
}

export type BoardColumnDto = ColumnDto & {
  cards: CardDto[]
}

export type BoardSummaryDto = {
  id: string
  title: string
  ownerId: string
  role: BoardRoleDto
  columnsCount: number
  createdAt: string
  updatedAt: string
}

export type BoardDto = BoardSummaryDto & {
  columns: BoardColumnDto[]
}

export type BoardShareDto = {
  token: string
  role: BoardRoleDto
}

export type BoardMemberDto = {
  userId: string
  name: string
  email: string
  role: BoardRoleDto
  isOwner: boolean
  joinedAt: string
}

export type JoinBoardResultDto = {
  boardId: string
  title: string
  role: BoardRoleDto
}
