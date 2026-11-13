<script setup lang="ts">
import { RouterLink } from 'vue-router'
import BoardPreview from './BoardPreview.vue'
</script>

<template>
  <div class="relative min-h-dvh overflow-hidden bg-slate-950 text-slate-100">
    <div class="auth-glow pointer-events-none absolute inset-0"></div>

    <div class="relative mx-auto grid min-h-dvh w-full max-w-[1480px] lg:grid-cols-[1.08fr_0.92fr]">
      <section
        class="relative hidden flex-col justify-between overflow-hidden border-r border-white/[0.06] px-12 py-10 lg:flex xl:px-16"
      >
        <div class="brand-grid pointer-events-none absolute inset-0 opacity-70"></div>
        <div
          class="pointer-events-none absolute -left-24 top-16 h-80 w-80 rounded-full bg-lime-300/[0.08] blur-[100px]"
        ></div>

        <RouterLink to="/" class="relative flex w-fit items-center gap-3">
          <span class="grid h-9 w-9 place-items-center rounded-[11px] bg-lime-300 text-slate-950">
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor" aria-hidden="true">
              <rect x="4" y="4" width="6" height="16" rx="1.6" />
              <rect x="14" y="4" width="6" height="10" rx="1.6" opacity=".72" />
            </svg>
          </span>
          <span class="text-[17px] font-extrabold tracking-tight">
            trello<span class="text-lime-300">lite</span>
          </span>
        </RouterLink>

        <div class="relative max-w-[520px]">
          <div
            class="mb-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-lime-300"></span>
            Realtime kanban
          </div>

          <h1
            class="text-[clamp(2.7rem,4.1vw,4.4rem)] font-extrabold leading-[0.97] tracking-[-0.045em]"
          >
            Задачи движутся.<br />
            <span class="text-lime-300">Команда видит</span><br />
            сразу.
          </h1>

          <p class="mt-7 max-w-[430px] text-[15px] leading-7 text-slate-400">
            Канбан-доска с честной конкурентностью, ролями и мгновенной синхронизацией. Без лишнего
            — только то, что помогает двигать работу вперёд.
          </p>

          <BoardPreview />
        </div>

        <div class="relative flex items-center gap-5 text-[11px] font-semibold text-slate-500">
          <span>JWT + refresh rotation</span>
          <span class="h-1 w-1 rounded-full bg-slate-700"></span>
          <span>PostgreSQL</span>
          <span class="h-1 w-1 rounded-full bg-slate-700"></span>
          <span>&lt; 500 ms sync</span>
        </div>
      </section>

      <main class="relative flex min-h-dvh items-center justify-center px-5 py-10 sm:px-8">
        <div class="w-full max-w-[420px]">
          <RouterLink to="/" class="mb-12 flex w-fit items-center gap-2.5 lg:hidden">
            <span class="grid h-8 w-8 place-items-center rounded-[10px] bg-lime-300 text-slate-950">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor" aria-hidden="true">
                <rect x="4" y="4" width="6" height="16" rx="1.6" />
                <rect x="14" y="4" width="6" height="10" rx="1.6" opacity=".72" />
              </svg>
            </span>
            <span class="text-[16px] font-extrabold tracking-tight">
              trello<span class="text-lime-300">lite</span>
            </span>
          </RouterLink>

          <slot />
        </div>
      </main>
    </div>
  </div>
</template>
