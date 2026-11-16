import { ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  BoardColumnDto,
  BoardDto,
  BoardMemberDto,
  BoardMemberRemovedPayload,
  BoardMemberUpdatedPayload,
  BoardRoleDto,
  BoardShareDto,
  BoardSummaryDto,
  BoardSubscribePayload,
  CardCreatedPayload,
  CardDeletedPayload,
  CardDto,
  CardMovedPayload,
  CardUpdatedPayload,
  ColumnCreatedPayload,
  ColumnDeletedPayload,
  ColumnDto,
  ColumnUpdatedPayload,
  CreateCardInput,
  JoinBoardResultDto,
  MoveCardInput,
  PresenceUpdatedPayload,
  PresenceUser,
  ShareBoardInput,
  UpdateCardInput,
} from '@trello/shared'
import { WS_EVENTS } from '@trello/shared'
import type { Socket } from 'socket.io-client'
import { api } from '@/lib/http'
import { getApiErrorMessage } from '@/lib/api-error'
import { getRealtimeSocket } from '@/lib/realtime'
import { useAuthStore } from '@/stores/auth'

function toSummary(board: BoardDto): BoardSummaryDto {
  return {
    id: board.id,
    title: board.title,
    ownerId: board.ownerId,
    role: board.role,
    columnsCount: board.columns.length,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  }
}

function sortColumns(columns: BoardColumnDto[]): BoardColumnDto[] {
  return [...columns]
    .sort((a, b) => a.position - b.position)
    .map((column) => ({ ...column, cards: sortCards(column.cards) }))
}

function sortCards(cards: CardDto[]): CardDto[] {
  return [...cards].sort((a, b) => a.position - b.position)
}

function normalizeBoard(board: BoardDto): BoardDto {
  return { ...board, columns: sortColumns(board.columns) }
}

export const useBoardsStore = defineStore('boards', () => {
  const boards = ref<BoardSummaryDto[]>([])
  const currentBoard = ref<BoardDto | null>(null)

  const isLoading = ref(false)
  const isBoardLoading = ref(false)
  const error = ref('')
  const boardError = ref('')
  const presence = ref<PresenceUser[]>([])
  const members = ref<BoardMemberDto[]>([])
  const boardAccessRevoked = ref(false)

  let activeBoardId: string | null = null
  let realtimeBound = false

  async function fetchBoards(): Promise<void> {
    isLoading.value = true
    error.value = ''

    try {
      boards.value = (await api.get<BoardSummaryDto[]>('/boards')).data
    } catch (err) {
      error.value = getApiErrorMessage(err)
    } finally {
      isLoading.value = false
    }
  }

  async function fetchBoard(boardId: string): Promise<void> {
    isBoardLoading.value = true
    boardError.value = ''
    currentBoard.value = null
    boardAccessRevoked.value = false

    try {
      currentBoard.value = normalizeBoard((await api.get<BoardDto>(`/boards/${boardId}`)).data)
    } catch (err) {
      boardError.value = getApiErrorMessage(err)
    } finally {
      isBoardLoading.value = false
    }
  }

  async function reloadBoard(boardId: string): Promise<void> {
    currentBoard.value = normalizeBoard((await api.get<BoardDto>(`/boards/${boardId}`)).data)
  }

  async function createBoard(title: string): Promise<BoardDto> {
    const { data } = await api.post<BoardDto>('/boards', { title })
    currentBoard.value = normalizeBoard(data)
    upsertSummary(data)
    return data
  }

  async function renameBoard(boardId: string, title: string): Promise<void> {
    const { data } = await api.patch<BoardDto>(`/boards/${boardId}`, { title })
    currentBoard.value = normalizeBoard(data)
    upsertSummary(data)
  }

  async function deleteBoard(boardId: string): Promise<void> {
    await api.delete(`/boards/${boardId}`)
    boards.value = boards.value.filter((board) => board.id !== boardId)

    if (currentBoard.value?.id === boardId) {
      currentBoard.value = null
    }
  }

  async function fetchBoardShare(boardId: string): Promise<BoardShareDto | null> {
    const { data } = await api.get<BoardShareDto | null>(`/boards/${boardId}/share`)
    return data
  }

  async function shareBoard(
    boardId: string,
    input: ShareBoardInput,
  ): Promise<BoardShareDto> {
    const { data } = await api.post<BoardShareDto>(`/boards/${boardId}/share`, input)
    return data
  }

  async function joinBoard(shareToken: string): Promise<JoinBoardResultDto> {
    const { data } = await api.post<JoinBoardResultDto>('/boards/join', { shareToken })
    return data
  }

  async function fetchMembers(boardId: string): Promise<void> {
    members.value = (await api.get<BoardMemberDto[]>(`/boards/${boardId}/members`)).data
  }

  async function updateMemberRole(
    boardId: string,
    userId: string,
    role: BoardRoleDto,
  ): Promise<BoardMemberDto> {
    const { data } = await api.patch<BoardMemberDto>(`/boards/${boardId}/members/${userId}`, {
      role,
    })
    upsertMember(data)
    applyOwnRole(data)
    return data
  }

  async function removeMember(boardId: string, userId: string): Promise<void> {
    await api.delete(`/boards/${boardId}/members/${userId}`)
    removeMemberLocally(boardId, userId)
  }

  async function createColumn(boardId: string, title: string): Promise<ColumnDto> {
    const { data } = await api.post<ColumnDto>(`/boards/${boardId}/columns`, { title })

    if (currentBoard.value?.id === boardId) {
      currentBoard.value.columns = sortColumns([
        ...currentBoard.value.columns,
        { ...data, cards: [] },
      ])
      syncColumnsCount(boardId)
    }

    return data
  }

  async function renameColumn(columnId: string, title: string): Promise<void> {
    const { data } = await api.patch<ColumnDto>(`/columns/${columnId}`, { title })

    if (currentBoard.value) {
      currentBoard.value.columns = currentBoard.value.columns.map((column) =>
        column.id === columnId ? { ...column, ...data } : column,
      )
    }
  }

  async function deleteColumn(columnId: string): Promise<void> {
    await api.delete(`/columns/${columnId}`)

    if (currentBoard.value) {
      currentBoard.value.columns = currentBoard.value.columns.filter(
        (column) => column.id !== columnId,
      )
      syncColumnsCount(currentBoard.value.id)
    }
  }

  async function createCard(columnId: string, input: CreateCardInput): Promise<CardDto> {
    const { data } = await api.post<CardDto>(`/columns/${columnId}/cards`, input)
    upsertCard(data)
    return data
  }

  async function updateCard(cardId: string, input: UpdateCardInput): Promise<CardDto> {
    const { data } = await api.patch<CardDto>(`/cards/${cardId}`, input)
    upsertCard(data)
    return data
  }

  async function deleteCard(cardId: string): Promise<void> {
    await api.delete(`/cards/${cardId}`)

    if (currentBoard.value) {
      currentBoard.value.columns = currentBoard.value.columns.map((column) => ({
        ...column,
        cards: column.cards.filter((card) => card.id !== cardId),
      }))
    }
  }

  async function moveCard(cardId: string, input: MoveCardInput): Promise<CardDto> {
    const { data } = await api.post<CardDto>(`/cards/${cardId}/move`, input)
    upsertCard(data)
    return data
  }

  function upsertCard(card: CardDto): void {
    const board = currentBoard.value
    if (!board) return

    for (const column of board.columns) {
      column.cards = column.cards.filter((item) => item.id !== card.id)
    }

    const target = board.columns.find((column) => column.id === card.columnId)
    if (target) {
      target.cards = sortCards([...target.cards, card])
    }
  }

  function upsertSummary(board: BoardDto): void {
    const summary = toSummary(board)
    const index = boards.value.findIndex((item) => item.id === board.id)

    if (index === -1) {
      boards.value.unshift(summary)
    } else {
      boards.value[index] = summary
    }
  }

  function upsertMember(member: BoardMemberDto): void {
    const index = members.value.findIndex((item) => item.userId === member.userId)

    if (index === -1) {
      members.value = [...members.value, member]
    } else {
      members.value = members.value.map((item) =>
        item.userId === member.userId ? member : item,
      )
    }
  }

  function applyOwnRole(member: BoardMemberDto): void {
    const auth = useAuthStore()
    if (auth.user?.id !== member.userId || !currentBoard.value) return

    currentBoard.value.role = member.role
    const summary = boards.value.find((item) => item.id === currentBoard.value?.id)
    if (summary) {
      summary.role = member.role
    }
  }

  function removeMemberLocally(boardId: string, userId: string): void {
    members.value = members.value.filter((member) => member.userId !== userId)

    const auth = useAuthStore()
    if (auth.user?.id !== userId) return

    boardAccessRevoked.value = true
    boards.value = boards.value.filter((board) => board.id !== boardId)
  }

  function syncColumnsCount(boardId: string): void {
    const summary = boards.value.find((board) => board.id === boardId)
    if (summary && currentBoard.value) {
      summary.columnsCount = currentBoard.value.columns.length
    }
  }

  function connectBoard(boardId: string): void {
    const socket = getRealtimeSocket()
    bindRealtimeHandlers(socket)

    if (activeBoardId && activeBoardId !== boardId && socket.connected) {
      socket.emit(WS_EVENTS.BOARD_UNSUBSCRIBE, {
        boardId: activeBoardId,
      } satisfies BoardSubscribePayload)
    }

    activeBoardId = boardId
    presence.value = []
    members.value = []

    if (socket.connected) {
      socket.emit(WS_EVENTS.BOARD_SUBSCRIBE, { boardId } satisfies BoardSubscribePayload)
    } else {
      socket.connect()
    }
  }

  function leaveBoard(): void {
    const socket = getRealtimeSocket()

    if (activeBoardId && socket.connected) {
      socket.emit(WS_EVENTS.BOARD_UNSUBSCRIBE, {
        boardId: activeBoardId,
      } satisfies BoardSubscribePayload)
      socket.disconnect()
    }

    activeBoardId = null
    presence.value = []
    members.value = []
  }

  function bindRealtimeHandlers(socket: Socket): void {
    if (realtimeBound) return
    realtimeBound = true

    // The server starts a fresh room subscription after every reconnect.
    socket.on('connect', () => {
      if (activeBoardId) {
        socket.emit(WS_EVENTS.BOARD_SUBSCRIBE, {
          boardId: activeBoardId,
        } satisfies BoardSubscribePayload)
      }
    })

    socket.on('disconnect', () => {
      presence.value = []
    })

    socket.on(WS_EVENTS.COLUMN_CREATED, (payload: ColumnCreatedPayload) => {
      const board = currentBoard.value
      if (!board || board.id !== payload.boardId) return
      if (board.columns.some((column) => column.id === payload.column.id)) return

      board.columns = sortColumns([...board.columns, { ...payload.column, cards: [] }])
      syncColumnsCount(board.id)
    })

    socket.on(WS_EVENTS.COLUMN_UPDATED, (payload: ColumnUpdatedPayload) => {
      const board = currentBoard.value
      if (!board || board.id !== payload.boardId) return

      board.columns = board.columns.map((column) =>
        column.id === payload.column.id ? { ...column, ...payload.column } : column,
      )
    })

    socket.on(WS_EVENTS.COLUMN_DELETED, (payload: ColumnDeletedPayload) => {
      const board = currentBoard.value
      if (!board || board.id !== payload.boardId) return

      board.columns = board.columns.filter((column) => column.id !== payload.columnId)
      syncColumnsCount(board.id)
    })

    socket.on(WS_EVENTS.CARD_CREATED, (payload: CardCreatedPayload) => {
      if (currentBoard.value?.id !== payload.boardId) return
      upsertCard(payload.card)
    })

    socket.on(WS_EVENTS.CARD_UPDATED, (payload: CardUpdatedPayload) => {
      if (currentBoard.value?.id !== payload.boardId) return
      upsertCard(payload.card)
    })

    socket.on(WS_EVENTS.CARD_MOVED, (payload: CardMovedPayload) => {
      if (currentBoard.value?.id !== payload.boardId) return
      upsertCard(payload.card)
    })

    socket.on(WS_EVENTS.CARD_DELETED, (payload: CardDeletedPayload) => {
      const board = currentBoard.value
      if (!board || board.id !== payload.boardId) return

      board.columns = board.columns.map((column) => ({
        ...column,
        cards: column.cards.filter((card) => card.id !== payload.cardId),
      }))
    })

    socket.on(WS_EVENTS.PRESENCE_UPDATED, (payload: PresenceUpdatedPayload) => {
      if (currentBoard.value?.id !== payload.boardId) return
      presence.value = payload.users
    })

    socket.on(WS_EVENTS.BOARD_MEMBER_UPDATED, (payload: BoardMemberUpdatedPayload) => {
      if (currentBoard.value?.id !== payload.boardId) return
      upsertMember(payload.member)
      applyOwnRole(payload.member)
    })

    socket.on(WS_EVENTS.BOARD_MEMBER_REMOVED, (payload: BoardMemberRemovedPayload) => {
      if (currentBoard.value?.id !== payload.boardId) return
      removeMemberLocally(payload.boardId, payload.userId)
    })
  }

  return {
    boards,
    currentBoard,
    presence,
    members,
    boardAccessRevoked,
    isLoading,
    isBoardLoading,
    error,
    boardError,
    fetchBoards,
    fetchBoard,
    reloadBoard,
    connectBoard,
    leaveBoard,
    createBoard,
    renameBoard,
    deleteBoard,
    fetchBoardShare,
    shareBoard,
    joinBoard,
    fetchMembers,
    updateMemberRole,
    removeMember,
    createColumn,
    renameColumn,
    deleteColumn,
    createCard,
    updateCard,
    deleteCard,
    moveCard,
  }
})
