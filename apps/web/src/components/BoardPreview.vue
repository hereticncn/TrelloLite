<script setup lang="ts">
const columns = [
  {
    title: 'Бэклог',
    accent: 'bg-slate-400',
    cards: [
      { title: 'Спроектировать схему БД', tag: 'backend', tone: 'bg-sky-400/15 text-sky-300' },
      { title: 'Роли и права доступа', tag: 'auth', tone: 'bg-violet-400/15 text-violet-300' },
    ],
  },
  {
    title: 'В работе',
    accent: 'bg-lime-300',
    cards: [
      { title: 'Оптимистичные блокировки', tag: 'core', tone: 'bg-lime-300/15 text-lime-300' },
      { title: 'Presence по WebSocket', tag: 'realtime', tone: 'bg-amber-300/15 text-amber-200' },
    ],
  },
  {
    title: 'Готово',
    accent: 'bg-emerald-400',
    cards: [
      { title: 'JWT + refresh rotation', tag: 'auth', tone: 'bg-emerald-400/15 text-emerald-300' },
      { title: 'Каркас монорепо', tag: 'setup', tone: 'bg-slate-400/15 text-slate-300' },
    ],
  },
]
</script>

<template>
  <div
    class="card-shine relative mt-11 max-w-[430px] rounded-2xl border border-white/10 p-3 shadow-2xl shadow-black/40 backdrop-blur-sm"
  >
    <div class="mb-2.5 flex items-center justify-between px-2 pt-1.5">
      <div class="flex items-center gap-2">
        <span class="h-1.5 w-1.5 rounded-full bg-lime-300"></span>
        <span class="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
          Product board
        </span>
      </div>
      <div class="flex -space-x-1.5">
        <span
          class="grid h-6 w-6 place-items-center rounded-full border border-slate-900 bg-sky-500 text-[9px] font-extrabold text-white"
        >
          АК
        </span>
        <span
          class="grid h-6 w-6 place-items-center rounded-full border border-slate-900 bg-violet-500 text-[9px] font-extrabold text-white"
        >
          МС
        </span>
        <span
          class="grid h-6 w-6 place-items-center rounded-full border border-slate-900 bg-slate-700 text-[9px] font-extrabold text-slate-300"
        >
          +3
        </span>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-2">
      <div
        v-for="column in columns"
        :key="column.title"
        class="rounded-xl border border-white/[0.06] bg-slate-950/45 p-2"
      >
        <div class="mb-2 flex items-center gap-1.5 px-1">
          <span class="h-1.5 w-1.5 rounded-full" :class="column.accent"></span>
          <span class="text-[10px] font-bold text-slate-300">{{ column.title }}</span>
        </div>
        <div class="space-y-1.5">
          <div
            v-for="card in column.cards"
            :key="card.title"
            class="rounded-lg border border-white/[0.07] bg-slate-900/90 p-2 shadow-sm"
          >
            <p class="text-[10px] font-semibold leading-snug text-slate-200">{{ card.title }}</p>
            <span
              class="mt-1.5 inline-block rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider"
              :class="card.tone"
            >
              {{ card.tag }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div
      class="absolute -right-3 -top-3 flex items-center gap-1.5 rounded-full border border-lime-300/25 bg-slate-900/95 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-lime-300 shadow-lg"
    >
      <span class="relative flex h-1.5 w-1.5">
        <span
          class="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-300 opacity-60"
        ></span>
        <span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-lime-300"></span>
      </span>
      live
    </div>
  </div>
</template>
