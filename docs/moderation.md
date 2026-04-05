# Moderation: ban user

Server-only workflow to ban an account for terms violations: cancel Stripe Pro when applicable, email the user (including Pro cancellation wording when relevant), delete their objects in Supabase Storage, then delete the Auth user so PostgreSQL `ON DELETE CASCADE` removes all `public.*` data (including wishlist share tokens).

Treat `MODERATION_SECRET` like a root password: never commit it. The moderation UI requires it in the URL (see below), which can appear in browser history and access logs—use only on trusted networks.

## Web GUI (`/moderation`)

1. Open **`/moderation?key=<MODERATION_SECRET>`** (same value as your env secret). Use `encodeURIComponent(secret)` if the secret contains `&`, `?`, `#`, spaces, or non-ASCII characters. The server checks `key` with a constant-time compare; if it does not match, the page shows **Unauthorized.** If it matches, the form is shown and the moderation secret field is prefilled.
2. Choose **API target**: same site, production, localhost, or a custom base URL; enter **Auth user UUID**; **Fetch user** to load email, username, and Pro status; check the confirmation box; **Ban user permanently**.

The GUI sends the secret from your browser to the API you selected (visible in DevTools on that machine). Optional **Remember in this browser** writes the secret to `sessionStorage` when enabled; if you opened via `?key=…`, the field is already prefilled and `sessionStorage` is not used to restore a previous value on load.

**Note:** Visiting `/moderation` without a correct `?key=` shows Unauthorized; refreshing without `key` in the URL also shows Unauthorized.

**Cross-origin:** To use a local tab (`http://localhost:3000`) against **production** APIs, production must allow your origin, e.g. `MODERATION_CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000`. Same-origin use does not need CORS.

## Lookup endpoint

- **URL**: `POST /api/moderation/lookup-user`
- **Auth**: Same headers as ban (`Authorization: Bearer` or `x-moderation-secret`).
- **Body**: `{ "user_id": "<uuid>" }`
- **Response**: Auth email, profile fields, and whether a Pro subscription row exists (for verification before ban).

## Ban endpoint

- **URL**: `POST /api/moderation/ban-user`
- **Headers** (either):
  - `Authorization: Bearer <MODERATION_SECRET>`
  - `x-moderation-secret: <MODERATION_SECRET>`
- **Body** (JSON):

```json
{ "user_id": "<uuid>" }
```

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `MODERATION_SECRET` | Yes | Shared secret for the endpoint; use a long random string. |
| `RESEND_API_KEY` | Yes | Resend API key for ban notification email. |
| `MODERATION_EMAIL_FROM` | Yes | Verified sender in Resend (e.g. `ShrineKeep <noreply@yourdomain.com>`). |
| `NEXT_PUBLIC_APP_URL` | No | Used to derive the app name in the email (hostname); defaults to “ShrineKeep” if unset. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role (already required for server features). |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL. |
| `STRIPE_SECRET_KEY` | Yes | Required for the Stripe cancellation step (same as checkout/webhooks). |
| `MODERATION_CORS_ORIGINS` | No | Comma-separated `Origin` values allowed for browser `fetch` to moderation APIs from another host (e.g. local GUI → production). |

Copy from [`.env.local.example`](../.env.local.example) and fill values locally; configure the same on your host (e.g. Vercel).

## Order of operations

1. Load the Auth user by `user_id`; require a non-empty `email`.
2. **Stripe** — Read `public.subscriptions` for that user. If `stripe_subscription_id` is set, retrieve the subscription and **immediately cancel** it when Stripe status is still billable (`active`, `trialing`, `past_due`, `unpaid`, `incomplete`, `paused`). If the subscription is already ended in Stripe, no API cancel call is needed. If Stripe returns an error, the handler stops **before** email, storage, or Auth delete.
3. **Email** — Send the ban message via Resend. If the user had a `stripe_subscription_id` in the database (Pro record), the email adds a short paragraph that **an active Pro subscription has been cancelled** and they will not be charged again for Pro. If Resend fails, the handler stops **before** storage purge and Auth delete (the account and files remain; Stripe may already be canceled — resolve manually if needed).
4. **Storage** — Remove all objects under `item-photos/{user_id}/items/` and `avatars/{user_id}/` (recursive listing). Supabase does not delete storage when DB rows are removed.
5. **Auth** — `auth.admin.deleteUser(user_id)` so `public.users` and dependent rows (including `user_settings.wishlist_share_token`) cascade away. Public wishlist URLs then return 404.

## Stripe webhooks after ban

After Auth deletion, `public.subscriptions` is gone. Stripe may still send `customer.subscription.updated` / `deleted`. The webhook handler updates by `stripe_customer_id` or `stripe_subscription_id`; if no row matches, it logs and continues without failing the webhook. No change required for normal operation.

## Response shape

Success (`200`):

```json
{
  "ok": true,
  "email_sent": true,
  "include_subscription_cancelled_notice": false,
  "deleted_storage": { "item_photos": 0, "avatars": 1 }
}
```

Common errors: `401` wrong/missing secret, `400` bad `user_id` or user without email, `404` unknown user, `502` Stripe or Resend failure, `500` storage or Auth delete failure (response may include `partial` for manual follow-up).

## Example (curl)

```bash
curl -sS -X POST "$NEXT_PUBLIC_APP_URL/api/moderation/ban-user" \
  -H "Authorization: Bearer $MODERATION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"00000000-0000-4000-8000-000000000000"}'
```

## Data map checklist (extend when adding features)

When you add user-owned data, update this list and the purge logic if needed.

**PostgreSQL** — tables that reference `public.users(id)` with `ON DELETE CASCADE` in [supabase/schema.sql](../supabase/schema.sql): `users`, `boxes`, `items`, `tags`, `friendships`, `wish_lists`, `user_settings` (wishlist share token), `subscriptions`, plus dependent rows (`photos`, `item_tags`, `value_history`, `wish_list_items`) via FK chains.

**Storage**

- Bucket `item-photos`: prefix `{user_id}/items/`
- Bucket `avatars`: prefix `{user_id}/`

**External**

- **Stripe**: subscription canceled by moderation; optional future hardening: `customers.del` for GDPR-style cleanup in Stripe.

## Resend

Verify your sending domain in the Resend dashboard before production use. Ban emails will not deliver if `MODERATION_EMAIL_FROM` uses an unverified domain.
