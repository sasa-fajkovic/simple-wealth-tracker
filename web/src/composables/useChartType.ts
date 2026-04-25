import { ref } from 'vue'
export type ChartType = 'area' | 'line' | 'bar' | 'pie'

export function useChartType(storageKey: string) {
  const stored = localStorage.getItem(storageKey)
  const valid: ChartType[] = ['area', 'line', 'bar', 'pie']
  const initial: ChartType = valid.includes(stored as ChartType) ? (stored as ChartType) : 'area'
  const chartType = ref<ChartType>(initial)

  function setChartType(t: ChartType) {
    chartType.value = t
    localStorage.setItem(storageKey, t)
  }

  return { chartType, setChartType }
}
