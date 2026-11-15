<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import BaseModal from './BaseModal.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    description?: string
    submitLabel: string
    initialTitle?: string
    initialDescription?: string
    error?: string
    loading?: boolean
  }>(),
  {
    description: '',
    initialTitle: '',
    initialDescription: '',
    error: '',
    loading: false,
  },
)

const emit = defineEmits<{
  close: []
  submit: [value: { title: string; description: string }]
}>()

const titleValue = ref('')
const descriptionValue = ref('')
const titleInput = ref<HTMLInputElement | null>(null)

watch(
  () => props.open,
  (open) => {
    if (!open) return

    titleValue.value = props.initialTitle
    descriptionValue.value = props.initialDescription
    void nextTick(() => {
      titleInput.value?.focus()
      titleInput.value?.select()
    })
  },
  { immediate: true },
)

function submit(): void {
  const title = titleValue.value.trim()
  if (!title || props.loading) return

  emit('submit', { title, description: descriptionValue.value.trim() })
}
</script>

<template>
  <BaseModal :open="open" :title="title" :description="description" @close="emit('close')">
    <form @submit.prevent="submit">
      <label class="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
        Название карточки
      </label>
      <input
        ref="titleInput"
        v-model="titleValue"
        type="text"
        maxlength="120"
        placeholder="Например, Подготовить релиз"
        class="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-slate-600 focus:border-lime-300/50 focus:ring-4 focus:ring-lime-300/10"
      />

      <div class="mt-4 flex items-baseline justify-between gap-3">
        <label class="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Описание
        </label>
        <span class="text-[10px] font-semibold text-slate-600">
          {{ descriptionValue.length }} / 2000
        </span>
      </div>
      <textarea
        v-model="descriptionValue"
        rows="5"
        maxlength="2000"
        placeholder="Детали, критерии готовности, ссылки — всё, что поможет выполнить задачу"
        class="mt-2 w-full resize-none rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-[13px] leading-6 text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-lime-300/50 focus:ring-4 focus:ring-lime-300/10"
      ></textarea>

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
          :disabled="!titleValue.trim() || loading"
          class="rounded-xl bg-lime-300 px-4 py-2.5 text-[12px] font-extrabold text-slate-950 transition-colors hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {{ loading ? 'Сохраняем…' : submitLabel }}
        </button>
      </div>
    </form>
  </BaseModal>
</template>
