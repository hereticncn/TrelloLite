<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { VueDraggable, type SortableEvent } from 'vue-draggable-plus'
import {
  createCardSchema,
  createColumnSchema,
  updateBoardSchema,
  updateCardSchema,
  updateColumnSchema,
  type CardDto,
  type ColumnDto,
} from '@trello/shared'
import AppHeader from '@/components/AppHeader.vue'
import CardDialog from '@/components/CardDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import NameDialog from '@/components/NameDialog.vue'
import ShareDialog from '@/components/ShareDialog.vue'
import { getApiErrorMessage } from '@/lib/api-error'
import { pluralizeCards, pluralizeColumns } from '@/lib/plural'
import { useAuthStore } from '@/stores/auth'
import { useBoardsStore } from '@/stores/boards'

type DialogKind =
  | 'rename-board'
  | 'add-column'
  | 'rename-column'
  | 'delete-board'
  | 'delete-column'
  | 'create-card'
  | 'edit-card'
  | 'delete-card'
  | null

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const boards = useBoardsStore()

const activeDialog = ref<DialogKind>(null)
const isShareOpen = ref(false)
const targetColumn = ref<ColumnDto | null>(null)
const targetCard = ref<CardDto | null>(null)
const formValue = ref('')
const formDescription = ref('')
const dialogError = ref('')
const isSubmitting = ref(false)
const dragError = ref('')
const movingCardId = ref<string | null>(null)

let suppressCardClick = false

const boardId = computed(() => String(route.params.id ?? ''))
const board = computed(() => boards.currentBoard)
const columns = computed(() => board.value?.columns ?? [])
const isOwner = computed(() => Boolean(board.value && board.value.ownerId === auth.user?.id))
const boardRoleLabel = computed(() => {
  if (!board.value) return ''
  if (isOwner.value) return 'Владелец'
  return board.value.role === 'editor' ? 'Редактор' : 'Просмотр'
})

onMounted(() => {
  void loadBoard()
})

onBeforeUnmount(() => {
  boards.leaveBoard()
})

watch(
  () => route.params.id,
  () => {
    if (route.name === 'board') {
      void loadBoard()
    }
  },
)

async function loadBoard(): Promise<void> {
  if (!boardId.value) {
    await router.replace({ name: 'dashboard' })
    return
  }

  await boards.fetchBoard(boardId.value)

  if (boards.currentBoard?.id === boardId.value) {
    boards.connectBoard(boardId.value)
  }
}

function openRenameBoard(): void {
  if (!board.value) return

  formValue.value = board.value.title
  dialogError.value = ''
  activeDialog.value = 'rename-board'
}

function openAddColumn(): void {
  formValue.value = ''
  dialogError.value = ''
  targetColumn.value = null
  activeDialog.value = 'add-column'
}

function openRenameColumn(column: ColumnDto): void {
  formValue.value = column.title
  dialogError.value = ''
  targetColumn.value = column
  activeDialog.value = 'rename-column'
}

function openDeleteBoard(): void {
  dialogError.value = ''
  activeDialog.value = 'delete-board'
}

function openDeleteColumn(column: ColumnDto): void {
  dialogError.value = ''
  targetColumn.value = column
  activeDialog.value = 'delete-column'
}

function openCreateCard(column: ColumnDto): void {
  formValue.value = ''
  formDescription.value = ''
  dialogError.value = ''
  targetColumn.value = column
  targetCard.value = null
  activeDialog.value = 'create-card'
}

function openEditCard(card: CardDto): void {
  if (suppressCardClick) return

  formValue.value = card.title
  formDescription.value = card.description
  dialogError.value = ''
  targetCard.value = card
  activeDialog.value = 'edit-card'
}

function openDeleteCard(card: CardDto): void {
  if (suppressCardClick) return

  dialogError.value = ''
  targetCard.value = card
  activeDialog.value = 'delete-card'
}

/**
 * The v-model of every column is updated by vue-draggable-plus before `end`,
 * so the dropped card already sits at its final index here. We only need to
 * derive its neighbours, call the transactional /move and roll back on 409.
 */
async function onCardDragEnd(event: SortableEvent): Promise<void> {
  const moved = event.from !== event.to || event.oldIndex !== event.newIndex
  if (!moved) return

  // Native click fires right after mouseup; ignore it for real drags only.
  suppressCardClick = true
  window.setTimeout(() => {
    suppressCardClick = false
  }, 150)

  const cardId = event.item.dataset.cardId
  const toColumnId = event.to.dataset.columnId
  const current = board.value
  if (!cardId || !toColumnId || !current) return

  const targetColumn = current.columns.find((column) => column.id === toColumnId)
  if (!targetColumn) return

  const index = targetColumn.cards.findIndex((card) => card.id === cardId)
  const card = targetColumn.cards[index]
  if (!card) return

  const beforeCardId = targetColumn.cards[index - 1]?.id ?? null
  const afterCardId = targetColumn.cards[index + 1]?.id ?? null

  dragError.value = ''
  movingCardId.value = card.id

  try {
    await boards.moveCard(card.id, {
      toColumnId,
      beforeCardId,
      afterCardId,
      expectedVersion: card.version,
    })
  } catch (error) {
    dragError.value = getApiErrorMessage(error)

    try {
      await boards.reloadBoard(boardId.value)
    } catch {
      // Keep the optimistic order visible; the next board load will resync it.
    }
  } finally {
    movingCardId.value = null
  }
}

function closeDialog(): void {
  if (isSubmitting.value) return

  activeDialog.value = null
  targetColumn.value = null
  targetCard.value = null
  formDescription.value = ''
  dialogError.value = ''
}

async function submitName(title: string): Promise<void> {
  if (activeDialog.value === 'rename-board') {
    const parsed = updateBoardSchema.safeParse({ title })
    if (!parsed.success) {
      dialogError.value = parsed.error.issues[0]?.message ?? 'Проверьте название'
      return
    }

    await runDialogAction(() => boards.renameBoard(boardId.value, parsed.data.title))
    return
  }

  if (activeDialog.value === 'add-column') {
    const parsed = createColumnSchema.safeParse({ title })
    if (!parsed.success) {
      dialogError.value = parsed.error.issues[0]?.message ?? 'Проверьте название'
      return
    }

    await runDialogAction(async () => {
      await boards.createColumn(boardId.value, parsed.data.title)
    })
    return
  }

  if (activeDialog.value === 'rename-column' && targetColumn.value) {
    const parsed = updateColumnSchema.safeParse({ title })
    if (!parsed.success) {
      dialogError.value = parsed.error.issues[0]?.message ?? 'Проверьте название'
      return
    }

    const columnId = targetColumn.value.id
    await runDialogAction(() => boards.renameColumn(columnId, parsed.data.title))
  }
}

async function submitCard(payload: { title: string; description: string }): Promise<void> {
  if (activeDialog.value === 'create-card') {
    const parsed = createCardSchema.safeParse(payload)
    if (!parsed.success) {
      dialogError.value = parsed.error.issues[0]?.message ?? 'Проверьте карточку'
      return
    }

    const columnId = targetColumn.value?.id
    if (!columnId) return

    await runDialogAction(async () => {
      await boards.createCard(columnId, parsed.data)
    })
    return
  }

  if (activeDialog.value === 'edit-card' && targetCard.value) {
    const parsed = updateCardSchema.safeParse({
      ...payload,
      expectedVersion: targetCard.value.version,
    })
    if (!parsed.success) {
      dialogError.value = parsed.error.issues[0]?.message ?? 'Проверьте карточку'
      return
    }

    const cardId = targetCard.value.id
    await runDialogAction(async () => {
      await boards.updateCard(cardId, parsed.data)
    })
  }
}

async function confirmDelete(): Promise<void> {
  if (activeDialog.value === 'delete-board') {
    await runDialogAction(async () => {
      await boards.deleteBoard(boardId.value)
      await router.replace({ name: 'dashboard' })
    })
    return
  }

  if (activeDialog.value === 'delete-column' && targetColumn.value) {
    const columnId = targetColumn.value.id
    await runDialogAction(() => boards.deleteColumn(columnId))
    return
  }

  if (activeDialog.value === 'delete-card' && targetCard.value) {
    const cardId = targetCard.value.id
    await runDialogAction(() => boards.deleteCard(cardId))
  }
}

async function runDialogAction(action: () => Promise<void>): Promise<void> {
  isSubmitting.value = true
  dialogError.value = ''

  try {
    await action()
    activeDialog.value = null
    targetColumn.value = null
    targetCard.value = null
  } catch (error) {
    dialogError.value = getApiErrorMessage(error)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="relative min-h-dvh overflow-hidden bg-slate-950 text-slate-100">
    <div class="auth-glow pointer-events-none absolute inset-0"></div>

    <AppHeader />

    <main class="relative mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <RouterLink
        to="/"
        class="inline-flex items-center gap-2 text-[12px] font-bold text-slate-500 transition-colors hover:text-slate-200"
      >
        <svg viewBox="0 0 20 20" class="h-3.5 w-3.5" fill="none" aria-hidden="true">
          <path
            d="m11.5 5-5 5 5 5"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        Все доски
      </RouterLink>

      <div v-if="boards.isBoardLoading" class="mt-7 animate-pulse">
        <div class="h-9 w-64 rounded-xl bg-white/[0.06]"></div>
        <div class="mt-3 h-4 w-40 rounded-lg bg-white/[0.035]"></div>
        <div class="mt-9 flex gap-4">
          <div
            v-for="index in 3"
            :key="index"
            class="h-[250px] w-[290px] shrink-0 rounded-2xl border border-white/[0.06] bg-white/[0.025]"
          ></div>
        </div>
      </div>

      <div
        v-else-if="boards.boardError || !board"
        class="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-14 text-center"
      >
        <span
          class="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-400"
        >
          <svg viewBox="0 0 20 20" class="h-5 w-5" fill="none" aria-hidden="true">
            <path
              d="M3.5 5.5h13M5 5.5v11h10v-11M8 8.5v5M12 8.5v5"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </span>
        <h1 class="mt-5 text-xl font-extrabold tracking-tight text-white">Доска не найдена</h1>
        <p class="mt-2 text-[12px] text-slate-500">
          {{ boards.boardError || 'Возможно, она была удалена или у вас нет доступа.' }}
        </p>
        <RouterLink
          to="/"
          class="mt-6 inline-flex rounded-xl border border-white/10 px-4 py-2.5 text-[12px] font-bold text-slate-200 transition-colors hover:border-white/20 hover:text-white"
        >
          Вернуться к доскам
        </RouterLink>
      </div>

      <template v-else>
        <div class="mt-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2.5">
              <h1
                class="truncate text-3xl font-extrabold tracking-[-0.035em] text-white sm:text-[2.4rem]"
              >
                {{ board.title }}
              </h1>
              <span
                class="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-bold text-slate-400"
              >
                {{ boardRoleLabel }}
              </span>
            </div>
            <p class="mt-2 flex items-center gap-3 text-[12px] font-semibold text-slate-500">
              <span>{{ columns.length }} {{ pluralizeColumns(columns.length) }}</span>
              <span
                v-if="boards.presence.length > 0"
                class="inline-flex items-center gap-1.5 text-lime-300/80"
                :title="boards.presence.map((user) => user.name).join(', ')"
              >
                <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-lime-300"></span>
                {{ boards.presence.length }} онлайн
              </span>
            </p>
          </div>

          <div v-if="board.role === 'editor'" class="flex items-center gap-2">
            <button
              v-if="isOwner"
              type="button"
              class="inline-flex items-center gap-2 rounded-xl border border-lime-300/30 bg-lime-300/[0.06] px-3.5 py-2.5 text-[12px] font-extrabold text-lime-200 transition-colors hover:bg-lime-300/[0.12]"
              @click="isShareOpen = true"
            >
              <svg viewBox="0 0 20 20" class="h-3.5 w-3.5" fill="none" aria-hidden="true">
                <path
                  d="M7.6 11.2 12.4 8.8M7.6 8.8l4.8 2.4M6.2 7.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2Zm7.6-2.6a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2Zm0 5.6a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2Z"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              Поделиться
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3.5 py-2.5 text-[12px] font-bold text-slate-300 transition-colors hover:border-white/20 hover:text-white"
              @click="openRenameBoard"
            >
              <svg viewBox="0 0 20 20" class="h-3.5 w-3.5" fill="none" aria-hidden="true">
                <path
                  d="m12.8 3.7 3.5 3.5-8.4 8.4-4.2.7.7-4.2 8.4-8.4Z"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linejoin="round"
                />
              </svg>
              Переименовать
            </button>
            <button
              v-if="isOwner"
              type="button"
              class="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-slate-500 transition-colors hover:border-red-400/30 hover:bg-red-400/[0.06] hover:text-red-300"
              title="Удалить доску"
              aria-label="Удалить доску"
              @click="openDeleteBoard"
            >
              <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" aria-hidden="true">
                <path
                  d="M3.5 5.5h13M8 3.5h4M5 5.5l.7 10h8.6l.7-10M8.3 8.5v4.3M11.7 8.5v4.3"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <div class="-mx-5 mt-8 overflow-x-auto px-5 pb-4 sm:-mx-8 sm:px-8">
          <div class="flex min-w-max items-start gap-4">
            <section
              v-for="column in columns"
              :key="column.id"
              class="w-[290px] shrink-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-900/55"
            >
              <div
                class="flex items-start justify-between gap-2 border-b border-white/[0.06] px-4 py-3.5"
              >
                <div class="min-w-0">
                  <h2 class="truncate text-[13px] font-extrabold text-slate-200">
                    {{ column.title }}
                  </h2>
                  <p class="mt-0.5 text-[10px] font-semibold text-slate-600">
                    {{ column.cards.length }} {{ pluralizeCards(column.cards.length) }}
                  </p>
                </div>

                <div v-if="board.role === 'editor'" class="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    class="grid h-7 w-7 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
                    title="Переименовать колонку"
                    aria-label="Переименовать колонку"
                    @click="openRenameColumn(column)"
                  >
                    <svg viewBox="0 0 20 20" class="h-3.5 w-3.5" fill="none" aria-hidden="true">
                      <path
                        d="m12.8 3.7 3.5 3.5-8.4 8.4-4.2.7.7-4.2 8.4-8.4Z"
                        stroke="currentColor"
                        stroke-width="1.4"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="grid h-7 w-7 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-red-400/[0.08] hover:text-red-300"
                    title="Удалить колонку"
                    aria-label="Удалить колонку"
                    @click="openDeleteColumn(column)"
                  >
                    <svg viewBox="0 0 20 20" class="h-3.5 w-3.5" fill="none" aria-hidden="true">
                      <path
                        d="M4 5.5h12M8 3.5h4M5.5 5.5l.6 9h7.8l.6-9M8.3 8.5v3.7M11.7 8.5v3.7"
                        stroke="currentColor"
                        stroke-width="1.3"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <div class="relative p-3">
                <div
                  v-if="column.cards.length === 0"
                  class="pointer-events-none absolute inset-x-3 top-3 grid h-16 place-items-center rounded-xl border border-dashed border-white/[0.07] bg-slate-950/20"
                >
                  <p class="text-[11px] font-semibold text-slate-600">
                    {{ board.role === 'editor' ? 'Перетащите карточку сюда' : 'Карточек пока нет' }}
                  </p>
                </div>

                <VueDraggable
                  v-model="column.cards"
                  :group="{ name: 'cards' }"
                  :disabled="board.role !== 'editor' || movingCardId !== null"
                  :animation="160"
                  :force-fallback="true"
                  :fallback-on-body="true"
                  :fallback-tolerance="4"
                  ghost-class="opacity-30"
                  chosen-class="card-chosen"
                  :class="['space-y-2', { 'min-h-16': column.cards.length === 0 }]"
                  :data-column-id="column.id"
                  @end="onCardDragEnd"
                >
                  <article
                    v-for="card in column.cards"
                    :key="card.id"
                    :data-card-id="card.id"
                    :title="
                      board.role === 'editor' ? 'Перетащите, чтобы изменить порядок' : undefined
                    "
                    class="group rounded-xl border border-white/[0.07] bg-slate-950/40 px-3 py-2.5 transition-colors hover:border-white/[0.12]"
                    :class="[
                      board.role === 'editor' ? 'cursor-grab active:cursor-grabbing' : '',
                      movingCardId === card.id ? 'pointer-events-none opacity-60' : '',
                    ]"
                  >
                    <div class="flex items-start justify-between gap-1.5">
                      <button
                        v-if="board.role === 'editor'"
                        type="button"
                        class="min-w-0 flex-1 text-left"
                        @click="openEditCard(card)"
                      >
                        <h3 class="break-words text-[12px] font-bold leading-5 text-slate-200">
                          {{ card.title }}
                        </h3>
                      </button>
                      <h3
                        v-else
                        class="min-w-0 flex-1 break-words text-[12px] font-bold leading-5 text-slate-200"
                      >
                        {{ card.title }}
                      </h3>

                      <div
                        v-if="board.role === 'editor'"
                        class="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                      >
                        <button
                          type="button"
                          class="grid h-6 w-6 place-items-center rounded-md text-slate-600 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
                          title="Редактировать карточку"
                          aria-label="Редактировать карточку"
                          @click="openEditCard(card)"
                        >
                          <svg viewBox="0 0 20 20" class="h-3 w-3" fill="none" aria-hidden="true">
                            <path
                              d="m12.8 3.7 3.5 3.5-8.4 8.4-4.2.7.7-4.2 8.4-8.4Z"
                              stroke="currentColor"
                              stroke-width="1.4"
                              stroke-linejoin="round"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          class="grid h-6 w-6 place-items-center rounded-md text-slate-600 transition-colors hover:bg-red-400/[0.08] hover:text-red-300"
                          title="Удалить карточку"
                          aria-label="Удалить карточку"
                          @click="openDeleteCard(card)"
                        >
                          <svg viewBox="0 0 20 20" class="h-3 w-3" fill="none" aria-hidden="true">
                            <path
                              d="M4 5.5h12M8 3.5h4M5.5 5.5l.6 9h7.8l.6-9M8.3 8.5v3.7M11.7 8.5v3.7"
                              stroke="currentColor"
                              stroke-width="1.3"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <p
                      v-if="card.description"
                      class="mt-1.5 line-clamp-4 whitespace-pre-line break-words text-[11px] leading-5 text-slate-500"
                    >
                      {{ card.description }}
                    </p>
                  </article>
                </VueDraggable>

                <button
                  v-if="board.role === 'editor'"
                  type="button"
                  class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/[0.08] px-3 py-2 text-[11px] font-bold text-slate-500 transition-colors hover:border-lime-300/30 hover:bg-lime-300/[0.03] hover:text-lime-300"
                  @click="openCreateCard(column)"
                >
                  <svg viewBox="0 0 20 20" class="h-3.5 w-3.5" fill="none" aria-hidden="true">
                    <path
                      d="M10 4v12M4 10h12"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                    />
                  </svg>
                  Добавить карточку
                </button>
              </div>
            </section>

            <button
              v-if="board.role === 'editor'"
              type="button"
              class="flex w-[290px] shrink-0 items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.015] px-4 py-5 text-[12px] font-bold text-slate-500 transition-colors hover:border-lime-300/30 hover:bg-lime-300/[0.03] hover:text-lime-300"
              @click="openAddColumn"
            >
              <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" aria-hidden="true">
                <path
                  d="M10 4v12M4 10h12"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
              Добавить колонку
            </button>
          </div>
        </div>
      </template>
    </main>

    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-2 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="dragError"
        role="alert"
        aria-live="polite"
        class="fixed inset-x-4 bottom-5 z-40 mx-auto flex max-w-md items-start gap-3 rounded-xl border border-red-400/20 bg-slate-900/95 px-4 py-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur sm:inset-x-auto sm:right-6 sm:mx-0"
      >
        <p class="flex-1 text-[12px] leading-5 text-red-200">{{ dragError }}</p>
        <button
          type="button"
          class="grid h-5 w-5 shrink-0 place-items-center rounded-md text-red-300/60 transition-colors hover:bg-white/[0.06] hover:text-red-200"
          aria-label="Закрыть сообщение"
          @click="dragError = ''"
        >
          <svg viewBox="0 0 20 20" class="h-3 w-3" fill="none" aria-hidden="true">
            <path
              d="m5.5 5.5 9 9m0-9-9 9"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>
    </Transition>

    <NameDialog
      :open="activeDialog === 'rename-board'"
      title="Переименовать доску"
      description="Новое название увидят все участники доски."
      label="Название доски"
      submit-label="Сохранить"
      :initial-value="formValue"
      :error="dialogError"
      :loading="isSubmitting"
      @close="closeDialog"
      @submit="submitName"
    />

    <NameDialog
      :open="activeDialog === 'add-column'"
      title="Новая колонка"
      description="Колонка появится в конце доски."
      label="Название колонки"
      placeholder="Например, В работе"
      submit-label="Добавить колонку"
      :initial-value="formValue"
      :error="dialogError"
      :loading="isSubmitting"
      @close="closeDialog"
      @submit="submitName"
    />

    <NameDialog
      :open="activeDialog === 'rename-column'"
      title="Переименовать колонку"
      label="Название колонки"
      submit-label="Сохранить"
      :initial-value="formValue"
      :error="dialogError"
      :loading="isSubmitting"
      @close="closeDialog"
      @submit="submitName"
    />

    <CardDialog
      :open="activeDialog === 'create-card'"
      title="Новая карточка"
      :description="`Карточка появится в колонке «${targetColumn?.title ?? ''}».`"
      submit-label="Добавить карточку"
      :initial-title="formValue"
      :initial-description="formDescription"
      :error="dialogError"
      :loading="isSubmitting"
      @close="closeDialog"
      @submit="submitCard"
    />

    <CardDialog
      :open="activeDialog === 'edit-card'"
      title="Редактировать карточку"
      description="Изменения сразу увидят все участники доски."
      submit-label="Сохранить"
      :initial-title="formValue"
      :initial-description="formDescription"
      :error="dialogError"
      :loading="isSubmitting"
      @close="closeDialog"
      @submit="submitCard"
    />

    <ConfirmDialog
      :open="activeDialog === 'delete-board'"
      title="Удалить доску?"
      message="Доска, все её колонки и карточки будут удалены безвозвратно."
      confirm-label="Удалить доску"
      :error="dialogError"
      :loading="isSubmitting"
      @close="closeDialog"
      @confirm="confirmDelete"
    />

    <ConfirmDialog
      :open="activeDialog === 'delete-column'"
      title="Удалить колонку?"
      :message="`Колонка «${targetColumn?.title ?? ''}» и все её карточки будут удалены безвозвратно.`"
      confirm-label="Удалить колонку"
      :error="dialogError"
      :loading="isSubmitting"
      @close="closeDialog"
      @confirm="confirmDelete"
    />

    <ConfirmDialog
      :open="activeDialog === 'delete-card'"
      title="Удалить карточку?"
      :message="`Карточка «${targetCard?.title ?? ''}» будет удалена безвозвратно.`"
      confirm-label="Удалить карточку"
      :error="dialogError"
      :loading="isSubmitting"
      @close="closeDialog"
      @confirm="confirmDelete"
    />

    <ShareDialog
      :open="isShareOpen"
      :board-id="boardId"
      @close="isShareOpen = false"
    />
  </div>
</template>

<style>
.card-chosen {
  box-shadow: 0 0 0 1px rgb(190 242 100 / 0.4);
}
</style>
