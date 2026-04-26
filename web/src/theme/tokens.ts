export interface ChartTokens {
  grid: string
  tick: string
  legend: string
  tooltipBg: string
  tooltipTitle: string
  tooltipBody: string
  tooltipBorder: string
  totalLine: string
  radarFill: string
  radarBorder: string
  scatterAsset: string
  scatterLiability: string
  scatterInflow: string
}

export const wealthColors = {
  assets: {
    indigo: '#6366f1',
    blue: '#3b82f6',
    emerald: '#10b981',
  },
  cashInflow: {
    green: '#22c55e',
    teal: '#14b8a6',
  },
  liabilities: {
    rose: '#f43f5e',
    red: '#ef4444',
    orange: '#f97316',
  },
  neutral: {
    total: {
      light: '#111827',
      dark: '#f4f4f5',
    },
  },
} as const

export function getChartTokens(dark: boolean): ChartTokens {
  return dark
    ? {
        grid: '#27272a',
        tick: '#71717a',
        legend: '#a1a1aa',
        tooltipBg: '#18181b',
        tooltipTitle: '#e4e4e7',
        tooltipBody: '#a1a1aa',
        tooltipBorder: '#3f3f46',
        totalLine: '#f4f4f5',
        radarFill: '#818cf844',
        radarBorder: '#818cf8',
        scatterAsset: '#60a5fa',
        scatterLiability: '#fb7185',
        scatterInflow: '#4ade80',
      }
    : {
        grid: '#e5e7eb',
        tick: '#6b7280',
        legend: '#374151',
        tooltipBg: '#ffffff',
        tooltipTitle: '#111827',
        tooltipBody: '#6b7280',
        tooltipBorder: '#e5e7eb',
        totalLine: '#111827',
        radarFill: '#6366f133',
        radarBorder: '#6366f1',
        scatterAsset: '#3b82f6',
        scatterLiability: '#f43f5e',
        scatterInflow: '#22c55e',
      }
}

export function buildTooltipDefaults(t: ChartTokens): Record<string, unknown> {
  return {
    backgroundColor: t.tooltipBg,
    titleColor: t.tooltipTitle,
    bodyColor: t.tooltipBody,
    borderColor: t.tooltipBorder,
    borderWidth: 1,
    padding: 12,
    cornerRadius: 6,
    caretSize: 5,
    displayColors: true,
    boxWidth: 10,
    boxHeight: 10,
    boxPadding: 4,
  }
}
