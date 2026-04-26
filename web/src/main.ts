import { createApp } from 'vue'
import PrimeVue from 'primevue/config'
import ConfirmationService from 'primevue/confirmationservice'
import Tooltip from 'primevue/tooltip'
import Aura from '@primevue/themes/aura'
import 'primeicons/primeicons.css'
import './index.css'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      // Force dark mode always — :root is always present
      darkModeSelector: '.p-dark',
      cssLayer: false,
    },
  },
})
app.use(ConfirmationService)
app.directive('tooltip', Tooltip)
app.use(router)
app.mount('#root')
