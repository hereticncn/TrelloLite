<script setup lang="ts">
import { useId } from 'vue'

defineOptions({ inheritAttrs: false })

withDefaults(
  defineProps<{
    label: string
    type?: string
    autocomplete?: string
    placeholder?: string
    error?: string
  }>(),
  {
    type: 'text',
    autocomplete: 'off',
    placeholder: '',
  },
)

const model = defineModel<string | undefined>()
const id = useId()
const errorId = `${id}-error`
</script>

<template>
  <label :for="id" class="block">
    <span class="mb-2 block text-[13px] font-semibold text-slate-300">{{ label }}</span>
    <input
      :id="id"
      v-model="model"
      :type="type"
      :autocomplete="autocomplete"
      :placeholder="placeholder"
      :aria-invalid="Boolean(error)"
      :aria-describedby="error ? errorId : undefined"
      v-bind="$attrs"
      class="w-full rounded-xl border bg-slate-950/70 px-4 py-3.5 text-[15px] text-white outline-none transition-colors duration-200 placeholder:text-slate-600"
      :class="
        error
          ? 'border-red-400/50 focus:border-red-400'
          : 'border-white/10 hover:border-white/20 focus:border-lime-300/70 focus:ring-4 focus:ring-lime-300/10'
      "
    />
    <span v-if="error" :id="errorId" class="mt-1.5 block text-xs font-medium text-red-300">
      {{ error }}
    </span>
  </label>
</template>
