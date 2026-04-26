// Shared Intl formatters — module-level singletons reused across chart components.
export const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
export const compactFmt = new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 0 })
export const pctFmt = new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 1 })
