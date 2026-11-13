<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { registerSchema } from '@trello/shared'
import { z } from 'zod'
import AuthLayout from '@/components/AuthLayout.vue'
import FormField from '@/components/FormField.vue'
import { getApiErrorMessage, getApiFieldErrors } from '@/lib/api-error'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const serverError = ref('')

const registerFormSchema = registerSchema
  .extend({
    confirmPassword: z.string().min(1, 'Повторите пароль'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  })

const { handleSubmit, errors, defineField, isSubmitting, setErrors } = useForm({
  validationSchema: toTypedSchema(registerFormSchema),
  initialValues: { name: '', email: '', password: '', confirmPassword: '' },
})

const [name] = defineField('name')
const [email] = defineField('email')
const [password] = defineField('password')
const [confirmPassword] = defineField('confirmPassword')

const submit = handleSubmit(async (values) => {
  serverError.value = ''

  try {
    await auth.register({
      name: values.name,
      email: values.email,
      password: values.password,
    })
    await router.replace('/')
  } catch (error) {
    serverError.value = getApiErrorMessage(error)
    setErrors(getApiFieldErrors(error))
  }
})
</script>

<template>
  <AuthLayout>
    <div class="mb-7">
      <p class="mb-3 text-[10px] font-extrabold uppercase tracking-[0.24em] text-lime-300">
        Новый аккаунт
      </p>
      <h2 class="text-[2rem] font-extrabold leading-tight tracking-[-0.035em] text-white">
        Создайте аккаунт
      </h2>
      <p class="mt-2.5 text-sm leading-6 text-slate-400">
        30 секунд — и у вас есть личное пространство для задач.
      </p>
    </div>

    <div
      v-if="serverError"
      role="alert"
      class="mb-5 flex items-start gap-2.5 rounded-xl border border-red-400/20 bg-red-400/[0.08] px-4 py-3 text-[13px] leading-5 text-red-200"
    >
      <svg
        viewBox="0 0 20 20"
        class="mt-0.5 h-4 w-4 shrink-0"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm-.75-11.5a.75.75 0 0 1 1.5 0v4a.75.75 0 0 1-1.5 0v-4ZM10 14a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
          clip-rule="evenodd"
        />
      </svg>
      <span>{{ serverError }}</span>
    </div>

    <form class="space-y-4" novalidate @submit.prevent="submit">
      <FormField
        v-model="name"
        label="Имя"
        autocomplete="name"
        placeholder="Как вас называть?"
        :error="errors.name"
      />
      <FormField
        v-model="email"
        label="Email"
        type="email"
        autocomplete="email"
        placeholder="you@example.com"
        :error="errors.email"
      />
      <FormField
        v-model="password"
        label="Пароль"
        type="password"
        autocomplete="new-password"
        placeholder="Минимум 8 символов"
        :error="errors.password"
      />
      <FormField
        v-model="confirmPassword"
        label="Повторите пароль"
        type="password"
        autocomplete="new-password"
        placeholder="Ещё раз"
        :error="errors.confirmPassword"
      />

      <button
        type="submit"
        :disabled="isSubmitting"
        class="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-lime-300 px-4 py-3.5 text-[14px] font-extrabold text-slate-950 transition-all duration-200 hover:bg-lime-200 focus:outline-none focus:ring-4 focus:ring-lime-300/25 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg
          v-if="isSubmitting"
          class="h-4 w-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          />
          <path
            class="opacity-90"
            fill="currentColor"
            d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647Z"
          />
        </svg>
        {{ isSubmitting ? 'Создаём аккаунт…' : 'Создать аккаунт' }}
      </button>
    </form>

    <p class="mt-6 text-center text-[13px] text-slate-500">
      Уже есть аккаунт?
      <RouterLink
        to="/login"
        class="font-bold text-slate-200 underline-offset-4 transition-colors hover:text-lime-300 hover:underline"
      >
        Войти
      </RouterLink>
    </p>
  </AuthLayout>
</template>
