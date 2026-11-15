import { NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'

/**
 * Serializes all mutations of a board together with its columns and cards.
 * Every write transaction takes this lock first, then locks the rows it touches,
 * so column/card operations cannot deadlock on the board row.
 */
export async function lockBoardRow(
  tx: Prisma.TransactionClient,
  boardId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM boards WHERE id = ${boardId}::uuid FOR UPDATE
  `

  if (rows.length === 0) {
    throw new NotFoundException('Доска не найдена')
  }
}
