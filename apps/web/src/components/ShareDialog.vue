<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { BoardRoleDto, BoardShareDto } from '@trello/shared'
import { getApiErrorMessage } from '@/lib/api-error'
import { useBoardsStore } from '@/stores/boards'
import BaseModal from './BaseModal.vue'

const props = defineProps<{
  open: boolean
  boardId: string
}>()

const emit = defineEmits<{
  close: []
}>()

const boards = useBoardsStore()

const role = ref<BoardRoleDto>('viewer')
const share = ref<BoardShareDto | null>(null)
const isLoading = ref(false)
const isSaving = ref(false)
const error = ref('')
const copied = ref(false)
const linkInput = ref<HTMLInputElement | null>(null)

let loadRequest = 0

const roleOptions: Array<{ value: BoardRoleDto; label: string; hint: string }> = [
  {
    value: 'editor',
    label: 'Редактор',
    hint: 'Может менять доску, колонки и карточки',
  },
  {
    value: 'viewer',
    label: 'Просмотр',
    hint: 'Может только смотреть и получать обновления',
  },
]

const link = computed(() =>
  share.value ? `${window.location.origin}/join/${share.value.token}` : '',
)
const roleChanged = computed(() => Boolean(share.value && share.value.role !== role.value))

watch(
  () => props.open,
  (open) => {
    if (open) {
      void load()
    } else {
      copied.value = false
    }
  },
)

async function load(): Promise<void> {
  const request = ++loadRequest
  isLoading.value = true
  error.value = ''
  copied.value = false

  try {
    const data = await boards.fetchBoardShare(props.boardId)
    if (request !== loadRequest) return

    share.value = data
    role.value = data?.role ?? 'viewer'
  } catch (err) {
    if (request !== loadRequest) return
    error.value = getApiErrorMessage(err)
  } finally {
    if (request === loadRequest) {
      isLoading.value = false
    }
  }
}

async function save(regenerate: boolean): Promise<void> {
  if (isSaving.value) return

  isSaving.value = true
  error.value = ''
  copied.value = false

  try {
    share.value = await boards.shareBoard(props.boardId, {
      role: role.value,
      regenerate,
    })
  } catch (err) {
    error.value = getApiErrorMessage(err)
  } finally {
    isSaving.value = false
  }
}

async function copyLink(): Promise<void> {
  if (!link.value) return

  try {
    await navigator.clipboard.writeText(link.value)
    copied.value = true
    window.setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    linkInput.value?.focus()
    linkInput.value?.select()
    error.value = 'Не удалось скопировать автоматически — ссылка выделена, скопируйте вручную.'
  }
}
</script>

<template>
  <BaseModal
    :open="open"
    title="Поделиться доской"
    description="Отправьте ссылку коллеге. Присоединиться сможет любой авторизованный пользователь."
    @close="emit('close')"
  >
    <div v-if="isLoading" class="space-y-4 animate-pulse">
      <div class="h-20 rounded-xl bg-white/[0.04]"></div>
      <div class="h-11 rounded-xl bg-white/[0.04]"></div>
    </div>

    <template v-else>
      <p class="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
        Права по ссылке
      </p>
      <div class="grid gap-2 sm:grid-cols-2">
        <button
          v-for="option in roleOptions"
          :key="option.value"
          type="button"
          :disabled="isSaving"
          :aria-pressed="role === option.value"
          class="rounded-xl border px-3.5 py-3 text-left transition-colors disabled:opacity-60"
          :class="
            role === option.value
              ? 'border-lime-300/40 bg-lime-300/[0.07]'
              : 'border-white/10 bg-slate-950/40 hover:border-white/20'
          "
          @click="role = option.value"
        >
          <span
            class="block text-[12px] font-extrabold"
            :class="role === option.value ? 'text-lime-200' : 'text-slate-200'"
          >
            {{ option.label }}
          </span>
          <span class="mt-1 block text-[11px] leading-4 text-slate-500">{{ option.hint }}</span>
        </button>
      </div>

      <div v-if="share" class="mt-5">
        <label
          for="share-link"
          class="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500"
        >
          Ссылка для приглашения
        </label>
        <div class="flex gap-2">
          <input
            id="share-link"
            ref="linkInput"
            :value="link"
            readonly
            class="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/70 px-3.5 py-2.5 text-[12px] text-slate-300 outline-none focus:border-lime-300/40"
            @focus="($event.target as HTMLInputElement).select()"
          />
          <button
            type="button"
            class="shrink-0 rounded-xl border border-lime-300/30 bg-lime-300/[0.08] px-3.5 py-2.5 text-[12px] font-extrabold text-lime-200 transition-colors hover:bg-lime-300/[0.14]"
            @click="copyLink"
          >
            {{ copied ? 'Скопировано' : 'Копировать' }}
          </button>
        </div>
        <p class="mt-2 text-[11px] leading-4 text-slate-600">
          Роль применяется при присоединении. Уже добавленные участники сохраняют свои права.
        </p>
      </div>

      <p
        v-if="error"
        role="alert"
        class="mt-4 rounded-lg border border-red-400/20 bg-red-400/[0.08] px-3 py-2 text-[12px] leading-5 text-red-200"
      >
        {{ error }}
      </p>

      <div class="mt-6 flex flex-wrap items-center justify-between gap-2.5">
        <button
          v-if="share"
          type="button"
          :disabled="isSaving"
          class="rounded-xl border border-white/10 px-3.5 py-2.5 text-[12px] font-bold text-slate-400 transition-colors hover:border-white/20 hover:text-white disabled:opacity-50"
          title="Старая ссылка перестанет работать"
          @click="save(true)"
        >
          {{ isSaving ? 'Обновляем…' : 'Новая ссылка' }}
        </button>
        <span v-else></span>

        <div class="ml-auto flex items-center gap-2.5">
          <button
            type="button"
            class="rounded-xl border border-white/10 px-4 py-2.5 text-[12px] font-bold text-slate-300 transition-colors hover:border-white/20 hover:text-white"
            @click="emit('close')"
          >
            Закрыть
          </button>
          <button
            v-if="!share"
            type="button"
            :disabled="isSaving"
            class="rounded-xl bg-lime-300 px-4 py-2.5 text-[12px] font-extrabold text-slate-950 transition-colors hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
            @click="save(false)"
          >
            {{ isSaving ? 'Создаём…' : 'Создать ссылку' }}
          </button>
          <button
            v-else-if="roleChanged"
            type="button"
            :disabled="isSaving"
            class="rounded-xl bg-lime-300 px-4 py-2.5 text-[12px] font-extrabold text-slate-950 transition-colors hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
            @click="save(false)"
          >
            {{ isSaving ? 'Сохраняем…' : 'Сохранить роль' }}
          </button>
        </div>
      </div>
    </template>
  </BaseModal>
</template>
