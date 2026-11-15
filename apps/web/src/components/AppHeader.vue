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

async function logout(): Promise<void> {
  isLoggingOut.value = true

  try {
    await auth.logout()
  } catch {
    // The local session is cleared even if the API request fails.
  } finally {
    isLoggingOut.value = false
    await router.replace({ name: 'login' })
  }
}
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-white/[0.07] bg-slate-950/80 backdrop-blur-xl">
    <div class="mx-auto flex h-[68px] w-full max-w-7xl items-center justify-between px-5 sm:px-8">
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
</template>
