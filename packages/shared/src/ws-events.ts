import type { ColumnDto } from './board'
import type { CardDto } from './card'

/**
 * Socket.IO event names shared between the API and the web client.
 * Server -> client events are listed first, client -> server after them.
 */
export const WS_EVENTS = {
  // client -> server
  BOARD_SUBSCRIBE: 'board.subscribe',
  BOARD_UNSUBSCRIBE: 'board.unsubscribe',

  // server -> client
  BOARD_JOINED: 'board.joined',
  COLUMN_CREATED: 'column.created',
  COLUMN_UPDATED: 'column.updated',
  COLUMN_DELETED: 'column.deleted',
  CARD_CREATED: 'card.created',
  CARD_UPDATED: 'card.updated',
  CARD_MOVED: 'card.moved',
  CARD_DELETED: 'card.deleted',
  PRESENCE_UPDATED: 'presence.updated',
} as const

export type WsEvent = (typeof WS_EVENTS)[keyof typeof WS_EVENTS]

export type BoardSubscribePayload = { boardId: string }
export type BoardJoinedPayload = { boardId: string }

export type PresenceUser = { id: string; name: string }
export type PresenceUpdatedPayload = {
  boardId: string
  count: number
  users: PresenceUser[]
}

export type ColumnCreatedPayload = { boardId: string; column: ColumnDto }
export type ColumnUpdatedPayload = { boardId: string; column: ColumnDto }
export type ColumnDeletedPayload = { boardId: string; columnId: string }

export type CardCreatedPayload = { boardId: string; columnId: string; card: CardDto }
export type CardUpdatedPayload = { boardId: string; card: CardDto }
export type CardMovedPayload = { boardId: string; card: CardDto }
export type CardDeletedPayload = { boardId: string; cardId: string; columnId: string }
