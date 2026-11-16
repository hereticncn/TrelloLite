import { randomUUID } from 'node:crypto'
import cookie from '@fastify/cookie'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BoardMemberDto } from '@trello/shared'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma/prisma.service'

describe('Участники доски: список, роли и удаление', () => {
  let app: NestFastifyApplication
  let prisma: PrismaService

  let ownerToken = ''
  let ownerId = ''
  let memberToken = ''
  let memberId = ''
  let boardId = ''
  let shareToken = ''

  const ownerEmail = `members.owner.${randomUUID()}@trello.local`
  const memberEmail = `members.member.${randomUUID()}@trello.local`

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

  async function membersOf(token: string): Promise<BoardMemberDto[]> {
    const response = await request(app.getHttpServer())
      .get(`/api/boards/${boardId}/members`)
      .set(auth(token))
      .expect(200)

    return response.body as BoardMemberDto[]
  }

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
      .send({ name: 'Владелец Доски', email: ownerEmail, password: 'Test12345' })
      .expect(201)

    ownerToken = owner.body.accessToken
    ownerId = owner.body.user.id

    const member = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'Приглашённый Участник', email: memberEmail, password: 'Test12345' })
      .expect(201)

    memberToken = member.body.accessToken
    memberId = member.body.user.id

    const board = await request(app.getHttpServer())
      .post('/api/boards')
      .set(auth(ownerToken))
      .send({ title: 'Members E2E' })
      .expect(201)

    boardId = board.body.id

    const share = await request(app.getHttpServer())
      .post(`/api/boards/${boardId}/share`)
      .set(auth(ownerToken))
      .send({ role: 'editor' })
      .expect(201)

    shareToken = share.body.token
  })

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({
        where: { email: { in: [ownerEmail, memberEmail] } },
      })
    }

    if (app) {
      await app.close()
    }
  })

  it('владелец видит себя и присоединившегося участника', async () => {
    const joined = await request(app.getHttpServer())
      .post('/api/boards/join')
      .set(auth(memberToken))
      .send({ shareToken })
      .expect(201)

    expect(joined.body.role).toBe('editor')

    const members = await membersOf(ownerToken)
    expect(members).toHaveLength(2)

    const owner = members.find((member) => member.userId === ownerId)
    expect(owner?.isOwner).toBe(true)
    expect(owner?.role).toBe('editor')
    expect(owner?.email).toBe(ownerEmail)

    const invited = members.find((member) => member.userId === memberId)
    expect(invited?.isOwner).toBe(false)
    expect(invited?.role).toBe('editor')
    expect(invited?.name).toBe('Приглашённый Участник')
    expect(typeof invited?.joinedAt).toBe('string')
  })

  it('участник не может менять роли и удалять других', async () => {
    await request(app.getHttpServer())
      .patch(`/api/boards/${boardId}/members/${memberId}`)
      .set(auth(memberToken))
      .send({ role: 'viewer' })
      .expect(403)

    await request(app.getHttpServer())
      .delete(`/api/boards/${boardId}/members/${ownerId}`)
      .set(auth(memberToken))
      .expect(403)
  })

  it('владелец меняет роль участника, и новый доступ применяется сразу', async () => {
    const demoted = await request(app.getHttpServer())
      .patch(`/api/boards/${boardId}/members/${memberId}`)
      .set(auth(ownerToken))
      .send({ role: 'viewer' })
      .expect(200)

    expect(demoted.body.role).toBe('viewer')
    expect(demoted.body.isOwner).toBe(false)

    await request(app.getHttpServer())
      .post(`/api/boards/${boardId}/columns`)
      .set(auth(memberToken))
      .send({ title: 'Нельзя зрителю' })
      .expect(403)

    const promoted = await request(app.getHttpServer())
      .patch(`/api/boards/${boardId}/members/${memberId}`)
      .set(auth(ownerToken))
      .send({ role: 'editor' })
      .expect(200)

    expect(promoted.body.role).toBe('editor')

    await request(app.getHttpServer())
      .post(`/api/boards/${boardId}/columns`)
      .set(auth(memberToken))
      .send({ title: 'Теперь можно' })
      .expect(201)
  })

  it('владелец не может изменить собственную роль', async () => {
    await request(app.getHttpServer())
      .patch(`/api/boards/${boardId}/members/${ownerId}`)
      .set(auth(ownerToken))
      .send({ role: 'viewer' })
      .expect(403)
  })

  it('удалённый участник теряет доступ и может вернуться по share-ссылке', async () => {
    await request(app.getHttpServer())
      .delete(`/api/boards/${boardId}/members/${memberId}`)
      .set(auth(ownerToken))
      .expect(204)

    await request(app.getHttpServer())
      .get(`/api/boards/${boardId}`)
      .set(auth(memberToken))
      .expect(404)

    await request(app.getHttpServer())
      .get(`/api/boards/${boardId}/members`)
      .set(auth(memberToken))
      .expect(404)

    const list = await request(app.getHttpServer())
      .get('/api/boards')
      .set(auth(memberToken))
      .expect(200)

    expect(list.body.some((board: { id: string }) => board.id === boardId)).toBe(false)

    const rejoined = await request(app.getHttpServer())
      .post('/api/boards/join')
      .set(auth(memberToken))
      .send({ shareToken })
      .expect(201)

    expect(rejoined.body.role).toBe('editor')
  })

  it('участник может покинуть доску сам', async () => {
    await request(app.getHttpServer())
      .delete(`/api/boards/${boardId}/members/${memberId}`)
      .set(auth(memberToken))
      .expect(204)

    await request(app.getHttpServer())
      .get(`/api/boards/${boardId}`)
      .set(auth(memberToken))
      .expect(404)

    const members = await membersOf(ownerToken)
    expect(members.map((member) => member.userId)).toEqual([ownerId])
  })

  it('владельца нельзя удалить из его доски', async () => {
    await request(app.getHttpServer())
      .delete(`/api/boards/${boardId}/members/${ownerId}`)
      .set(auth(ownerToken))
      .expect(403)
  })
})
