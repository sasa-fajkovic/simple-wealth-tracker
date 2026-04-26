import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/',              component: () => import('../pages/DashboardPage.vue') },
    { path: '/analytics',    component: () => import('../pages/AnalyticsPage.vue') },
    { path: '/projections',  component: () => import('../pages/ProjectionsPage.vue') },
    { path: '/income',      component: () => import('../pages/CashInflowPage.vue') },
    { path: '/data-points',  component: () => import('../pages/DataPointsPage.vue') },
    { path: '/monthly-update', component: () => import('../pages/MonthlyUpdatePage.vue') },
    { path: '/admin',        component: () => import('../pages/AdminPage.vue') },
  ],
})

export default router
