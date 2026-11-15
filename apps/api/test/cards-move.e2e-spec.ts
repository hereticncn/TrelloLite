import { randomUUID } from 'node:crypto'
import cookie from '@fastify/cookie'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Prisma } from '@prisma/client'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma/prisma.service'

type ColumnPayload = {
  id: string
  title: string
  cards: Array<{ id: string }>
}

type CardPayload = {
  id: string
  columnId: string
  title: string
  description: string
  position: number
  version: number
}

describe('Cards and transactional /move', () => {
  let app: NestFastifyApplication
  let prisma: PrismaService

  let ownerToken = ''
  let ownerId = ''
  let viewerToken = ''
  let viewerId = ''
  let boardId = ''
  let backlogId = ''
  let progressId = ''
  let doneId = ''

  const ownerEmail = `cards.owner.${randomUUID()}@trello.local`
  const viewerEmail = `cards.viewer.${randomUUID()}@trello.local`

  let firstCardId = ''

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.register(cookie)
    app.setGlobalPrefix('api')
    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    prisma = app.get(PrismaService)

    const owner = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'Card Owner', email: ownerEmail, password: 'Test12345' })
      .expect(201)

    ownerToken = owner.body.accessToken
    ownerId = owner.body.user.id

    const viewer = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'Card Viewer', email: viewerEmail, password: 'Test12345' })
      .expect(201)

    viewerToken = viewer.body.accessToken
    viewerId = viewer.body.user.id

    const board = await request(app.getHttpServer())
      .post('/api/boards')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Cards E2E' })
      .expect(201)

    boardId = board.body.id

    const columns = board.body.columns as ColumnPayload[]
    backlogId = columns.find((column) => column.title === 'Бэклог')?.id ?? ''
    progressId = columns.find((column) => column.title === 'В работе')?.id ?? ''
    doneId = columns.find((column) => column.title === 'Готово')?.id ?? ''

    expect(backlogId).not.toBe('')
    expect(progressId).not.toBe('')
    expect(doneId).not.toBe('')

    await prisma.boardMember.create({
      data: { boardId, userId: viewerId, role: 'viewer' },
    })
  })

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({
        where: { email: { in: [ownerEmail, viewerEmail] } },
      })
    }

    if (app) {
      await app.close()
    }
  })

  it('creates a card and returns it inside the board', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/columns/${backlogId}/cards`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Первая карточка', description: 'Детали задачи' })
      .expect(201)

    const card = created.body as CardPayload
    expect(card.columnId).toBe(backlogId)
    expect(card.title).toBe('Первая карточка')
    expect(card.description).toBe('Детали задачи')
    expect(card.position).toBe(1000)
    expect(card.version).toBe(1)

    firstCardId = card.id

    const board = await request(app.getHttpServer())
      .get(`/api/boards/${boardId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)

    const backlog = (board.body.columns as ColumnPayload[]).find(
      (column) => column.id === backlogId,
    )
    expect(backlog?.cards).toHaveLength(1)
    expect(backlog?.cards[0]?.id).toBe(card.id)
  })

  it('updates a card and rejects a stale expectedVersion with 409', async () => {
    const updated = await request(app.getHttpServer())
      .patch(`/api/cards/${firstCardId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: 'Первая карточка (обновлена)',
        description: '',
        expectedVersion: 1,
      })
      .expect(200)

    expect(updated.body.version).toBe(2)
    expect(updated.body.title).toBe('Первая карточка (обновлена)')

    const conflict = await request(app.getHttpServer())
      .patch(`/api/cards/${firstCardId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: 'Устаревшая попытка',
        description: '',
        expectedVersion: 1,
      })
      .expect(409)

    expect(conflict.body.message).toContain('уже была изменена')
  })

  it('moves a card and rejects a repeated move with the same version', async () => {
    const moved = await request(app.getHttpServer())
      .post(`/api/cards/${firstCardId}/move`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        toColumnId: progressId,
        beforeCardId: null,
        afterCardId: null,
        expectedVersion: 2,
      })
      .expect(200)

    expect(moved.body.columnId).toBe(progressId)
    expect(moved.body.position).toBe(1000)
    expect(moved.body.version).toBe(3)

    await request(app.getHttpServer())
      .post(`/api/cards/${firstCardId}/move`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        toColumnId: progressId,
        beforeCardId: null,
        afterCardId: null,
        expectedVersion: 2,
      })
      .expect(409)
  })

  it('computes midpoint and edge positions when moving inside one column', async () => {
    const createCard = async (title: string) => {
      const response = await request(app.getHttpServer())
        .post(`/api/columns/${doneId}/cards`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title, description: '' })
        .expect(201)
      return response.body as CardPayload
    }

    const first = await createCard('Done A')
    const second = await createCard('Done B')
    const third = await createCard('Done C')

    expect([first.position, second.position, third.position]).toEqual([1000, 2000, 3000])

    const between = await request(app.getHttpServer())
      .post(`/api/cards/${third.id}/move`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        toColumnId: doneId,
        beforeCardId: first.id,
        afterCardId: second.id,
        expectedVersion: third.version,
      })
      .expect(200)

    expect(between.body.position).toBe(1500)
    expect(between.body.version).toBe(2)

    const top = await request(app.getHttpServer())
      .post(`/api/cards/${third.id}/move`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        toColumnId: doneId,
        beforeCardId: null,
        afterCardId: first.id,
        expectedVersion: 2,
      })
      .expect(200)

    expect(top.body.position).toBe(0)

    const bottom = await request(app.getHttpServer())
      .post(`/api/cards/${third.id}/move`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        toColumnId: doneId,
        beforeCardId: second.id,
        afterCardId: null,
        expectedVersion: 3,
      })
      .expect(200)

    expect(bottom.body.position).toBe(3000)

    const board = await request(app.getHttpServer())
      .get(`/api/boards/${boardId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)

    const done = (board.body.columns as ColumnPayload[]).find((column) => column.id === doneId)
    expect(done?.cards.map((card) => card.id)).toEqual([first.id, second.id, third.id])
  })

  it('handles 50 parallel moves into one column without duplicate positions', async () => {
    const fixtures = Array.from({ length: 50 }, (_, index) => ({
      id: randomUUID(),
      columnId: backlogId,
      title: `Параллельная карточка ${index + 1}`,
      description: '',
      position: new Prisma.Decimal((index + 1) * 1000),
      createdById: ownerId,
    }))

    await prisma.card.createMany({ data: fixtures })

    const responses = await Promise.all(
      fixtures.map((card) =>
        request(app.getHttpServer())
          .post(`/api/cards/${card.id}/move`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({
            toColumnId: progressId,
            beforeCardId: null,
            afterCardId: null,
            expectedVersion: 1,
          }),
      ),
    )

    expect(responses.map((response) => response.status)).toEqual(
      Array.from({ length: 50 }, () => 200),
    )

    const positions = responses.map((response) => response.body.position as number)
    expect(new Set(positions).size).toBe(50)

    const movedCards = await prisma.card.findMany({
      where: { columnId: progressId },
      orderBy: { position: 'asc' },
      select: { id: true, position: true },
    })

    expect(movedCards).toHaveLength(51)
    expect(new Set(movedCards.map((card) => card.position.toFixed(6))).size).toBe(51)

    for (let index = 1; index < movedCards.length; index += 1) {
      expect(movedCards[index]!.position.gt(movedCards[index - 1]!.position)).toBe(true)
    }

    const backlogCards = await prisma.card.count({ where: { columnId: backlogId } })
    expect(backlogCards).toBe(0)
  })

  it('rejects a move whose neighbours are no longer adjacent with 409', async () => {
    const cards = await prisma.card.findMany({
      where: { columnId: progressId },
      orderBy: { position: 'asc' },
      select: { id: true, version: true },
    })

    const created = await request(app.getHttpServer())
      .post(`/api/columns/${backlogId}/cards`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Соседский конфликт', description: '' })
      .expect(201)

    const first = cards[0]!
    const third = cards[2]!

    const conflict = await request(app.getHttpServer())
      .post(`/api/cards/${created.body.id}/move`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        toColumnId: progressId,
        beforeCardId: first.id,
        afterCardId: third.id,
        expectedVersion: created.body.version,
      })
      .expect(409)

    expect(conflict.body.message).toContain('Порядок карточек изменился')
  })

  it('lets a viewer read cards but not mutate them', async () => {
    await request(app.getHttpServer())
      .get(`/api/boards/${boardId}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200)

    await request(app.getHttpServer())
      .post(`/api/columns/${backlogId}/cards`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ title: 'Нельзя', description: '' })
      .expect(403)

    await request(app.getHttpServer())
      .post(`/api/cards/${firstCardId}/move`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        toColumnId: backlogId,
        beforeCardId: null,
        afterCardId: null,
        expectedVersion: 3,
      })
      .expect(403)

    await request(app.getHttpServer())
      .delete(`/api/cards/${firstCardId}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(403)
  })
})
