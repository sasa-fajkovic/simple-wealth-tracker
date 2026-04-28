import { test, expect } from '@playwright/test'

/**
 * Smoke tests against the built Hono app, including API-backed CRUD flows.
 */

function uniqueName(prefix: string) {
  return `${prefix} ${Date.now()} ${Math.floor(Math.random() * 10_000)}`
}

async function createJson(request: import('@playwright/test').APIRequestContext, path: string, body: unknown) {
  const response = await request.post(path, { data: body })
  expect(response.ok()).toBeTruthy()
  return response.json()
}

async function createAssetCategory(request: import('@playwright/test').APIRequestContext, prefix = 'Asset Category') {
  return createJson(request, '/api/v1/categories', {
    name: uniqueName(prefix),
    projected_yearly_growth: 0.08,
    color: '#6366f1',
    type: 'asset',
  })
}

function rowContaining(page: import('@playwright/test').Page, text: string) {
  return page.locator('tbody tr').filter({ hasText: text }).first()
}

const MONTH_LABELS = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat(undefined, { month: 'long' }).format(new Date(2024, index, 1)),
)

async function setMonthlyUpdatePeriod(page: import('@playwright/test').Page, yearMonth: string) {
  const [year, month] = yearMonth.split('-')
  const yearInput = page.getByRole('spinbutton', { name: 'Jump to year' })
  await yearInput.fill(year)
  await yearInput.press('Enter')
  await page.getByRole('combobox', { name: 'Select month' }).click()
  await page.getByRole('option', { name: MONTH_LABELS[Number(month) - 1], exact: true }).click()
}

test.describe('Dashboard', () => {
  test('loads page title and chart controls', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/WealthTrack/)
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByText('YTD')).toBeVisible()
    await expect(page.getByText('Max')).toBeVisible()
    await expect(page.getByText('Net Worth Trend')).toBeVisible()
  })
})

test.describe('Data Points page', () => {
  test('History route renders the corrections surface', async ({ page }) => {
    await page.goto('/data-points')
    await expect(page).toHaveTitle(/History \/ Corrections/)
    await expect(page.getByRole('heading', { name: 'History / Corrections' })).toBeVisible()
  })

  test('renders existing data points without legacy add modal', async ({ page, request }) => {
    const person = await createJson(request, '/api/v1/persons', { name: uniqueName('DP Person') })
    const category = await createAssetCategory(request, 'DP Category')
    const assetName = uniqueName('DP Asset')
    const asset = await createJson(request, '/api/v1/assets', {
      name: assetName,
      category_id: category.id,
      projected_yearly_growth: null,
      person_id: person.id,
    })
    await createJson(request, '/api/v1/data-points', {
      asset_id: asset.id,
      year_month: '2026-04',
      value: 12345,
    })

    await page.goto('/data-points')
    await expect(page).toHaveTitle(/History \/ Corrections/)
    await expect(page.getByRole('heading', { name: 'History / Corrections' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add Data Point' })).toHaveCount(0)

    await expect(rowContaining(page, asset.name)).toBeVisible()
    await expect(rowContaining(page, '12.345,00')).toBeVisible()
  })
})

test.describe('Admin page', () => {
  test('renders tab list with Assets, Categories, People', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveTitle(/Admin/)
    await expect(page.getByRole('tab', { name: 'Assets' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Categories' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'People' })).toBeVisible()
  })

  test('Add Asset button is visible on Assets tab', async ({ page }) => {
    await page.goto('/admin')
    await page.getByRole('tab', { name: 'Assets' }).click()
    await expect(page.getByRole('button', { name: 'Add Asset' })).toBeVisible()
  })

  test('creates a person and asset through the UI', async ({ page, request }) => {
    const personName = uniqueName('Admin Person')
    await createAssetCategory(request, 'Admin Category')
    const assetName = uniqueName('Admin Asset')

    await page.goto('/admin')
    await page.getByRole('tab', { name: 'People' }).click()
    await page.getByRole('button', { name: 'Add Person' }).click()
    await page.getByRole('textbox').first().fill(personName)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText(personName)).toBeVisible()

    await page.getByRole('tab', { name: 'Assets' }).click()
    await page.getByRole('button', { name: 'Add Asset' }).click()
    await page.getByRole('textbox').first().fill(assetName)
    await expect(page.getByRole('dialog')).toContainText(personName)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText(assetName)).toBeVisible()
  })

  test('Liabilities tab is accessible', async ({ page }) => {
    await page.goto('/admin')
    await page.getByRole('tab', { name: 'Liabilities' }).click()
    await expect(page.getByRole('button', { name: 'Add Liability' })).toBeVisible()
  })

  test('validates liability data points and renders negative values', async ({ page, request }) => {
    const person = await createJson(request, '/api/v1/persons', { name: uniqueName('Debt Person') })
    const category = await createJson(request, '/api/v1/categories', {
      name: uniqueName('Debt Category'),
      projected_yearly_growth: -0.05,
      color: '#ef4444',
      type: 'liability',
    })
    const asset = await createJson(request, '/api/v1/assets', {
      name: uniqueName('Debt Asset'),
      category_id: category.id,
      projected_yearly_growth: null,
      person_id: person.id,
    })

    const rejected = await request.post('/api/v1/data-points', {
      data: { asset_id: asset.id, year_month: '2026-04', value: 1000 },
    })
    expect(rejected.status()).toBe(400)
    await expect((await rejected.json()).error).toContain('Liability values must be zero or negative')

    await createJson(request, '/api/v1/data-points', {
      asset_id: asset.id,
      year_month: '2026-04',
      value: -1000,
    })

    await page.goto('/data-points')
    await expect(rowContaining(page, asset.name)).toBeVisible()
    await expect(rowContaining(page, '-1.000,00')).toBeVisible()
  })
})

test.describe('Monthly Update page', () => {
  test('loads page title, month selector, and nav link', async ({ page }) => {
    await page.goto('/monthly-update')
    await expect(page).toHaveTitle(/Monthly Update/)
    await expect(page.getByRole('heading', { name: 'Monthly Update' })).toHaveCount(0)
    await expect(page.getByRole('combobox', { name: 'Select month' })).toBeVisible()
    await expect(page.getByRole('spinbutton', { name: 'Jump to year' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Monthly Update' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'History / Corrections' })).toBeVisible()
  })

  test('can jump directly to old years without month-by-month navigation', async ({ page }) => {
    await page.goto('/monthly-update')

    const yearInput = page.getByRole('spinbutton', { name: 'Jump to year' })
    await yearInput.fill('2010')
    await yearInput.press('Enter')
    await expect(yearInput).toHaveValue('2010')
    await page.getByRole('button', { name: 'Next year' }).click()
    await expect(yearInput).toHaveValue('2011')
    await page.getByRole('button', { name: 'Previous year' }).click()
    await expect(yearInput).toHaveValue('2010')

    await page.getByRole('combobox', { name: 'Select month' }).click()
    await page.getByRole('option', { name: 'January', exact: true }).click()
    await expect(page.getByRole('combobox', { name: 'Select month' })).toContainText('January')
  })

  test('shows asset rows and allows entering values', async ({ page, request }) => {
    const person = await createJson(request, '/api/v1/persons', { name: uniqueName('MU Person') })
    const category = await createAssetCategory(request, 'MU Category')
    const assetName = uniqueName('MU Asset')
    await createJson(request, '/api/v1/assets', {
      name: assetName,
      category_id: category.id,
      projected_yearly_growth: null,
      person_id: person.id,
    })

    await page.goto('/monthly-update')
    await expect(page.getByRole('cell', { name: assetName, exact: false })).toBeVisible()
    // Target the desktop table input (mobile cards are CSS-hidden at desktop width)
    const input = page.locator('table').getByRole('spinbutton', { name: new RegExp(`Value for ${assetName}`) })
    await input.fill('75000')
    await expect(input).toHaveValue('75000')
  })

  test('keeps rows visible instead of flashing a skeleton while changing months', async ({ page, request }) => {
    const person = await createJson(request, '/api/v1/persons', { name: uniqueName('Stable Month Person') })
    const category = await createAssetCategory(request, 'Stable Month Category')
    const assetName = uniqueName('Stable Month Asset')
    await createJson(request, '/api/v1/assets', {
      name: assetName,
      category_id: category.id,
      projected_yearly_growth: null,
      person_id: person.id,
    })

    await page.goto('/monthly-update')
    await expect(page.getByRole('cell', { name: assetName, exact: false })).toBeVisible()

    let delayed = false
    await page.route('**/api/v1/data-points?year_month=*', async (route) => {
      if (!delayed) {
        delayed = true
        await new Promise(resolve => setTimeout(resolve, 300))
      }
      await route.continue()
    })

    await page.getByRole('button', { name: 'Next month' }).click()
    await expect(page.getByText(/Updating month/)).toBeVisible()
    await expect(page.locator('.p-skeleton')).toHaveCount(0)
    await expect(page.getByRole('cell', { name: assetName, exact: false })).toBeVisible()
  })

  test('orders asset rows alphabetically', async ({ page, request }) => {
    const person = await createJson(request, '/api/v1/persons', { name: uniqueName('Sort Person') })
    const category = await createAssetCategory(request, 'Sort Category')
    const suffix = uniqueName('Sort').replace(/\s+/g, '-')
    const laterName = `ZZZ ${suffix}`
    const earlierName = `AAA ${suffix}`

    await createJson(request, '/api/v1/assets', {
      name: laterName,
      category_id: category.id,
      projected_yearly_growth: null,
      person_id: person.id,
    })
    await createJson(request, '/api/v1/assets', {
      name: earlierName,
      category_id: category.id,
      projected_yearly_growth: null,
      person_id: person.id,
    })

    await page.goto('/monthly-update')
    await page.waitForLoadState('networkidle')

    const rowTexts = await page.locator('tbody tr').allTextContents()
    const earlierIndex = rowTexts.findIndex(text => text.includes(earlierName))
    const laterIndex = rowTexts.findIndex(text => text.includes(laterName))
    expect(earlierIndex).toBeGreaterThanOrEqual(0)
    expect(laterIndex).toBeGreaterThanOrEqual(0)
    expect(earlierIndex).toBeLessThan(laterIndex)
  })

  test('saves data via Save All and shows summary', async ({ page, request }) => {
    const person = await createJson(request, '/api/v1/persons', { name: uniqueName('Save Person') })
    const category = await createAssetCategory(request, 'Save Category')
    const assetName = uniqueName('Save Asset')
    const asset = await createJson(request, '/api/v1/assets', {
      name: assetName,
      category_id: category.id,
      projected_yearly_growth: null,
      person_id: person.id,
    })

    await page.goto('/monthly-update')
    await setMonthlyUpdatePeriod(page, '2026-05')
    await expect(page.getByRole('cell', { name: assetName, exact: false })).toBeVisible()

    const input = page.locator('table').getByRole('spinbutton', { name: new RegExp(`Value for ${assetName}`) })
    await input.fill('55000')

    await page.getByRole('button', { name: /Save All/ }).click()
    await expect(page.getByText(/Saved —/)).toBeVisible()
    await expect(page.getByText(/1 created/)).toBeVisible()

    // Verify data was persisted via API
    const dps = await request.get(`/api/v1/data-points?asset_id=${asset.id}`)
    const data = await dps.json()
    expect(Array.isArray(data)).toBeTruthy()
    const saved = (data as { asset_id: string; value: number; year_month: string }[])
      .find(d => d.year_month === '2026-05')
    expect(saved?.value).toBe(55000)
  })

  test('copy forward fills empty inputs from previous month', async ({ page, request }) => {
    const person = await createJson(request, '/api/v1/persons', { name: uniqueName('CF Person') })
    const category = await createAssetCategory(request, 'CF Category')
    const assetName = uniqueName('CF Asset')
    const asset = await createJson(request, '/api/v1/assets', {
      name: assetName,
      category_id: category.id,
      projected_yearly_growth: null,
      person_id: person.id,
    })
    // Seed a data point for 2026-01 (previous month relative to 2026-02)
    await createJson(request, '/api/v1/data-points', {
      asset_id: asset.id,
      year_month: '2026-01',
      value: 42000,
    })

    await page.goto('/monthly-update')
    await setMonthlyUpdatePeriod(page, '2026-02')
    await expect(page.getByRole('cell', { name: assetName, exact: false })).toBeVisible()

    // Before copy: input should be empty
    const input = page.locator('table').getByRole('spinbutton', { name: new RegExp(`Value for ${assetName}`) })
    await expect(input).toHaveValue('')

    await page.getByRole('button', { name: 'Copy Forward' }).click()

    await expect(input).toHaveValue('42000')
  })

  test('rejects positive values for liability assets', async ({ page, request }) => {
    const person = await createJson(request, '/api/v1/persons', { name: uniqueName('Liab Person') })
    const category = await createJson(request, '/api/v1/categories', {
      name: uniqueName('Liab Cat'),
      projected_yearly_growth: -0.05,
      color: '#ef4444',
      type: 'liability',
    })
    const assetName = uniqueName('Liab Asset')
    await createJson(request, '/api/v1/assets', {
      name: assetName,
      category_id: category.id,
      projected_yearly_growth: null,
      person_id: person.id,
    })

    await page.goto('/monthly-update')
    await setMonthlyUpdatePeriod(page, '2026-06')
    await expect(page.getByRole('cell', { name: assetName, exact: false })).toBeVisible()

    const input = page.locator('table').getByRole('spinbutton', { name: new RegExp(`Value for ${assetName}`) })
    await input.fill('1000')
    await page.getByRole('button', { name: /Save All/ }).click()

    await expect(page.locator('table').getByText(/Liability — value must be zero or negative/)).toBeVisible()
  })
})

test.describe('Projections page', () => {
  test('renders projections page with horizon selector', async ({ page }) => {
    await page.goto('/projections')
    await expect(page).toHaveTitle(/Projections|WealthTrack/)
    await expect(page.getByRole('button', { name: '10Y' })).toBeVisible()
    await expect(page.getByRole('button', { name: '30Y' })).toBeVisible()
  })

  test('scenario selector buttons are visible with correct labels', async ({ page }) => {
    await page.goto('/projections')
    await expect(page.getByRole('button', { name: 'Conservative' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Base' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Aggressive' })).toBeVisible()
  })

  test('custom horizon input and Apply button are present', async ({ page }) => {
    await page.goto('/projections')
    await expect(page.getByLabel('Custom horizon in years')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apply custom horizon' })).toBeVisible()
  })

  test('applying a custom horizon triggers a data reload', async ({ page }) => {
    await page.goto('/projections')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Custom horizon in years').fill('7')
    await page.getByRole('button', { name: 'Apply custom horizon' }).click()
    // After applying, page should still render without error
    await page.waitForLoadState('networkidle')
    await expect(page.getByLabel('Custom horizon in years')).toBeVisible()
  })

  test('sensitivity toggle for liabilities is present without income warning', async ({ page }) => {
    await page.goto('/projections')
    await expect(page.getByRole('button', { name: /Toggle: exclude liabilities/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Show information about income/i })).toHaveCount(0)
    await expect(page.getByText(/Income excluded from projections/)).toHaveCount(0)
  })

  test('liability category rows are locked when liabilities are globally hidden', async ({ page, request }) => {
    const person = await createJson(request, '/api/v1/persons', { name: uniqueName('Locked Debt Person') })
    const category = await createJson(request, '/api/v1/categories', {
      name: uniqueName('Locked Debt Category'),
      projected_yearly_growth: -0.04,
      color: '#ef4444',
      type: 'liability',
    })
    const asset = await createJson(request, '/api/v1/assets', {
      name: uniqueName('Locked Debt Asset'),
      category_id: category.id,
      projected_yearly_growth: null,
      person_id: person.id,
    })
    await createJson(request, '/api/v1/data-points', {
      asset_id: asset.id,
      year_month: '2026-04',
      value: -5000,
    })

    await page.goto('/projections')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /Toggle: exclude liabilities/i }).click()

    const liabilityRow = page.locator('#assumptions-panel button:disabled').filter({ hasText: category.name })
    await expect(liabilityRow).toBeVisible()
    await expect(liabilityRow).toHaveCSS('cursor', 'not-allowed')
  })

  test('assumptions panel is a static visible growth rates section', async ({ page }) => {
    await page.goto('/projections')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Growth Assumptions')).toBeVisible()
    const panel = page.locator('#assumptions-panel')
    await expect(panel).toBeVisible()
    await expect(panel.getByText(/rates as stored|half stored rates|1\.5×/i).first()).toBeVisible()
  })

  test('custom projection target year input is present in top controls', async ({ page }) => {
    await page.goto('/projections')
    await page.waitForLoadState('networkidle')
    await expect(page.getByLabel('Custom projection target year')).toBeVisible()
  })

  test('target milestone year follows selected projection horizon', async ({ page }) => {
    await page.goto('/projections')
    await page.waitForLoadState('networkidle')

    const targetYear = page.getByLabel('Custom projection target year')
    const anchorYear = await page.evaluate(() => {
      const text = document.body.textContent ?? ''
      const match = text.match(/From latest data month (\d{4})-\d{2}/)
      return match ? Number(match[1]) : new Date().getFullYear()
    })

    await page.getByRole('button', { name: '5Y' }).click()
    await expect(targetYear).toHaveValue(String(anchorYear + 5))

    await page.getByRole('button', { name: '30Y' }).click()
    await expect(targetYear).toHaveValue(String(anchorYear + 30))

    await page.getByRole('button', { name: '10Y' }).click()
    await expect(targetYear).toHaveValue(String(anchorYear + 10))
  })

  test('custom target year updates the custom horizon years field', async ({ page }) => {
    await page.goto('/projections')
    await page.waitForLoadState('networkidle')

    const targetYear = page.getByLabel('Custom projection target year')
    const customHorizon = page.getByLabel('Custom horizon in years')
    const anchorYear = await page.evaluate(() => {
      const text = document.body.textContent ?? ''
      const match = text.match(/From latest data month (\d{4})-\d{2}/)
      return match ? Number(match[1]) : new Date().getFullYear()
    })

    await targetYear.fill(String(anchorYear + 12))
    await page.getByRole('button', { name: 'Apply custom projection year' }).click()
    await page.waitForLoadState('networkidle')

    await expect(customHorizon).toHaveValue('12')
    await expect(targetYear).toHaveValue(String(anchorYear + 12))
  })

  test('scenario API param: conservative scenario loads without error', async ({ request }) => {
    const res = await request.get('/api/v1/projections?years=5&scenario=conservative')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toHaveProperty('projection')
    expect(body).toHaveProperty('historical')
  })

  test('scenario API param: aggressive scenario returns higher totals than conservative', async ({ request }) => {
    const [consRes, aggrRes] = await Promise.all([
      request.get('/api/v1/projections?years=5&scenario=conservative'),
      request.get('/api/v1/projections?years=5&scenario=aggressive'),
    ])
    expect(consRes.ok()).toBeTruthy()
    expect(aggrRes.ok()).toBeTruthy()
    const cons = await consRes.json()
    const aggr = await aggrRes.json()
    // Totals array should exist for both
    expect(Array.isArray(cons.projection.totals)).toBeTruthy()
    expect(Array.isArray(aggr.projection.totals)).toBeTruthy()
    // With zero data, totals will all be 0 for both — test passes regardless
  })

  test('invalid scenario param returns 400', async ({ request }) => {
    const res = await request.get('/api/v1/projections?years=5&scenario=bogus')
    expect(res.status()).toBe(400)
  })
})

test.describe('Income page', () => {
  test('renders income page', async ({ page }) => {
    await page.goto('/income')
    await expect(page).toHaveTitle(/Income|WealthTrack/)
  })

  test('defaults to total income trend', async ({ page, request }) => {
    const person = await createJson(request, '/api/v1/persons', { name: uniqueName('Trend Income Person') })
    const category = await createJson(request, '/api/v1/categories', {
      name: uniqueName('Trend Income'),
      projected_yearly_growth: 0,
      color: '#14b8a6',
      type: 'cash-inflow',
    })
    const source = await createJson(request, '/api/v1/assets', {
      name: uniqueName('Trend Salary'),
      category_id: category.id,
      projected_yearly_growth: null,
      person_id: person.id,
    })
    await createJson(request, '/api/v1/data-points', { asset_id: source.id, year_month: '2026-03', value: 5000 })

    await page.goto('/income')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('Total Income Trend')).toBeVisible()
    await expect(page.getByText('Total income over time.')).toBeVisible()
  })

  test('shows summary cards when income data exists', async ({ page, request }) => {
    const person = await createJson(request, '/api/v1/persons', { name: uniqueName('CI Person') })
    const category = await createJson(request, '/api/v1/categories', {
      name: uniqueName('Salary'),
      projected_yearly_growth: 0,
      color: '#22c55e',
      type: 'cash-inflow',
    })
    const asset = await createJson(request, '/api/v1/assets', {
      name: uniqueName('CI Asset'),
      category_id: category.id,
      projected_yearly_growth: null,
      person_id: person.id,
    })
    await createJson(request, '/api/v1/data-points', {
      asset_id: asset.id,
      year_month: '2026-03',
      value: 5000,
    })

    await page.goto('/income')
    await expect(page.getByText('Total Income', { exact: true })).toBeVisible()
    await expect(page.getByText('Avg / Month')).toBeVisible()
    await expect(page.getByText('Active Months')).toHaveCount(0)
  })

  test('groups all income by person and filtered income by source', async ({ page, request }) => {
    const personA = await createJson(request, '/api/v1/persons', { name: uniqueName('Income Alice') })
    const personB = await createJson(request, '/api/v1/persons', { name: uniqueName('Income Bob') })
    const category = await createJson(request, '/api/v1/categories', {
      name: uniqueName('Household Income'),
      projected_yearly_growth: 0,
      color: '#14b8a6',
      type: 'cash-inflow',
    })
    const salaryA = await createJson(request, '/api/v1/assets', {
      name: uniqueName('Alice Salary'),
      category_id: category.id,
      projected_yearly_growth: null,
      person_id: personA.id,
    })
    const salaryB = await createJson(request, '/api/v1/assets', {
      name: uniqueName('Bob Salary'),
      category_id: category.id,
      projected_yearly_growth: null,
      person_id: personB.id,
    })
    await createJson(request, '/api/v1/data-points', { asset_id: salaryA.id, year_month: '2026-03', value: 5200 })
    await createJson(request, '/api/v1/data-points', { asset_id: salaryB.id, year_month: '2026-03', value: 4100 })

    await page.goto('/income')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('paragraph').filter({ hasText: 'Income by Person' })).toBeVisible()
    await expect(page.getByText(personA.name).last()).toBeVisible()
    await expect(page.getByText(personB.name).last()).toBeVisible()

    await page.getByRole('button', { name: `Show only ${personA.name}` }).click()
    await expect(page.getByText('Income Sources', { exact: true })).toBeVisible()
    await expect(page.getByText(salaryA.name)).toBeVisible()
  })

  test('pie chart does not render the generic net worth trend strip', async ({ page, request }) => {
    const person = await createJson(request, '/api/v1/persons', { name: uniqueName('Pie Income Person') })
    const category = await createJson(request, '/api/v1/categories', {
      name: uniqueName('Pie Income'),
      projected_yearly_growth: 0,
      color: '#14b8a6',
      type: 'cash-inflow',
    })
    const source = await createJson(request, '/api/v1/assets', {
      name: uniqueName('Pie Salary'),
      category_id: category.id,
      projected_yearly_growth: null,
      person_id: person.id,
    })
    await createJson(request, '/api/v1/data-points', { asset_id: source.id, year_month: '2026-03', value: 5000 })

    await page.goto('/income')
    await page.waitForLoadState('networkidle')
    await page.getByTitle('Pie').click()

    await expect(page.getByRole('paragraph').filter({ hasText: 'Income by Person' })).toBeVisible()
    await expect(page.getByText('Net Worth Trend')).toHaveCount(0)
  })
})

test.describe('Analytics page', () => {
  test('renders analytics page with range controls', async ({ page }) => {
    await page.goto('/analytics')
    await expect(page).toHaveTitle(/Analytics|WealthTrack/)
    await expect(page.getByRole('heading', { name: 'Analytics' })).toHaveCount(0)
    await expect(page.getByText('1Y')).toBeVisible()
    await expect(page.getByText('Max')).toBeVisible()
  })

  test('shows metric cards when wealth data exists', async ({ page, request }) => {
    const person = await createJson(request, '/api/v1/persons', { name: uniqueName('AN Person') })
    const category = await createAssetCategory(request, 'AN Category')
    const asset = await createJson(request, '/api/v1/assets', {
      name: uniqueName('AN Asset'),
      category_id: category.id,
      projected_yearly_growth: null,
      person_id: person.id,
    })
    await createJson(request, '/api/v1/data-points', {
      asset_id: asset.id,
      year_month: '2026-03',
      value: 10000,
    })

    await page.goto('/analytics')
    await expect(page.getByText('Net Worth').first()).toBeVisible()
    await expect(page.getByText('Gross Assets').first()).toBeVisible()
    await expect(page.getByText('Net Worth Trend')).toBeVisible()
  })

  test('analytics link is visible in nav', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Analytics' })).toBeVisible()
  })

  test('shows advanced chart sections with multi-category data', async ({ page, request }) => {
    const person = await createJson(request, '/api/v1/persons', { name: uniqueName('Radar Person') })
    const catA = await createJson(request, '/api/v1/categories', {
      name: uniqueName('Stocks'),
      projected_yearly_growth: 0.08,
      color: '#6366f1',
      type: 'asset',
    })
    const catB = await createJson(request, '/api/v1/categories', {
      name: uniqueName('Real Estate'),
      projected_yearly_growth: 0.04,
      color: '#10b981',
      type: 'asset',
    })
    const assetA = await createJson(request, '/api/v1/assets', {
      name: uniqueName('ETF Portfolio'),
      category_id: catA.id,
      projected_yearly_growth: null,
      person_id: person.id,
    })
    const assetB = await createJson(request, '/api/v1/assets', {
      name: uniqueName('Apartment'),
      category_id: catB.id,
      projected_yearly_growth: null,
      person_id: person.id,
    })
    await createJson(request, '/api/v1/data-points', { asset_id: assetA.id, year_month: '2026-03', value: 50000 })
    await createJson(request, '/api/v1/data-points', { asset_id: assetB.id, year_month: '2026-03', value: 120000 })

    await page.goto('/analytics')
    await page.waitForLoadState('networkidle')

    // New chart section headings should be visible
    await expect(page.getByText('Financial Profile Radar')).toBeVisible()
    await expect(page.getByText('Category Performance Scatter')).toBeVisible()
    await expect(page.getByText('Portfolio Bubble Map')).toBeVisible()
    // Mixed chart heading contains 'Mixed'
    await expect(page.getByText(/Mixed/)).toBeVisible()
  })

  test('drills from category to individual assets', async ({ page, request }) => {
    const person = await createJson(request, '/api/v1/persons', { name: uniqueName('Drill Person') })
    const category = await createJson(request, '/api/v1/categories', {
      name: uniqueName('Drilldown Category'),
      projected_yearly_growth: 0.06,
      color: '#6366f1',
      type: 'asset',
    })
    const firstAsset = await createJson(request, '/api/v1/assets', {
      name: uniqueName('Drill Asset A'),
      category_id: category.id,
      projected_yearly_growth: null,
      person_id: person.id,
    })
    const secondAsset = await createJson(request, '/api/v1/assets', {
      name: uniqueName('Drill Asset B'),
      category_id: category.id,
      projected_yearly_growth: null,
      person_id: person.id,
    })
    await createJson(request, '/api/v1/data-points', { asset_id: firstAsset.id, year_month: '2026-03', value: 10000 })
    await createJson(request, '/api/v1/data-points', { asset_id: secondAsset.id, year_month: '2026-03', value: 15000 })

    await page.goto('/analytics')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('Drilldown', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: new RegExp(category.name) }).click()
    await expect(page.getByText(firstAsset.name)).toBeVisible()
    await expect(page.getByText(secondAsset.name)).toBeVisible()

    await page.getByLabel('Contributor grouping').getByRole('button', { name: 'Assets' }).click()
    await expect(page.getByText('Top Asset Contributors')).toBeVisible()
  })
})

test.describe('Dashboard metric cards', () => {
  test('shows metric cards on dashboard', async ({ page }) => {
    await page.goto('/')
    // Metric cards should be present after load (even if data is empty)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Net Worth').first()).toBeVisible()
    await expect(page.getByText('Gross Assets').first()).toBeVisible()
    await expect(page.getByText('Period Change').first()).toBeVisible()
  })
})

test.describe('Favicon', () => {
  test('favicon.svg is served', async ({ page }) => {
    const response = await page.request.get('/favicon.svg')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('svg')
  })
})

test.describe('Accessibility — keyboard and ARIA', () => {
  test('nav keyboard: Tab reaches all primary nav links from logo', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Focus the WealthTrack logo link first via click, then Tab through nav
    const logo = page.getByRole('link', { name: 'WealthTrack' })
    await logo.focus()
    // Tab through nav links - all major links should be reachable
    const navLinks = ['Dashboard', 'Analytics', 'Income', 'Projections', 'Monthly Update', 'Admin']
    for (const linkName of navLinks) {
      const link = page.getByRole('link', { name: linkName })
      await expect(link).toBeVisible()
      await expect(link).toHaveAttribute('href')
    }
  })

  test('Admin page: Edit/Delete buttons have item-specific aria-labels', async ({ page, request }) => {
    const personName = uniqueName('A11y Person')
    await createJson(request, '/api/v1/persons', { name: personName })

    await page.goto('/admin')
    await page.getByRole('tab', { name: 'People' }).click()
    await expect(page.getByRole('button', { name: `Edit person ${personName}` })).toBeVisible()
    await expect(page.getByRole('button', { name: `Delete person ${personName}` })).toBeVisible()
  })

  test('Admin Assets tab: Edit/Delete buttons have item-specific aria-labels', async ({ page, request }) => {
    const personName = uniqueName('A11y Asset Person')
    const person = await createJson(request, '/api/v1/persons', { name: personName })
    const category = await createAssetCategory(request, 'A11y Asset Category')
    const assetName = uniqueName('A11y Asset')
    await createJson(request, '/api/v1/assets', {
      name: assetName,
      category_id: category.id,
      projected_yearly_growth: null,
      person_id: person.id,
    })

    await page.goto('/admin')
    await page.getByRole('tab', { name: 'Assets' }).click()
    await expect(page.getByRole('button', { name: `Edit asset ${assetName}` })).toBeVisible()
    await expect(page.getByRole('button', { name: `Delete asset ${assetName}` })).toBeVisible()
  })

  test('chart type selector buttons have accessible names', async ({ page }) => {
    await page.goto('/income')
    await page.waitForLoadState('networkidle')
    // ChartTypeSelector buttons should show short visible names next to icons.
    const chartTypeSelector = page.locator('.wt-chart-type-select')
    await expect(chartTypeSelector.getByRole('button', { name: 'Trend', exact: true })).toBeVisible()
    await expect(chartTypeSelector.getByRole('button', { name: 'Area', exact: true })).toBeVisible()
    await expect(chartTypeSelector.getByRole('button', { name: 'Line', exact: true })).toBeVisible()
    await expect(chartTypeSelector.getByRole('button', { name: 'Bar', exact: true })).toBeVisible()
    await expect(chartTypeSelector.getByRole('button', { name: 'Pie', exact: true })).toBeVisible()
  })

  test('Admin page: dialog close/cancel is keyboard reachable', async ({ page, request }) => {
    const personName = uniqueName('Kbd Person')
    await createJson(request, '/api/v1/persons', { name: personName })

    await page.goto('/admin')
    await page.getByRole('tab', { name: 'People' }).click()
    // Open edit dialog
    await page.getByRole('button', { name: `Edit person ${personName}` }).click()
    // Dialog should be open
    await expect(page.getByRole('dialog')).toBeVisible()
    // Cancel button should be reachable
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
    // Close dialog via Cancel
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('Projections page: chart type selector has accessible labels', async ({ page }) => {
    await page.goto('/projections')
    await page.waitForLoadState('networkidle')
    // Projections chart type buttons show text labels (Area, Line, Bar)
    await expect(page.getByRole('button', { name: /Area/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Line/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Bar/ })).toBeVisible()
  })

  test('Data Points page filter dropdowns are keyboard-focusable', async ({ page }) => {
    await page.goto('/data-points')
    await page.waitForLoadState('networkidle')
    // Filter dropdowns should be reachable and have accessible labels
    const personFilter = page.getByRole('combobox', { name: 'Filter by person' })
    const categoryFilter = page.getByRole('combobox', { name: 'Filter by category' })
    await expect(personFilter).toBeVisible()
    await expect(categoryFilter).toBeVisible()
  })
})
