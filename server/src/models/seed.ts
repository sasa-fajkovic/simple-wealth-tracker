import type { Category, Person } from './index.js'

// Seed data written to database.yaml on first server boot when the file doesn't exist.
// Values are fixed by product design — do not change IDs, growth rates, or colors.
export const SEED_CATEGORIES: Category[] = [
  { id: 'stocks',      name: 'Stocks',       projected_yearly_growth: 0.08, color: '#6366f1', type: 'asset' },
  { id: 'real-estate', name: 'Real Estate',  projected_yearly_growth: 0.05, color: '#10b981', type: 'asset' },
  { id: 'crypto',      name: 'Crypto',       projected_yearly_growth: 0.15, color: '#f59e0b', type: 'asset' },
  { id: 'cash',        name: 'Cash',         projected_yearly_growth: 0.02, color: '#64748b', type: 'asset' },
]

export const SEED_PERSONS: Person[] = []
