import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import cookie from '@fastify/cookie'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { io, type Socket as ClientSocket } from 'socket.io-client'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  WS_EVENTS,
  type BoardMemberRemovedPayload,
  type BoardMemberUpdatedPayload,
  type ColumnCreatedPayload,
  type PresenceUpdatedPayload,
} from '@trello/shared'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma/prisma.service'

type WsExceptionPayload = { status: string; message: string }

describe('Realtime: авторизация и совместная работа по WebSocket', () => {
  let app: NestFastifyApplication
  let prisma: PrismaService
  let baseUrl = ''

  const sockets: ClientSocket[] = []

  let ownerToken = ''
  let ownerId = ''
  let memberToken = ''
  let memberId = ''
  let outsiderToken = ''
  let boardId = ''

  const ownerEmail = `realtime.owner.${randomUUID()}@trello.local`
  const memberEmail = `realtime.member.${randomUUID()}@trello.local`
  const outsiderEmail = `realtime.outsider.${randomUUID()}@trello.local`

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

  function connect(token?: string): ClientSocket {
    const socket = io(baseUrl, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    })
    sockets.push(socket)
    return socket
  }

  function waitForEvent<T>(socket: ClientSocket, event: string, timeout = 4000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off(event, handler)
        reject(new Error(`Не дождались события ${event}`))
      }, timeout)

      const handler = (payload: T) => {
        clearTimeout(timer)
        socket.off(event, handler)
        resolve(payload)
      }

      socket.on(event, handler)
    })
  }

  function expectNoEvent(socket: ClientSocket, event: string, ms = 400): Promise<void> {
    return new Promise((resolve, reject) => {
      const handler = (payload: unknown) => {
        clearTimeout(timer)
        reject(new Error(`Неожиданное событие ${event}: ${JSON.stringify(payload)}`))
      }

      const timer = setTimeout(() => {
        socket.off(event, handler)
        resolve()
      }, ms)

      socket.on(event, handler)
    })
  }

  function expectRejectedConnection(token?: string): Promise<void> {
    const socket = connect(token)

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Сервер не разорвал соединение с неавторизованным клиентом'))
      }, 4000)

      const done = () => {
        clearTimeout(timer)
        resolve()
      }

      socket.on('disconnect', done)
      socket.on('connect_error', done)
    })
  }

  async function subscribe(socket: ClientSocket, targetBoardId: string): Promise<void> {
    const joined = waitForEvent<{ boardId: string }>(socket, WS_EVENTS.BOARD_JOINED)
    socket.emit(WS_EVENTS.BOARD_SUBSCRIBE, { boardId: targetBoardId })
    const payload = await joined
    expect(payload.boardId).toBe(targetBoardId)
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.register(cookie)
    app.setGlobalPrefix('api')
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    await app.listen(0, '127.0.0.1')

    const address = app.getHttpServer().address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`

    prisma = app.get(PrismaService)

    const owner = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'Владелец Realtime', email: ownerEmail, password: 'Test12345' })
      .expect(201)

    ownerToken = owner.body.accessToken
    ownerId = owner.body.user.id

    const member = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'Участник Realtime', email: memberEmail, password: 'Test12345' })
      .expect(201)

    memberToken = member.body.accessToken
    memberId = member.body.user.id

    const outsider = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'Посторонний Realtime', email: outsiderEmail, password: 'Test12345' })
      .expect(201)

    outsiderToken = outsider.body.accessToken

    const board = await request(app.getHttpServer())
      .post('/api/boards')
      .set(auth(ownerToken))
      .send({ title: 'Realtime E2E' })
      .expect(201)

    boardId = board.body.id

    const share = await request(app.getHttpServer())
      .post(`/api/boards/${boardId}/share`)
      .set(auth(ownerToken))
      .send({ role: 'editor' })
      .expect(201)

    await request(app.getHttpServer())
      .post('/api/boards/join')
      .set(auth(memberToken))
      .send({ shareToken: share.body.token })
      .expect(201)
  })

  afterEach(() => {
    for (const socket of sockets.splice(0)) {
      socket.disconnect()
    }
  })

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({
        where: { email: { in: [ownerEmail, memberEmail, outsiderEmail] } },
      })
    }

    if (app) {
      await app.close()
    }
  })

  it('отклоняет подключение без токена и с поддельным токеном', async () => {
    await expectRejectedConnection()
    await expectRejectedConnection('not-a-jwt')
  })

  it('подписывает на доску и считает presence без дублей по вкладкам', async () => {
    const first = connect(ownerToken)
    await subscribe(first, boardId)

    const presence = waitForEvent<PresenceUpdatedPayload>(first, WS_EVENTS.PRESENCE_UPDATED)

    const second = connect(ownerToken)
    await subscribe(second, boardId)

    const payload = await presence
    expect(payload.count).toBe(1)
    expect(payload.users.map((user) => user.id)).toEqual([ownerId])
  })

  it('не даёт подписаться на чужую доску и проверяет id доски', async () => {
    const outsider = connect(outsiderToken)

    const denied = waitForEvent<WsExceptionPayload>(outsider, 'exception')
    outsider.emit(WS_EVENTS.BOARD_SUBSCRIBE, { boardId })
    expect((await denied).message).toContain('нет доступа')

    await expectNoEvent(outsider, WS_EVENTS.BOARD_JOINED, 300)

    const invalid = waitForEvent<WsExceptionPayload>(outsider, 'exception')
    outsider.emit(WS_EVENTS.BOARD_SUBSCRIBE, { boardId: 'oops' })
    expect((await invalid).message).toContain('Некорректный id доски')
  })

  it('доставляет события колонок подписчикам и останавливает после отписки', async () => {
    const owner = connect(ownerToken)
    const member = connect(memberToken)
    await Promise.all([subscribe(owner, boardId), subscribe(member, boardId)])

    const forOwner = waitForEvent<ColumnCreatedPayload>(owner, WS_EVENTS.COLUMN_CREATED)
    const forMember = waitForEvent<ColumnCreatedPayload>(member, WS_EVENTS.COLUMN_CREATED)

    const created = await request(app.getHttpServer())
      .post(`/api/boards/${boardId}/columns`)
      .set(auth(ownerToken))
      .send({ title: 'Realtime колонка' })
      .expect(201)

    const [ownerPayload, memberPayload] = await Promise.all([forOwner, forMember])
    expect(ownerPayload.column.id).toBe(created.body.id)
    expect(ownerPayload.boardId).toBe(boardId)
    expect(memberPayload.column.title).toBe('Realtime колонка')

    const presence = waitForEvent<PresenceUpdatedPayload>(owner, WS_EVENTS.PRESENCE_UPDATED)
    member.emit(WS_EVENTS.BOARD_UNSUBSCRIBE, { boardId })
    expect((await presence).count).toBe(1)

    const afterUnsubscribe = waitForEvent<ColumnCreatedPayload>(owner, WS_EVENTS.COLUMN_CREATED)
    await request(app.getHttpServer())
      .post(`/api/boards/${boardId}/columns`)
      .set(auth(ownerToken))
      .send({ title: 'Колонка после отписки' })
      .expect(201)

    await afterUnsubscribe
    await expectNoEvent(member, WS_EVENTS.COLUMN_CREATED, 500)
  })

  it('рассылает смену роли и удаление участника, отключая его от комнаты', async () => {
    const member = connect(memberToken)
    await subscribe(member, boardId)

    const roleChanged = waitForEvent<BoardMemberUpdatedPayload>(member, WS_EVENTS.BOARD_MEMBER_UPDATED)
    await request(app.getHttpServer())
      .patch(`/api/boards/${boardId}/members/${memberId}`)
      .set(auth(ownerToken))
      .send({ role: 'viewer' })
      .expect(200)

    const updated = await roleChanged
    expect(updated.boardId).toBe(boardId)
    expect(updated.member.userId).toBe(memberId)
    expect(updated.member.role).toBe('viewer')

    const removed = waitForEvent<BoardMemberRemovedPayload>(member, WS_EVENTS.BOARD_MEMBER_REMOVED)
    await request(app.getHttpServer())
      .delete(`/api/boards/${boardId}/members/${memberId}`)
      .set(auth(ownerToken))
      .expect(204)

    expect((await removed).userId).toBe(memberId)

    const owner = connect(ownerToken)
    await subscribe(owner, boardId)

    const broadcast = waitForEvent<ColumnCreatedPayload>(owner, WS_EVENTS.COLUMN_CREATED)
    await request(app.getHttpServer())
      .post(`/api/boards/${boardId}/columns`)
      .set(auth(ownerToken))
      .send({ title: 'После удаления участника' })
      .expect(201)

    await broadcast
    await expectNoEvent(member, WS_EVENTS.COLUMN_CREATED, 500)
  })
})
