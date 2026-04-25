import { createRouter, createWebHistory } from 'vue-router'
import DashboardPage from '../pages/DashboardPage.vue'
import ProjectionsPage from '../pages/ProjectionsPage.vue'
import AdminPage from '../pages/AdminPage.vue'
import DataPointsPage from '../pages/DataPointsPage.vue'
import CashInflowPage from '../pages/CashInflowPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: DashboardPage },
    { path: '/projections', component: ProjectionsPage },
    { path: '/cash-inflow', component: CashInflowPage },
    { path: '/data-points', component: DataPointsPage },
    { path: '/admin', component: AdminPage },
  ],
})

export default router
