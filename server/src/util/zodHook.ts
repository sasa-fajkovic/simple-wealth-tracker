import type { z } from 'zod'

// Default zValidator hook returns { success: false, error: ZodIssue[] } which
// does NOT match the required {"error":"..."} API contract (API-01).
// This shared hook converts the first issue's message into the canonical shape.
// Signature uses `any` for `c` because Hono's Hook generic is route-specific
// and cannot be satisfied with a single concrete type (see hono-zod-validator).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function zodErrorHook(result: { success: boolean; error?: z.ZodError }, c: any) {
  if (!result.success && result.error) {
    return c.json({ error: result.error.issues[0]?.message ?? 'Invalid request' }, 400 as const)
  }
}
