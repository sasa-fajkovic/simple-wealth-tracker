# Phase 1: Data Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-22
**Phase:** 01-data-foundation
**Areas discussed:** Corrupt YAML Recovery, year_month Field Source

---

## Corrupt YAML Recovery

| Option | Description | Selected |
|--------|-------------|----------|
| Crash with clear error | Forces user to fix the file before data loss; safest for a wealth tracker | ✓ |
| Log warning and continue with empty state | Risky: next write would overwrite real data with empty DB | |
| Throw typed StorageError (health surfaces it) | Server stays up but all mutations return 500 until file is fixed | |

**User's choice:** Crash with a clear error message  
**Notes:** User confirmed: safest option for a wealth tracker. Data safety over availability.

---

## year_month Field Source

| Option | Description | Selected |
|--------|-------------|----------|
| Client provides year_month | Frontend date picker sends "YYYY-MM"; server validates format only | ✓ |
| Server computes from 'now' | Server generates current month using getFullYear()/getMonth(); requires TZ env var | |
| Hybrid | Client provides but server also has TZ env var for other date logic | |

**User's choice:** Client always provides year_month — server validates format (YYYY-MM) only  
**Notes:** User confirmed: single-user self-hosted app; deployer sets their own host timezone; app does not manage TZ. No `toISOString()` for month generation anywhere.

---

## Agent's Discretion

- TypeScript server project structure (tsconfig options, directory layout)
- Whether to use `server/src/models/` or create `shared/` directory
- Dev workflow convention

## Deferred Ideas

None — discussion stayed within phase scope.
