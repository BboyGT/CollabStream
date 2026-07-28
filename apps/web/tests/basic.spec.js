import { test, expect } from '@playwright/test'

test('landing loads and primary CTA is visible', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: /start for free/i }).first()).toBeVisible()
})

test('guest not found shows error', async ({ page }) => {
  await page.goto('/room/invalid-session?token=bad')
  await expect(page.getByText(/session not found/i)).toBeVisible()
})

test('public join page asks guests for a name without requiring sign-in', async ({ page }) => {
  await page.goto('/join/123456')
  await expect(page.getByRole('heading', { name: /join collabstream/i })).toBeVisible()
  await expect(page.getByPlaceholder(/your name or nickname/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /join session/i })).toBeVisible()
})

test('session creation requires auth', async ({ request }) => {
  const res = await request.post('http://localhost:3001/session', {
    data: { sessionName: 'E2E session' },
  })
  expect(res.status()).toBe(401)
})
