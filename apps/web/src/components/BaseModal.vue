<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'

const props = defineProps<{
  open: boolean
  title: string
  description?: string
}>()

const emit = defineEmits<{
  close: []
}>()

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.open) {
    emit('close')
  }
}

let previousOverflow = ''

watch(
  () => props.open,
  (open) => {
    if (open) {
      previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = previousOverflow
    }
  },
  { immediate: true },
)

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = previousOverflow
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 z-50 grid place-items-center p-4">
        <div class="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" @click="emit('close')"></div>

        <div
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          class="relative w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-black/40"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-lg font-extrabold tracking-tight text-white">{{ title }}</h2>
              <p v-if="description" class="mt-1.5 text-[12px] leading-5 text-slate-400">
                {{ description }}
              </p>
            </div>
            <button
              type="button"
              class="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-white"
              aria-label="Закрыть"
              @click="emit('close')"
            >
              <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" aria-hidden="true">
                <path
                  d="m5 5 10 10M15 5 5 15"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </div>

          <div class="mt-5">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
