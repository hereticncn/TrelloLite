import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import './style.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

window.addEventListener('auth:expired', () => {
  useAuthStore(pinia).clearSession()

  const current = router.currentRoute.value
  if (current.meta.requiresAuth) {
    void router.replace({
      name: 'login',
      query: { redirect: current.fullPath },
    })
  }
})

app.mount('#app')
