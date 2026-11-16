<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { BoardMemberDto, BoardRoleDto } from '@trello/shared'
import { getApiErrorMessage } from '@/lib/api-error'
import { useBoardsStore } from '@/stores/boards'
import BaseModal from './BaseModal.vue'
import ConfirmDialog from './ConfirmDialog.vue'

const props = defineProps<{
  open: boolean
  boardId: string
  isOwner: boolean
  currentUserId: string
}>()

const emit = defineEmits<{
  close: []
  left: []
}>()

const boards = useBoardsStore()

const isLoading = ref(false)
const isSaving = ref(false)
const error = ref('')
const pendingAction = ref<{ kind: 'remove' | 'leave'; member: BoardMemberDto } | null>(null)

const members = computed(() => boards.members)
const confirmOpen = computed(() => pendingAction.value !== null)

const confirmTitle = computed(() =>
  pendingAction.value?.kind === 'leave' ? 'Покинуть доску?' : 'Удалить участника?',
)
const confirmMessage = computed(() => {
  const member = pendingAction.value?.member
  if (!member) return ''

  return pendingAction.value?.kind === 'leave'
    ? `Вы потеряете доступ к доске «${boards.currentBoard?.title ?? ''}». Присоединиться снова можно будет по share-ссылке.`
    : `Участник «${member.name}» потеряет доступ к доске. Присоединиться снова можно будет по share-ссылке.`
})
const confirmLabel = computed(() =>
  pendingAction.value?.kind === 'leave' ? 'Покинуть' : 'Удалить',
)

let loadRequest = 0

watch(
  () => props.open,
  (open) => {
    if (open) {
      void load()
    } else {
      pendingAction.value = null
      error.value = ''
    }
  },
)

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function roleLabel(role: BoardRoleDto): string {
  return role === 'editor' ? 'Редактор' : 'Просмотр'
}

async function load(): Promise<void> {
  const request = ++loadRequest
  isLoading.value = true
  error.value = ''

  try {
    await boards.fetchMembers(props.boardId)
  } catch (err) {
    if (request !== loadRequest) return
    error.value = getApiErrorMessage(err)
  } finally {
    if (request === loadRequest) {
      isLoading.value = false
    }
  }
}

async function changeRole(member: BoardMemberDto, role: BoardRoleDto): Promise<void> {
  if (isSaving.value || member.role === role) return

  isSaving.value = true
  error.value = ''

  try {
    await boards.updateMemberRole(props.boardId, member.userId, role)
  } catch (err) {
    error.value = getApiErrorMessage(err)

    try {
      await boards.fetchMembers(props.boardId)
    } catch {
      // The list keeps the last known state if the refetch also fails.
    }
  } finally {
    isSaving.value = false
  }
}

function askRemove(member: BoardMemberDto): void {
  error.value = ''
  pendingAction.value = { kind: 'remove', member }
}

function askLeave(): void {
  const me = members.value.find((member) => member.userId === props.currentUserId)
  if (!me) return

  error.value = ''
  pendingAction.value = { kind: 'leave', member: me }
}

async function confirmPending(): Promise<void> {
  const action = pendingAction.value
  if (!action || isSaving.value) return

  isSaving.value = true
  error.value = ''

  try {
    await boards.removeMember(props.boardId, action.member.userId)
    const isSelf = action.member.userId === props.currentUserId
    pendingAction.value = null

    if (isSelf) {
      emit('left')
    }
  } catch (err) {
    error.value = getApiErrorMessage(err)
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <BaseModal
    :open="open"
    title="Участники доски"
    description="Владелец может менять роли и удалять участников. Роль применяется сразу."
    @close="emit('close')"
  >
    <div v-if="isLoading" class="space-y-2.5 animate-pulse">
      <div v-for="index in 3" :key="index" class="h-14 rounded-xl bg-white/[0.04]"></div>
    </div>

    <template v-else>
      <ul v-if="members.length > 0" class="space-y-2">
        <li
          v-for="member in members"
          :key="member.userId"
          class="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-slate-950/40 px-3 py-2.5"
        >
          <span
            class="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-[11px] font-extrabold text-slate-300"
          >
            {{ initials(member.name) }}
          </span>

          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-1.5 truncate text-[12px] font-bold text-slate-200">
              {{ member.name }}
              <span v-if="member.userId === currentUserId" class="text-[10px] text-slate-500">
                (вы)
              </span>
            </p>
            <p class="truncate text-[11px] text-slate-500">{{ member.email }}</p>
          </div>

          <span
            v-if="member.isOwner || !isOwner"
            class="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold"
            :class="
              member.role === 'editor'
                ? 'border-lime-300/25 bg-lime-300/[0.07] text-lime-200'
                : 'border-white/10 bg-white/[0.03] text-slate-400'
            "
          >
            {{ member.isOwner ? 'Владелец' : roleLabel(member.role) }}
          </span>

          <template v-else>
            <select
              :value="member.role"
              :disabled="isSaving"
              :aria-label="`Роль участника ${member.name}`"
              class="shrink-0 rounded-lg border border-white/10 bg-slate-950/70 px-2 py-1 text-[11px] font-bold text-slate-300 outline-none focus:border-lime-300/40 disabled:opacity-50"
              @change="
                changeRole(
                  member,
                  ($event.target as HTMLSelectElement).value as BoardRoleDto,
                )
              "
            >
              <option value="editor">Редактор</option>
              <option value="viewer">Просмотр</option>
            </select>
            <button
              type="button"
              :disabled="isSaving"
              class="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-red-400/[0.08] hover:text-red-300 disabled:opacity-50"
              title="Удалить из доски"
              :aria-label="`Удалить участника ${member.name}`"
              @click="askRemove(member)"
            >
              <svg viewBox="0 0 20 20" class="h-3.5 w-3.5" fill="none" aria-hidden="true">
                <path
                  d="M4 5.5h12M8 3.5h4M5.5 5.5l.6 9h7.8l.6-9M8.3 8.5v3.7M11.7 8.5v3.7"
                  stroke="currentColor"
                  stroke-width="1.3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </template>
        </li>
      </ul>

      <p v-else class="rounded-xl border border-dashed border-white/[0.08] px-4 py-6 text-center text-[12px] text-slate-500">
        Участников пока нет.
      </p>

      <p
        v-if="error"
        role="alert"
        class="mt-4 rounded-lg border border-red-400/20 bg-red-400/[0.08] px-3 py-2 text-[12px] leading-5 text-red-200"
      >
        {{ error }}
      </p>

      <div class="mt-6 flex flex-wrap items-center justify-between gap-2.5">
        <button
          v-if="!isOwner"
          type="button"
          :disabled="isSaving"
          class="rounded-xl border border-red-400/25 px-3.5 py-2.5 text-[12px] font-bold text-red-300 transition-colors hover:bg-red-400/[0.08] disabled:opacity-50"
          @click="askLeave"
        >
          Покинуть доску
        </button>
        <span v-else class="text-[11px] text-slate-600">Владелец не может покинуть доску.</span>

        <button
          type="button"
          class="ml-auto rounded-xl border border-white/10 px-4 py-2.5 text-[12px] font-bold text-slate-300 transition-colors hover:border-white/20 hover:text-white"
          @click="emit('close')"
        >
          Закрыть
        </button>
      </div>
    </template>
  </BaseModal>

  <ConfirmDialog
    :open="confirmOpen"
    :title="confirmTitle"
    :message="confirmMessage"
    :confirm-label="confirmLabel"
    :error="error"
    :loading="isSaving"
    @close="pendingAction = null"
    @confirm="confirmPending"
  />
</template>
