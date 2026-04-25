// web/src/api/client.ts
import type {
  Category,
  Asset,
  DataPoint,
  Person,
  SummaryResponse,
  ProjectionsResponse,
  RangeKey,
  CreateCategoryPayload,
  UpdateCategoryPayload,
  CreateAssetPayload,
  UpdateAssetPayload,
  CreateDataPointPayload,
  UpdateDataPointPayload,
  CreatePersonPayload,
  UpdatePersonPayload,
} from '../types/index'

// ── Error class ────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

// ── Core fetch wrapper ─────────────────────────────────────────────────────────

const BASE = '/api/v1'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new ApiError(res.status, body.error ?? res.statusText)
  }
  // 204 No Content (DELETE responses) — skip json parsing
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T
  }
  return res.json() as Promise<T>
}

// apiFetchRaw returns the parsed body even for non-ok responses (used by safe deletes)
async function apiFetchRaw<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const data = await res.json().catch(() => ({} as T))
  return { ok: res.ok, status: res.status, data: data as T }
}

// ── Categories ─────────────────────────────────────────────────────────────────

export function getCategories(): Promise<Category[]> {
  return apiFetch('/categories')
}

export function createCategory(data: CreateCategoryPayload): Promise<Category> {
  return apiFetch('/categories', { method: 'POST', body: JSON.stringify(data) })
}

export function updateCategory(id: string, data: UpdateCategoryPayload): Promise<Category> {
  return apiFetch(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export type DeleteCategoryResult =
  | { ok: true }
  | { ok: false; needs_reassign: true; assets: Asset[] }

export async function deleteCategory(id: string, reassignTo?: string): Promise<DeleteCategoryResult> {
  const params = reassignTo !== undefined ? `?reassign_to=${encodeURIComponent(reassignTo)}` : ''
  const res = await apiFetchRaw<{ needs_reassign?: boolean; assets?: Asset[] }>(`/categories/${id}${params}`, { method: 'DELETE' })
  if (res.ok) return { ok: true }
  if (res.status === 409 && res.data.needs_reassign) {
    return { ok: false, needs_reassign: true, assets: res.data.assets ?? [] }
  }
  throw new ApiError(res.status, 'Failed to delete category')
}

// ── Assets ─────────────────────────────────────────────────────────────────────

export function getAssets(): Promise<Asset[]> {
  return apiFetch('/assets')
}

export function createAsset(data: CreateAssetPayload): Promise<Asset> {
  return apiFetch('/assets', { method: 'POST', body: JSON.stringify(data) })
}

export function updateAsset(id: string, data: UpdateAssetPayload): Promise<Asset> {
  return apiFetch(`/assets/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export type DeleteAssetResult =
  | { ok: true }
  | { ok: false; needs_confirm: true; data_point_count: number }

export async function deleteAsset(id: string, force = false): Promise<DeleteAssetResult> {
  const params = force ? '?force=true' : ''
  const res = await apiFetchRaw<{ needs_confirm?: boolean; data_point_count?: number }>(`/assets/${id}${params}`, { method: 'DELETE' })
  if (res.ok) return { ok: true }
  if (res.status === 409 && res.data.needs_confirm) {
    return { ok: false, needs_confirm: true, data_point_count: res.data.data_point_count ?? 0 }
  }
  throw new ApiError(res.status, 'Failed to delete asset')
}

// ── Data Points ────────────────────────────────────────────────────────────────

export function getDataPoints(): Promise<DataPoint[]> {
  return apiFetch('/data-points')
}

export function createDataPoint(data: CreateDataPointPayload): Promise<DataPoint> {
  return apiFetch('/data-points', { method: 'POST', body: JSON.stringify(data) })
}

export function updateDataPoint(id: string, data: UpdateDataPointPayload): Promise<DataPoint> {
  return apiFetch(`/data-points/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteDataPoint(id: string): Promise<void> {
  return apiFetch(`/data-points/${id}`, { method: 'DELETE' })
}

// ── Summary ────────────────────────────────────────────────────────────────────

export function getSummary(range: RangeKey, person?: string, tracking?: boolean): Promise<SummaryResponse> {
  const params = new URLSearchParams({ range })
  if (person) params.set('person', person)
  if (tracking) params.set('tracking', 'true')
  return apiFetch(`/summary?${params.toString()}`)
}

// ── Projections ────────────────────────────────────────────────────────────────

export function getProjections(years: number): Promise<ProjectionsResponse> {
  return apiFetch(`/projections?years=${years}`)
}

// ── Persons ─────────────────────────────────────────────────────────────────

export function getPersons(): Promise<Person[]> {
  return apiFetch('/persons')
}

export function createPerson(data: CreatePersonPayload): Promise<Person> {
  return apiFetch('/persons', { method: 'POST', body: JSON.stringify(data) })
}

export function updatePerson(id: string, data: UpdatePersonPayload): Promise<Person> {
  return apiFetch(`/persons/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export type DeletePersonResult =
  | { ok: true }
  | { ok: false; needs_reassign: true; assets: Asset[] }

export async function deletePerson(id: string, reassignTo?: string): Promise<DeletePersonResult> {
  // reassignTo: undefined = first call (get count), '' = Unassigned, '<id>' = specific person
  const params = reassignTo !== undefined ? `?reassign_to=${encodeURIComponent(reassignTo)}` : ''
  const res = await apiFetchRaw<{ needs_reassign?: boolean; assets?: Asset[] }>(`/persons/${id}${params}`, { method: 'DELETE' })
  if (res.ok) return { ok: true }
  if (res.status === 409 && res.data.needs_reassign) {
    return { ok: false, needs_reassign: true, assets: res.data.assets ?? [] }
  }
  throw new ApiError(res.status, 'Failed to delete person')
}
