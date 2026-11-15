<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import BaseModal from './BaseModal.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    description?: string
    label: string
    placeholder?: string
    submitLabel: string
    initialValue?: string
    error?: string
    loading?: boolean
  }>(),
  {
    description: '',
    placeholder: '',
    initialValue: '',
    error: '',
    loading: false,
  },
)

const emit = defineEmits<{
  close: []
  submit: [value: string]
}>()

const value = ref('')
const input = ref<HTMLInputElement | null>(null)

watch(
  () => props.open,
  (open) => {
    if (!open) return

    value.value = props.initialValue
    void nextTick(() => {
      input.value?.focus()
      input.value?.select()
    })
  },
  { immediate: true },
)

function submit(): void {
  const title = value.value.trim()

  if (!title || props.loading) return

  emit('submit', title)
}
</script>

<template>
  <BaseModal :open="open" :title="title" :description="description" @close="emit('close')">
    <form @submit.prevent="submit">
      <label class="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
        {{ label }}
      </label>
      <input
        ref="input"
        v-model="value"
        type="text"
        maxlength="80"
        :placeholder="placeholder"
        class="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-slate-600 focus:border-lime-300/50 focus:ring-4 focus:ring-lime-300/10"
        @keydown.esc="emit('close')"
      />

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
          type="submit"
          :disabled="!value.trim() || loading"
          class="rounded-xl bg-lime-300 px-4 py-2.5 text-[12px] font-extrabold text-slate-950 transition-colors hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {{ loading ? 'Подождите…' : submitLabel }}
        </button>
      </div>
    </form>
  </BaseModal>
</template>
