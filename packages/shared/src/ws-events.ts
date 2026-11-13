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
