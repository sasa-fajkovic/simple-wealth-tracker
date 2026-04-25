# WealthTrack

## What This Is

A self-hosted, single-household web application for tracking and visualising net worth growth over time. The user manually adds monthly value snapshots per asset. The app renders historical wealth charts by category and projects future growth using configurable annual growth rates.

## Core Value

See your full net worth picture — past and future — in one glance, with zero friction to add new data.

## Requirements

### Validated

- ✓ Project scaffold (Node.js server + React/TypeScript frontend) — existing

### Active

- [ ] Data models + YAML storage layer with mutex-safe reads/writes
- [ ] CRUD API for categories, assets, and data points
- [ ] Summary aggregation endpoint with LOCF gap-filling
- [ ] Projections calculation endpoint (compound monthly growth)
- [ ] Frontend: TypeScript API client + shared types
- [ ] Frontend: Admin panel (Data Points, Assets, Categories tabs)
- [ ] Frontend: Dashboard chart with range selector and summary cards
- [ ] Frontend: Projections screen with combined historical + projected chart
- [ ] Frontend: Chart type selector (Stacked Area / Line / Stacked Bar) persisted per slot
- [ ] Docker multi-stage build + docker-compose + README

### Out of Scope

- Authentication / login — single household, trust the network
- Multi-currency — EUR only, keeps aggregation simple
- Automatic data import (v1) — manual entry only; AI import is a separate future feature
- Multiple user accounts — single household scope
- Mobile app — web only, responsive design is enough
- Database migrations — flat YAML file, schema is flexible

## Context

- **Spec source**: Full implementation plan in Notion (https://www.notion.so/346f8dd9931b81298f13d37294e844ab)
- **Task tracking**: ClickUp list "WealthTrack App" (901217299498) — 32 tasks, task 1 done
- **Existing scaffold**: React + TypeScript frontend (Vite, Tailwind, Recharts) is set up; Go entry point will be replaced with Node.js
- **Storage**: Single `database.yaml` file. Read entirely on each request, written back atomically. One data point per asset per month used for charting (latest `updated_at` wins); others preserved.
- **Gap handling (LOCF)**: If a month has no data for an asset, carry forward the last known value. If no prior value, use 0.
- **Projection math**: Monthly compound rate = `(1 + yearly_rate)^(1/12) - 1`. Asset-level growth rate overrides category default.
- **Planned future features**: AI-powered file import (CSV/JSON/PDF via LLM), household members + income tracking — both out of scope for v1.

## Constraints

- **Tech stack**: Node.js backend (replacing Go scaffold), React + TypeScript frontend, YAML flat-file storage — decided to match JS/TS ecosystem end-to-end
- **Deployment**: Docker single-container, multi-stage build (Node build stage → distroless/slim runtime)
- **Data**: No external database; all data in a single YAML file mounted as a Docker volume
- **Scope**: Single household, no auth, EUR-only — keeps complexity minimal

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Node.js over Go for backend | User preference for JS/TS ecosystem across full stack | — Pending |
| Flat YAML file over SQLite/DB | Zero-setup self-hosting; single household keeps dataset small | — Pending |
| LOCF for missing months | Prevents misleading gaps in chart; standard time-series practice | — Pending |
| Latest `updated_at` wins per month | Allows corrections without deleting history | — Pending |

---

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-22 after initialization*
