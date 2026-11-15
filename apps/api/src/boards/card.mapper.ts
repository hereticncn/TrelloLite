import type { Prisma } from '@prisma/client'
import type { CardDto } from '@trello/shared'

export type CardRecord = {
  id: string
  columnId: string
  title: string
  description: string
  position: Prisma.Decimal
  version: number
  createdById: string
  createdAt: Date
  updatedAt: Date
}

export function toCardDto(card: CardRecord): CardDto {
  return {
    id: card.id,
    columnId: card.columnId,
    title: card.title,
    description: card.description,
    position: card.position.toNumber(),
    version: card.version,
    createdById: card.createdById,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
  }
}
