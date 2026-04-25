# Feature Landscape: Personal Net Worth / Wealth Tracking Apps

**Domain:** Self-hosted personal net worth / wealth tracker
**Researched:** 2025-01
**Overall confidence:** HIGH (cross-referenced against: Ghostfolio, clearfolio, Maybe Finance v0.6.0, YAFFA, Firefly III, Finary, Awesome-Selfhosted list)

---

## Methodology

Benchmarked against the closest analogues to WealthTrack:

| App | Why Relevant |
|-----|-------------|
| **clearfolio.net** | Near-identical concept: household snapshots, per-entity periodic values, trend chart. Self-hosted. |
| **Ghostfolio** | Most-starred self-hosted wealth tracker (~5k Docker pulls); sets UI/UX expectations |
| **Maybe Finance** | OSS personal finance app; final feature list reveals what real users actually shipped |
| **YAFFA** | Self-hosted, long-term financial planning focus; FIRE community app |
| **Firefly III** | Most popular self-hosted personal finance (~2k GH stars); sets community baseline |

---

## Table Stakes

Features users expect. Absence makes the product feel incomplete or broken.

| Feature | Why Expected | Complexity | Status in Spec |
|---------|--------------|------------|----------------|
| Total net worth summary card | The entire point — must be the first thing you see | Low | ✅ summary cards |
| Historical net worth chart (line or area) | The core value prop; every tracker has this | Low | ✅ stacked area + line |
| Asset categorisation (stocks, cash, real estate, crypto) | Mental model of wealth is always "buckets" | Low | ✅ configurable categories |
| CRUD for assets and categories | Can't use app without it | Low | ✅ admin panel |
| Manual data entry per asset per period | Core workflow for manual trackers | Low | ✅ data points |
| Time range selector | No one wants "all time since 2010" by default | Low | ✅ YTD/6M/1Y/2Y/3Y/5Y/10Y/Max |
| Gap handling / LOCF | Without this, chart shows misleading drops to zero for any skipped month | Low | ✅ LOCF |
| Asset composition breakdown | "How is my wealth split?" is question #2 after "what's my total?" | Low | ✅ stacked area/bar implicitly shows this |
| Month-over-month delta display | Users expect to see "+€3,200 (+2.1%) this month" on summary cards — not just the total | Low | ⚠️ **Not explicit in spec** — summary cards must include delta |
| Period-over-period change (e.g., YTD gain) | Standard in every tracker; aligns with time range selector | Low | ⚠️ **Not explicit in spec** |
| Data persistence / backup | Self-hosted = user owns data, user expects to be able to retrieve it | Low | ✅ YAML volume mount |
| Responsive design | Used on tablet/phone too | Low | ✅ spec mentions it |

---

## Differentiators

Features that distinguish WealthTrack from a spreadsheet or generic finance app. Not expected, but high value.

| Feature | Value Proposition | Complexity | Status in Spec |
|---------|-------------------|------------|----------------|
| **Projections with per-asset growth rates** | Answers "where will I be in 10 years?" — most trackers don't do this | Medium | ✅ compound monthly growth, asset-level override |
| **Multiple projection horizons (5/10/20/30Y)** | Long-term wealth planning is the FIRE community's primary use case | Low | ✅ |
| **Combined historical + projected chart** | Rare: seeing past and future on one axis is uniquely motivating | Medium | ✅ projections screen |
| **Chart type switching (area/line/bar)** | Stacked area = composition over time; line = total trend; bar = period comparison — different questions answered | Low | ✅ persisted per slot |
| **Switchable chart type persistence** | Remembering user preference feels polished; most apps don't bother | Low | ✅ persisted per slot |
| **LOCF as explicit UX feature** | Most spreadsheet users have `#N/A` hell; this removes friction | Low | ✅ |
| **Zero-friction Docker deployment** | Self-hosted users value this above almost everything else | Low | ✅ single container, YAML storage |
| **Latest updated_at wins (upsert semantics)** | Allows corrections without deleting history — good UX for corrections and backfill | Low | ✅ |
| **YAML flat-file storage** | Zero migration headaches; data is human-readable; easy backup via `cp` | Low | ✅ |
| **Category-level default growth rates with per-asset override** | Nuanced: equity/RE/crypto grow differently; one rate doesn't fit all | Low | ✅ |

---

## Anti-Features

Features to explicitly NOT build in v1. Justified exclusions, not gaps.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Automatic bank / brokerage import** | API auth complexity, bank-specific connectors, credential risk, maintenance burden; breaks "simple" promise | ✅ Defer to v2 AI import (CSV/PDF via LLM is better UX anyway) |
| **Multi-currency support** | FX rates, conversion logic, historical rate storage, display complexity; adds ~30% scope | ✅ EUR-only for v1; single-currency assumption simplifies every aggregation |
| **Transaction-level tracking** (individual buys/sells) | Different product category (budgeting app, not net worth tracker); YAFFA/Firefly III serve that need | Snapshot-level values are sufficient and much lower friction |
| **Live price feeds** (Yahoo Finance, CoinGecko) | API rate limits, key management, external dependency, stale data handling; adds brittleness | Manual entry keeps it simple; user knows their asset values |
| **Authentication / login** | Single household, trust the network is the right call for a self-hosted private tool | ✅ No auth in v1 |
| **Multiple user accounts** | Dramatically increases data model complexity (ownership, permissions, aggregation) | ✅ Single household scope |
| **Mobile native app** | React responsive web is sufficient for data entry; native adds enormous scope | ✅ Responsive web only |
| **Notifications / alerts** (e.g., "net worth hit €500k!") | Out of scope for v1; adds background worker complexity | Nice v2 feature |
| **Tax reporting / lot tracking** | Accounting-grade complexity; different user persona (tax software users) | Out of scope entirely |
| **Liability tracking (v1 concern — see below)** | See ⚠️ note in Gaps section | Workaround available |

---

## Feature Dependencies

```
Admin CRUD (categories) → Admin CRUD (assets) → Admin CRUD (data points)
                                                         ↓
Data points (raw) → LOCF gap-fill → Summary aggregation → Dashboard chart
                                                         ↓
Summary aggregation → Projections calculation → Projections chart

Time range selector → both Dashboard chart + Summary cards
Chart type switcher → Dashboard chart only
Projection horizon selector → Projections chart only
```

---

## ⚠️ Scope Validation: Findings & Challenges

### ✅ LOCF — Validated
Standard practice in every serious time-series wealth tracker. All comparable apps either do it implicitly (spreadsheet formula) or explicitly. clearfolio calls it "upsert semantics". Correct call.

### ✅ Latest `updated_at` wins — Validated
clearfolio uses exact same pattern ("upsert semantics" for snapshots). Allows backfill corrections without deleting history. Correct call.

### ✅ Time range selector (YTD, 6M, 1Y, 2Y, 3Y, 5Y, 10Y, Max) — Validated
Ghostfolio uses: Today, WTD, MTD, YTD, 1Y, 5Y, Max. WealthTrack's ranges are slightly longer-horizon (appropriate for wealth tracking vs portfolio trading). The 2Y and 3Y ranges add useful intermediate points. Correct call.

### ✅ Projection horizons (5Y, 10Y, 20Y, 30Y) — Validated
30Y is specifically useful for retirement planning (the primary FIRE use case). Maybe Finance had a "scenario planning" feature as their last-mile differentiator before pivoting. Strong call — rare in open source trackers.

### ⚠️ LIABILITIES — Gap in Spec
**What:** Net worth = assets − liabilities. The spec only mentions assets (stocks, real estate, crypto, cash). A mortgage, car loan, or credit card balance is a liability that reduces net worth.

**Why it matters:** clearfolio has separate Liability entities. Maybe Finance has a "personal balance sheet" as a dashboard component. If a user has a €300k mortgage, their net worth chart without it is misleading.

**Mitigation options (pick one):**
1. **Category-as-liability** — Allow a category to be typed as "liability" (negative in aggregation). Growth rate becomes paydown rate. Complexity: Low. 
2. **Negative value assets** — Users manually enter their mortgage balance as a negative number under a "Debts" category. Works with current data model. Complexity: Zero (convention only).
3. **Explicit liabilities entity** — Separate CRUD and chart layer. Complexity: High. Defer to v2.

**Recommendation:** Document option 2 as supported convention in v1 (user enters negative values under a "Liabilities" category). Flag option 1 as v2 schema addition.

### ⚠️ Summary Cards — Delta Not Explicit in Spec
**What:** The spec mentions "summary cards" but doesn't specify content. Users in every comparable app expect:
- Total net worth (current value)
- Change since last month (€ and %)
- Change since start of year (YTD)
- Change since range start (for selected time range)

**Recommendation:** Explicitly specify summary card content as part of the dashboard requirement. These are table stakes, not differentiators.

### ✅ No Auth — Validated for Self-Hosted Single Household
This is the correct call for the use case. YAFFA, clearfolio, and Ghostfolio all support auth — but for a household-only, local-network deployment, auth adds friction without benefit. The "trust the network" model is standard in self-hosted tools (Grafana, Home Assistant, etc.).

### ✅ EUR Only — Validated for v1
Multi-currency in clearfolio adds significant complexity (member-level currency, aggregation, FX rates). EUR-only is correct for v1 scope control.

### ✅ Manual Entry Only — Validated
Both YAFFA and clearfolio explicitly defend manual entry as a feature, not a limitation: it forces conscious engagement with your finances. Live price feeds add external dependencies. AI import (v2) is a better UX path than connector APIs.

---

## MVP Recommendation

Prioritise in this order:

1. **Data model + storage** (categories → assets → data points)
2. **CRUD admin panel** (unlocks all other features)
3. **Summary aggregation with LOCF** (produces the data the dashboard needs)
4. **Dashboard chart** with time range selector + chart type switcher
5. **Summary cards** with current total + delta (month-over-month, YTD) — **add delta explicitly**
6. **Projections** (compound growth chart + horizon selector)
7. **Docker packaging**

**Defer:**
- Liabilities (v2, when schema can absorb it cleanly)
- Data export (v2, but consider adding a simple JSON dump endpoint for safety)
- Dark mode (v2 / low priority)

---

## Sources

| Source | Confidence | Notes |
|--------|-----------|-------|
| [clearfolio.net README](https://github.com/gcaton/clearfolio.net) | HIGH | Near-identical use case: household snapshots, trend charts, member views |
| [Ghostfolio README](https://github.com/ghostfolio/ghostfolio) | HIGH | Most prominent self-hosted wealth manager |
| [Maybe Finance v0.6.0 release](https://github.com/maybe-finance/maybe/releases/tag/v0.6.0) | HIGH | Final shipped feature set of serious OSS personal finance app |
| [YAFFA README](https://github.com/kantorge/yaffa) | HIGH | Self-hosted long-term planning app; feature anti-patterns section valuable |
| [Awesome-Selfhosted finance list](https://github.com/awesome-selfhosted/awesome-selfhosted) | HIGH | Comprehensive enumeration of self-hosted finance tools |
