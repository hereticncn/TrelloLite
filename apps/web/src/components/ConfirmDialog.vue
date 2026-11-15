<script setup lang="ts">
import BaseModal from './BaseModal.vue'

withDefaults(
  defineProps<{
    open: boolean
    title: string
    message: string
    confirmLabel: string
    error?: string
    loading?: boolean
  }>(),
  {
    error: '',
    loading: false,
  },
)

const emit = defineEmits<{
  close: []
  confirm: []
}>()
</script>

<template>
  <BaseModal :open="open" :title="title" @close="emit('close')">
    <p class="text-[13px] leading-6 text-slate-400">{{ message }}</p>

    <p
      v-if="error"
      role="alert"
      class="mt-3 rounded-lg border border-red-400/20 bg-red-400/[0.08] px-3 py-2 text-[12px] leading-5 text-red-200"
    >
      {{ error }}
    </p>

    <div class="mt-6 flex justify-end gap-2.5">
      <button
        type="button"
        class="rounded-xl border border-white/10 px-4 py-2.5 text-[12px] font-bold text-slate-300 transition-colors hover:border-white/20 hover:text-white"
        @click="emit('close')"
      >
        Отмена
      </button>
      <button
        type="button"
        :disabled="loading"
        class="rounded-xl bg-red-400 px-4 py-2.5 text-[12px] font-extrabold text-slate-950 transition-colors hover:bg-red-300 disabled:cursor-not-allowed disabled:opacity-50"
        @click="emit('confirm')"
      >
        {{ loading ? 'Удаляем…' : confirmLabel }}
      </button>
    </div>
  </BaseModal>
</template>
