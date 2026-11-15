<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { createBoardSchema, type BoardSummaryDto } from '@trello/shared'
import AppHeader from '@/components/AppHeader.vue'
import NameDialog from '@/components/NameDialog.vue'
import { getApiErrorMessage } from '@/lib/api-error'
import { pluralizeColumns } from '@/lib/plural'
import { useAuthStore } from '@/stores/auth'
import { useBoardsStore } from '@/stores/boards'

const auth = useAuthStore()
const boardsStore = useBoardsStore()
const router = useRouter()

const isCreateOpen = ref(false)
const createError = ref('')
const isCreating = ref(false)

const boardAccents = [
  'from-lime-300/20 via-lime-300/[0.04] to-transparent',
  'from-sky-400/20 via-sky-400/[0.04] to-transparent',
  'from-violet-400/20 via-violet-400/[0.04] to-transparent',
  'from-amber-300/20 via-amber-300/[0.04] to-transparent',
]

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
})

onMounted(() => {
  void boardsStore.fetchBoards()
})

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value))
}

function roleLabel(board: BoardSummaryDto): string {
  if (board.ownerId === auth.user?.id) return 'Владелец'
  return board.role === 'editor' ? 'Редактор' : 'Просмотр'
}

function openCreate(): void {
  createError.value = ''
  isCreateOpen.value = true
}

function closeCreate(): void {
  if (isCreating.value) return
  isCreateOpen.value = false
  createError.value = ''
}

async function createBoard(title: string): Promise<void> {
  const parsed = createBoardSchema.safeParse({ title })

  if (!parsed.success) {
    createError.value = parsed.error.issues[0]?.message ?? 'Проверьте название доски'
    return
  }

  isCreating.value = true
  createError.value = ''

  try {
    const board = await boardsStore.createBoard(parsed.data.title)
    isCreateOpen.value = false
    await router.push({ name: 'board', params: { id: board.id } })
  } catch (error) {
    createError.value = getApiErrorMessage(error)
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <div class="relative min-h-dvh overflow-hidden bg-slate-950 text-slate-100">
    <div class="auth-glow pointer-events-none absolute inset-0"></div>

    <AppHeader />

    <main class="relative mx-auto w-full max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
      <div class="mb-9 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="text-[10px] font-extrabold uppercase tracking-[0.2em] text-lime-300">
            Рабочее пространство
          </p>
          <h1 class="mt-2 text-3xl font-extrabold tracking-[-0.035em] text-white sm:text-[2.5rem]">
            Мои доски
          </h1>
          <p class="mt-2 text-sm text-slate-400">
            {{ auth.user?.name?.split(' ')[0] }}, здесь собраны ваши проекты и планы.
          </p>
        </div>

        <button
          type="button"
          class="flex w-fit items-center gap-2 rounded-xl bg-lime-300 px-4 py-3 text-[13px] font-extrabold text-slate-950 transition-colors hover:bg-lime-200 focus:outline-none focus:ring-4 focus:ring-lime-300/25"
          @click="openCreate"
        >
          <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" aria-hidden="true">
            <path
              d="M10 4v12M4 10h12"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
          Новая доска
        </button>
      </div>

      <div v-if="boardsStore.isLoading" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="index in 3"
          :key="index"
          class="h-[190px] animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.025]"
        ></div>
      </div>

      <div
        v-else-if="boardsStore.error"
        class="rounded-2xl border border-red-400/20 bg-red-400/[0.06] px-6 py-10 text-center"
      >
        <p class="text-sm font-bold text-red-100">Не удалось загрузить доски</p>
        <p class="mt-1.5 text-[12px] text-red-200/70">{{ boardsStore.error }}</p>
        <button
          type="button"
          class="mt-5 rounded-xl border border-white/10 px-4 py-2.5 text-[12px] font-bold text-slate-200 transition-colors hover:border-white/20 hover:text-white"
          @click="boardsStore.fetchBoards()"
        >
          Попробовать снова
        </button>
      </div>

      <div
        v-else-if="boardsStore.boards.length === 0"
        class="rounded-2xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-16 text-center"
      >
        <span
          class="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-lime-300/20 bg-lime-300/[0.07] text-lime-300"
        >
          <svg viewBox="0 0 24 24" class="h-6 w-6" fill="currentColor" aria-hidden="true">
            <rect x="4" y="4" width="6" height="16" rx="1.6" />
            <rect x="14" y="4" width="6" height="10" rx="1.6" opacity=".72" />
          </svg>
        </span>
        <h2 class="mt-5 text-xl font-extrabold tracking-tight text-white">Пока нет досок</h2>
        <p class="mx-auto mt-2 max-w-sm text-[13px] leading-6 text-slate-400">
          Создайте первую доску — колонки для работы уже будут внутри.
        </p>
        <button
          type="button"
          class="mt-6 rounded-xl bg-lime-300 px-4 py-3 text-[13px] font-extrabold text-slate-950 transition-colors hover:bg-lime-200"
          @click="openCreate"
        >
          Создать доску
        </button>
      </div>

      <div v-else class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <RouterLink
          v-for="(board, index) in boardsStore.boards"
          :key="board.id"
          :to="{ name: 'board', params: { id: board.id } }"
          class="group relative flex min-h-[190px] flex-col justify-between overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-900/55 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.16] hover:shadow-2xl hover:shadow-black/25 focus:outline-none focus:ring-4 focus:ring-lime-300/15"
        >
          <div
            class="pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80"
            :class="boardAccents[index % boardAccents.length]"
          ></div>

          <div class="relative flex items-start justify-between gap-3">
            <span
              class="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-slate-950/40 text-slate-300"
            >
              <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" aria-hidden="true">
                <rect
                  x="3"
                  y="3"
                  width="5.5"
                  height="14"
                  rx="1.2"
                  stroke="currentColor"
                  stroke-width="1.5"
                />
                <rect
                  x="11.5"
                  y="3"
                  width="5.5"
                  height="9"
                  rx="1.2"
                  stroke="currentColor"
                  stroke-width="1.5"
                  opacity=".55"
                />
              </svg>
            </span>
            <span
              class="rounded-full border border-white/[0.08] bg-slate-950/30 px-2.5 py-1 text-[10px] font-bold text-slate-400"
            >
              {{ board.columnsCount }} {{ pluralizeColumns(board.columnsCount) }}
            </span>
          </div>

          <div class="relative mt-8">
            <h2 class="truncate text-lg font-extrabold tracking-tight text-white">
              {{ board.title }}
            </h2>
            <p class="mt-1.5 flex items-center gap-2 text-[11px] font-semibold text-slate-500">
              <span>Обновлена {{ formatDate(board.updatedAt) }}</span>
              <span
                class="rounded-full border border-white/[0.08] bg-slate-950/30 px-2 py-0.5 text-[9px] font-bold text-slate-400"
              >
                {{ roleLabel(board) }}
              </span>
            </p>
          </div>
        </RouterLink>

        <button
          type="button"
          class="flex min-h-[190px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.015] text-slate-500 transition-colors hover:border-lime-300/30 hover:bg-lime-300/[0.03] hover:text-lime-300 focus:outline-none focus:ring-4 focus:ring-lime-300/10"
          @click="openCreate"
        >
          <span class="grid h-9 w-9 place-items-center rounded-full border border-white/15">
            <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" aria-hidden="true">
              <path
                d="M10 4v12M4 10h12"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          </span>
          <span class="text-[12px] font-bold">Создать доску</span>
        </button>
      </div>
    </main>

    <NameDialog
      :open="isCreateOpen"
      title="Новая доска"
      description="Внутри сразу появятся колонки «Бэклог», «В работе» и «Готово»."
      label="Название доски"
      placeholder="Например, Запуск продукта"
      submit-label="Создать доску"
      :error="createError"
      :loading="isCreating"
      @close="closeCreate"
      @submit="createBoard"
    />
  </div>
</template>
