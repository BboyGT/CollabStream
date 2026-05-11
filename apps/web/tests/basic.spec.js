import { test, expect } from '@playwright/test'

test('landing loads and start button is visible', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /start session/i })).toBeVisible()
})

test('guest not found shows error', async ({ page }) => {
  await page.goto('/room/invalid-session?token=bad')
  await expect(page.getByText(/session not found/i)).toBeVisible()
})

test('can create session via API and open host/guest pages', async ({ request, page, context }) => {
  const res = await request.post('http://localhost:3001/session')
  const data = await res.json()
  const { sessionId, token } = data
  await page.goto(`/room/${sessionId}/host?token=${token}`)
  const guest = await context.newPage()
  await guest.goto(`/room/${sessionId}?token=${token}`)
  await expect(page.getByText(/CollabStream/i)).toBeVisible()
  await expect(guest.getByText(/CollabStream/i)).toBeVisible()
})
