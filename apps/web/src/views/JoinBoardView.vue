<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { JoinBoardResultDto } from '@trello/shared'
import AppHeader from '@/components/AppHeader.vue'
import { getApiErrorMessage } from '@/lib/api-error'
import { useBoardsStore } from '@/stores/boards'

const route = useRoute()
const router = useRouter()
const boards = useBoardsStore()

const result = ref<JoinBoardResultDto | null>(null)
const error = ref('')
const isLoading = ref(true)

const token = computed(() => String(route.params.token ?? ''))
const roleLabel = computed(() =>
  result.value?.role === 'editor' ? 'Редактор' : 'Просмотр',
)

onMounted(async () => {
  try {
    result.value = await boards.joinBoard(token.value)
  } catch (err) {
    error.value = getApiErrorMessage(err)
  } finally {
    isLoading.value = false
  }
})

function openBoard(): void {
  if (!result.value) return
  void router.push({ name: 'board', params: { id: result.value.boardId } })
}
</script>

<template>
  <div class="relative min-h-dvh overflow-hidden bg-slate-950 text-slate-100">
    <div class="auth-glow pointer-events-none absolute inset-0"></div>

    <AppHeader />

    <main class="relative mx-auto flex w-full max-w-lg flex-col justify-center px-5 py-16 sm:py-24">
      <div
        v-if="isLoading"
        class="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-16 text-center"
      >
        <span
          class="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-lime-300/20 bg-lime-300/[0.07] text-lime-300"
        >
          <svg class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-90"
              fill="currentColor"
              d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647Z"
            />
          </svg>
        </span>
        <h1 class="mt-5 text-xl font-extrabold tracking-tight text-white">Открываем доску…</h1>
        <p class="mt-2 text-[12px] text-slate-500">Проверяем ссылку и добавляем вас в участники.</p>
      </div>

      <div
        v-else-if="result"
        class="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-12 text-center"
      >
        <span
          class="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-lime-300/25 bg-lime-300/[0.08] text-lime-300"
        >
          <svg viewBox="0 0 24 24" class="h-6 w-6" fill="currentColor" aria-hidden="true">
            <rect x="4" y="4" width="6" height="16" rx="1.6" />
            <rect x="14" y="4" width="6" height="10" rx="1.6" opacity=".72" />
          </svg>
        </span>
        <p class="mt-5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-lime-300">
          Вы в команде
        </p>
        <h1 class="mt-2 text-2xl font-extrabold tracking-[-0.03em] text-white">
          {{ result.title }}
        </h1>
        <p class="mx-auto mt-2 max-w-sm text-[13px] leading-6 text-slate-400">
          Доска добавлена в ваш список. Ваша роль — <span class="font-bold text-slate-200">{{
            roleLabel
          }}</span
          >.
        </p>
        <button
          type="button"
          class="mt-7 rounded-xl bg-lime-300 px-5 py-3 text-[13px] font-extrabold text-slate-950 transition-colors hover:bg-lime-200 focus:outline-none focus:ring-4 focus:ring-lime-300/25"
          @click="openBoard"
        >
          Открыть доску
        </button>
      </div>

      <div
        v-else
        class="rounded-2xl border border-red-400/20 bg-red-400/[0.05] px-6 py-12 text-center"
      >
        <span
          class="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-red-400/20 bg-red-400/[0.08] text-red-300"
        >
          <svg viewBox="0 0 20 20" class="h-5 w-5" fill="none" aria-hidden="true">
            <path
              d="M10 6.5v4M10 13.5h.01M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            />
          </svg>
        </span>
        <h1 class="mt-5 text-xl font-extrabold tracking-tight text-white">
          Не удалось присоединиться
        </h1>
        <p class="mt-2 text-[12px] leading-5 text-slate-500">
          {{ error || 'Ссылка недействительна или устарела.' }}
        </p>
        <RouterLink
          to="/"
          class="mt-6 inline-flex rounded-xl border border-white/10 px-4 py-2.5 text-[12px] font-bold text-slate-200 transition-colors hover:border-white/20 hover:text-white"
        >
          Вернуться к доскам
        </RouterLink>
      </div>
    </main>
  </div>
</template>
