import { Injectable } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets'
import type {
  CardCreatedPayload,
  CardDeletedPayload,
  CardMovedPayload,
  CardUpdatedPayload,
  ColumnCreatedPayload,
  ColumnDeletedPayload,
  ColumnUpdatedPayload,
  ColumnDto,
  CardDto,
  PresenceUpdatedPayload,
  PresenceUser,
} from '@trello/shared'
import { WS_EVENTS } from '@trello/shared'
import type { Server, Socket } from 'socket.io'
import { TokenService } from '../auth/token.service'
import { corsOrigins } from '../config/env'
import { PrismaService } from '../prisma/prisma.service'

type SocketState = {
  user: PresenceUser
  boardIds: Set<string>
}

type SocketContext = {
  state: SocketState | null
  ready: Promise<SocketState | null>
}

const boardRoom = (boardId: string): string => `board:${boardId}`
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

@WebSocketGateway({
  cors: { origin: corsOrigins, credentials: true },
})
@Injectable()
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server

  /** boardId -> socketId -> user, needed to deduplicate tabs per user. */
  private readonly presence = new Map<string, Map<string, PresenceUser>>()

  /**
   * Socket.IO emits `connect` before Nest finishes the async handshake, so a
   * client can send `board.subscribe` while the token is still being checked.
   * Handlers await this promise instead of reading socket.data too early.
   */
  private readonly sockets = new WeakMap<Socket, SocketContext>()

  constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  handleConnection(socket: Socket): void {
    const context: SocketContext = { state: null, ready: Promise.resolve(null) }
    this.sockets.set(socket, context)

    context.ready = this.authenticate(socket).then((state) => {
      context.state = state
      if (!state) {
        socket.disconnect(true)
      }
      return state
    })
  }

  handleDisconnect(socket: Socket): void {
    const state = this.sockets.get(socket)?.state
    for (const boardId of state?.boardIds ?? []) {
      this.removePresence(socket.id, boardId)
    }
    this.sockets.delete(socket)
  }

  @SubscribeMessage(WS_EVENTS.BOARD_SUBSCRIBE)
  async handleSubscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const state = await this.state(socket)
    const boardId = this.boardId(body)

    const member = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: state.user.id } },
      select: { role: true },
    })

    if (!member) {
      throw new WsException('Доска не найдена или нет доступа')
    }

    await socket.join(boardRoom(boardId))
    state.boardIds.add(boardId)
    socket.emit(WS_EVENTS.BOARD_JOINED, { boardId })
    this.addPresence(socket.id, boardId, state.user)
  }

  @SubscribeMessage(WS_EVENTS.BOARD_UNSUBSCRIBE)
  async handleUnsubscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const state = await this.state(socket)
    const boardId = this.boardId(body)

    await socket.leave(boardRoom(boardId))
    state.boardIds.delete(boardId)
    this.removePresence(socket.id, boardId)
  }

  emitColumnCreated(boardId: string, column: ColumnDto): void {
    const payload: ColumnCreatedPayload = { boardId, column }
    this.server.to(boardRoom(boardId)).emit(WS_EVENTS.COLUMN_CREATED, payload)
  }

  emitColumnUpdated(boardId: string, column: ColumnDto): void {
    const payload: ColumnUpdatedPayload = { boardId, column }
    this.server.to(boardRoom(boardId)).emit(WS_EVENTS.COLUMN_UPDATED, payload)
  }

  emitColumnDeleted(boardId: string, columnId: string): void {
    const payload: ColumnDeletedPayload = { boardId, columnId }
    this.server.to(boardRoom(boardId)).emit(WS_EVENTS.COLUMN_DELETED, payload)
  }

  emitCardCreated(boardId: string, card: CardDto): void {
    const payload: CardCreatedPayload = { boardId, columnId: card.columnId, card }
    this.server.to(boardRoom(boardId)).emit(WS_EVENTS.CARD_CREATED, payload)
  }

  emitCardUpdated(boardId: string, card: CardDto): void {
    const payload: CardUpdatedPayload = { boardId, card }
    this.server.to(boardRoom(boardId)).emit(WS_EVENTS.CARD_UPDATED, payload)
  }

  emitCardMoved(boardId: string, card: CardDto): void {
    const payload: CardMovedPayload = { boardId, card }
    this.server.to(boardRoom(boardId)).emit(WS_EVENTS.CARD_MOVED, payload)
  }

  emitCardDeleted(boardId: string, cardId: string, columnId: string): void {
    const payload: CardDeletedPayload = { boardId, cardId, columnId }
    this.server.to(boardRoom(boardId)).emit(WS_EVENTS.CARD_DELETED, payload)
  }

  private async authenticate(socket: Socket): Promise<SocketState | null> {
    try {
      const token = socket.handshake.auth?.token
      if (typeof token !== 'string' || !token) {
        return null
      }

      const payload = await this.tokens.verifyAccessToken(token)
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, name: true },
      })

      return user ? { user, boardIds: new Set() } : null
    } catch {
      return null
    }
  }

  private async state(socket: Socket): Promise<SocketState> {
    const context = this.sockets.get(socket)
    const state = context ? await context.ready : null
    if (!state) {
      throw new WsException('Требуется авторизация')
    }
    return state
  }

  private boardId(body: unknown): string {
    const value = typeof body === 'object' && body !== null ? (body as { boardId?: unknown }).boardId : undefined
    if (typeof value !== 'string' || !UUID_RE.test(value)) {
      throw new WsException('Некорректный id доски')
    }
    return value
  }

  private addPresence(socketId: string, boardId: string, user: PresenceUser): void {
    const room = this.presence.get(boardId) ?? new Map<string, PresenceUser>()
    room.set(socketId, user)
    this.presence.set(boardId, room)
    this.broadcastPresence(boardId)
  }

  private removePresence(socketId: string, boardId: string): void {
    const room = this.presence.get(boardId)
    if (!room) return

    room.delete(socketId)
    if (room.size === 0) {
      this.presence.delete(boardId)
      return
    }

    this.broadcastPresence(boardId)
  }

  private broadcastPresence(boardId: string): void {
    const users = new Map<string, PresenceUser>()
    for (const user of this.presence.get(boardId)?.values() ?? []) {
      users.set(user.id, user)
    }

    const payload: PresenceUpdatedPayload = {
      boardId,
      count: users.size,
      users: [...users.values()],
    }
    this.server.to(boardRoom(boardId)).emit(WS_EVENTS.PRESENCE_UPDATED, payload)
  }
}
