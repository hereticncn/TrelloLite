<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const isLoggingOut = ref(false)

const initials = computed(() => {
  const name = auth.user?.name?.trim()
  if (!name) return '?'

  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
})

const joinedAt = computed(() => {
  if (!auth.user) return ''

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(auth.user.createdAt))
})

const completed = [
  'Регистрация и вход',
  'Argon2id-хеширование паролей',
  'Access + refresh JWT',
  'Ротация refresh-токенов',
  'HttpOnly cookie и защита от replay',
]

const upcoming = [
  { step: '02', title: 'Доски и колонки', text: 'CRUD досок, participant-роли, шаринг' },
  { step: '03', title: 'Карточки и /move', text: 'Транзакции, порядок, optimistic locking' },
  { step: '04', title: 'Realtime', text: 'Socket.IO, комнаты, presence' },
]

async function logout(): Promise<void> {
  isLoggingOut.value = true
  try {
    await auth.logout()
  } catch {
    // The session is cleared locally regardless of the API response.
  } finally {
    isLoggingOut.value = false
    await router.replace({ name: 'login' })
  }
}
</script>

<template>
  <div class="relative min-h-dvh overflow-hidden bg-slate-950 text-slate-100">
    <div class="auth-glow pointer-events-none absolute inset-0"></div>

    <header class="relative border-b border-white/[0.07] bg-slate-950/70 backdrop-blur-xl">
      <div class="mx-auto flex h-[72px] w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <RouterLink to="/" class="flex items-center gap-2.5">
          <span class="grid h-8 w-8 place-items-center rounded-[10px] bg-lime-300 text-slate-950">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor" aria-hidden="true">
              <rect x="4" y="4" width="6" height="16" rx="1.6" />
              <rect x="14" y="4" width="6" height="10" rx="1.6" opacity=".72" />
            </svg>
          </span>
          <span class="text-[15px] font-extrabold tracking-tight">
            trello<span class="text-lime-300">lite</span>
          </span>
        </RouterLink>

        <div class="flex items-center gap-3">
          <div class="hidden items-center gap-2.5 sm:flex">
            <span
              class="grid h-8 w-8 place-items-center rounded-full bg-slate-800 text-[11px] font-extrabold text-slate-200 ring-1 ring-white/10"
            >
              {{ initials }}
            </span>
            <div class="leading-tight">
              <p class="text-[12px] font-bold text-slate-200">{{ auth.user?.name }}</p>
              <p class="text-[10px] text-slate-500">{{ auth.user?.email }}</p>
            </div>
          </div>

          <button
            type="button"
            :disabled="isLoggingOut"
            class="rounded-lg border border-white/10 px-3 py-2 text-[11px] font-bold text-slate-400 transition-colors hover:border-white/20 hover:text-white disabled:opacity-50"
            @click="logout"
          >
            {{ isLoggingOut ? 'Выходим…' : 'Выйти' }}
          </button>
        </div>
      </div>
    </header>

    <main class="relative mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <div class="mb-10">
        <div
          class="mb-4 inline-flex items-center gap-2 rounded-full border border-lime-300/20 bg-lime-300/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-lime-300"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-lime-300"></span>
          Этап 1 · Авторизация
        </div>
        <h1 class="text-3xl font-extrabold tracking-[-0.035em] text-white sm:text-[2.5rem]">
          Привет, {{ auth.user?.name?.split(' ')[0] }} 👋
        </h1>
        <p class="mt-2 text-sm text-slate-400">
          Аккаунт готов к работе. Следующий шаг — доски, колонки и карточки.
        </p>
      </div>

      <div class="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <section
          class="card-shine relative overflow-hidden rounded-2xl border border-white/10 p-6 sm:p-8"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                Состояние системы
              </p>
              <h2 class="mt-2 text-xl font-extrabold tracking-tight text-white">
                Авторизация работает
              </h2>
            </div>
            <span
              class="flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-emerald-300"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
              online
            </span>
          </div>

          <ul class="mt-6 grid gap-2.5 sm:grid-cols-2">
            <li
              v-for="item in completed"
              :key="item"
              class="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3.5 py-3 text-[12px] font-semibold text-slate-300"
            >
              <span
                class="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-lime-300/15 text-lime-300"
              >
                <svg viewBox="0 0 16 16" class="h-3 w-3" fill="none" aria-hidden="true">
                  <path
                    d="m3.5 8.5 3 3 6-7"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </span>
              {{ item }}
            </li>
          </ul>
        </section>

        <aside class="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
          <div class="flex items-center gap-3.5">
            <span
              class="grid h-12 w-12 place-items-center rounded-full bg-slate-800 text-sm font-extrabold text-lime-300 ring-1 ring-white/10"
            >
              {{ initials }}
            </span>
            <div class="min-w-0">
              <p class="truncate text-sm font-extrabold text-white">{{ auth.user?.name }}</p>
              <p class="truncate text-[11px] text-slate-500">{{ auth.user?.email }}</p>
            </div>
          </div>

          <dl class="mt-6 space-y-4 border-t border-white/[0.07] pt-5">
            <div>
              <dt class="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">
                Аккаунт создан
              </dt>
              <dd class="mt-1 text-[12px] font-semibold text-slate-300">{{ joinedAt }}</dd>
            </div>
            <div>
              <dt class="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">
                ID пользователя
              </dt>
              <dd class="mt-1 break-all font-mono text-[10px] leading-4 text-slate-500">
                {{ auth.user?.id }}
              </dd>
            </div>
            <div>
              <dt class="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">
                Сессия
              </dt>
              <dd class="mt-1 flex items-center gap-1.5 text-[12px] font-semibold text-slate-300">
                <span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                Refresh-cookie активна
              </dd>
            </div>
          </dl>
        </aside>
      </div>

      <section class="mt-10">
        <div class="mb-4 flex items-baseline justify-between">
          <h2 class="text-sm font-extrabold tracking-tight text-slate-200">Дальше по плану</h2>
          <span class="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">
            roadmap
          </span>
        </div>
        <div class="grid gap-3 sm:grid-cols-3">
          <article
            v-for="item in upcoming"
            :key="item.step"
            class="group rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 transition-colors hover:border-white/[0.14] hover:bg-white/[0.035]"
          >
            <div class="flex items-center justify-between">
              <span class="font-mono text-[10px] font-bold text-slate-600">{{ item.step }}</span>
              <span
                class="rounded-full border border-white/[0.07] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-600"
              >
                soon
              </span>
            </div>
            <h3 class="mt-4 text-sm font-extrabold text-slate-200">{{ item.title }}</h3>
            <p class="mt-1.5 text-[11px] leading-5 text-slate-500">{{ item.text }}</p>
          </article>
        </div>
      </section>
    </main>
  </div>
</template>
