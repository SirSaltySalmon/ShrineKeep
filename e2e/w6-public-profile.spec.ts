import { expect, test } from "@playwright/test"

const ownerId = process.env.W6_PUBLIC_OWNER_ID ?? "030d9e3e-3cd2-4316-a149-7cfec9195a50"
const profilePath = `/users/${ownerId}`

test("guest profile keeps both tabs and fetches each surface only when opened", async ({ page }) => {
  const boxes: string[] = []
  const wishlist: string[] = []
  page.on("request", (request) => {
    const url = request.url()
    if (!url.includes("/api/public/users/")) return
    if (url.includes("/wishlist")) wishlist.push(url)
    else if (url.includes("/boxes")) boxes.push(url)
  })

  await page.goto(profilePath)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Showcase" })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Wishlist" })).toBeVisible()
  await expect(page.getByRole("navigation").getByRole("link", { name: "Sign in" })).toBeVisible()
  await expect(page.locator("body")).not.toContainText(/not public|unpublished/i)
  await expect.poll(() => boxes.length).toBeGreaterThan(0)
  expect(wishlist).toEqual([])

  await page.getByRole("tab", { name: "Wishlist" }).click()
  await expect.poll(() => wishlist.length).toBeGreaterThan(0)
})

test("visiting a profile does not mutate the document theme", async ({ page }) => {
  const mutations: string[] = []
  page.on("request", (request) => {
    const method = request.method()
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return
    mutations.push(`${method} ${request.url()}`)
  })

  await page.goto("/landing")
  await expect(page.getByRole("link", { name: "Sign Up" })).toBeVisible()
  const before = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute("data-theme"),
    className: document.documentElement.className,
    background: getComputedStyle(document.documentElement).getPropertyValue("--background").trim(),
  }))

  await page.goto(profilePath)
  await expect(page.getByRole("tab", { name: "Showcase" })).toBeVisible()
  const onProfile = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute("data-theme"),
    className: document.documentElement.className,
    background: getComputedStyle(document.documentElement).getPropertyValue("--background").trim(),
  }))
  expect(onProfile.theme).toBe(before.theme)
  expect(onProfile.className).toBe(before.className)

  await page.goBack()
  await expect(page).toHaveURL(/\/landing/)
  await expect(page.getByRole("link", { name: "Sign Up" })).toBeVisible()
  const after = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute("data-theme"),
    className: document.documentElement.className,
    background: getComputedStyle(document.documentElement).getPropertyValue("--background").trim(),
  }))
  expect(after).toEqual(before)
  expect(mutations.filter((entry) => entry.includes("/api/"))).toEqual([])
})

test("owner preview matches a signed-out guest wishlist", async ({ browser }) => {
  const email = process.env.E2E_AUTH_EMAIL
  const password = process.env.E2E_AUTH_PASSWORD
  test.skip(!email || !password, "E2E_AUTH_EMAIL and E2E_AUTH_PASSWORD are required")

  const ownerContext = await browser.newContext()
  const ownerPage = await ownerContext.newPage()
  await ownerPage.goto("/auth/login")
  await ownerPage.getByLabel(/email/i).fill(email!)
  await ownerPage.getByLabel(/password/i).fill(password!)
  await ownerPage.getByRole("button", { name: /log in/i }).click()
  await expect(ownerPage).toHaveURL(/\/dashboard/)
  const ownerId = await ownerPage.evaluate(async () => {
    const response = await fetch("/api/settings")
    const body = await response.json() as { user_id?: string }
    return body.user_id ?? null
  })
  expect(ownerId).toMatch(/^[0-9a-f-]{36}$/i)

  await ownerPage.goto("/wishlist")
  await ownerPage.getByRole("button", { name: "Preview public wishlist" }).click()
  await expect(ownerPage.getByRole("heading", { name: "Public preview" })).toBeVisible()
  const preview = await ownerPage.evaluate(async () => {
    const response = await fetch("/api/wishlist/preview")
    return response.json() as Promise<{ entries: Array<{ name: string; expectedPrice: number | null }> }>
  })

  const guestContext = await browser.newContext()
  const guestPage = await guestContext.newPage()
  await guestPage.goto(`/users/${ownerId}?tab=wishlist`)
  await expect(guestPage.getByRole("tab", { name: "Wishlist" })).toBeVisible()
  await expect(guestPage.getByRole("navigation").getByRole("link", { name: "Sign in" })).toBeVisible()
  const guest = await guestPage.evaluate(async (id) => {
    const response = await fetch(`/api/public/users/${id}/wishlist`)
    return response.json() as Promise<{ entries: Array<{ name: string; expectedPrice: number | null }> }>
  }, ownerId)

  expect(preview.entries.map((entry) => [entry.name, entry.expectedPrice]))
    .toEqual(guest.entries.map((entry) => [entry.name, entry.expectedPrice]))
  await ownerContext.close()
  await guestContext.close()
})

