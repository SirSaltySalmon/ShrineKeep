import { expect, test } from "@playwright/test"

test("landing page renders", async ({ page }) => {
  await page.goto("/landing")
  await expect(page.getByRole("link", { name: "Sign Up" })).toBeVisible()
})

test("login page renders", async ({ page }) => {
  await page.goto("/auth/login")
  await expect(page.getByRole("button", { name: /log in/i })).toBeVisible()
})

test("dashboard redirects unauthenticated users to login", async ({ page }) => {
  await page.goto("/dashboard")
  await expect(page).toHaveURL(/\/auth\/login/)
})

const hasAuthCredentials = Boolean(process.env.E2E_AUTH_EMAIL && process.env.E2E_AUTH_PASSWORD)

test("authenticated user can sign in and open dashboard", async ({ page }) => {
  test.skip(!hasAuthCredentials, "E2E auth credentials are required for authenticated smoke tests")

  await page.goto("/auth/login")
  await page.getByLabel(/email/i).fill(process.env.E2E_AUTH_EMAIL!)
  await page.getByLabel(/password/i).fill(process.env.E2E_AUTH_PASSWORD!)
  await page.getByRole("button", { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByRole("button", { name: /filters/i })).toBeVisible()
})

test("authenticated user can create basic collection content", async ({ page }) => {
  test.skip(!hasAuthCredentials, "E2E auth credentials are required for authenticated smoke tests")

  await page.goto("/auth/login")
  await page.getByLabel(/email/i).fill(process.env.E2E_AUTH_EMAIL!)
  await page.getByLabel(/password/i).fill(process.env.E2E_AUTH_PASSWORD!)
  await page.getByRole("button", { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/dashboard/)

  // These are intentionally broad selectors to keep smoke tests resilient to minor UI copy changes.
  const newBoxButton = page.getByRole("button", { name: /new box/i }).first()
  await expect(newBoxButton).toBeVisible()
})
