# Moderation: ban user

Server workflow to ban an account for terms violations: cancel Stripe Pro when applicable, email the user (including Pro cancellation wording when relevant), delete their objects in Supabase Storage, then delete the Auth user so PostgreSQL `ON DELETE CASCADE` removes all `public.*` data (including wishlist share tokens).

## Who can moderate

Access is **not** a shared password in the URL. It requires:

1. A normal **Supabase Auth session** (sign in with email/password or Google).
2. An account whose **email** appears on the server allowlist **`MODERATOR_EMAILS`** (comma-separated, case-insensitive).

The **page** (`/moderation`) and **APIs** (`/api/moderation/*`) both call `supabase.auth.getUser()`, which validates the session JWT server-side. The client cannot spoof the email; only Supabase-trusted session cookies count.

If the allowlist is empty or unset, moderation APIs return `503` and the page explains that configuration is missing.

## Web GUI (`/moderation`)

1. Ensure **`MODERATOR_EMAILS`** includes your moderator account email(s) in the deployment’s environment.
2. Open **`/moderation`**. If you are not signed in or your email is not on the list, you see **Unauthorized** and a **Sign in** link (`/auth/login?next=/moderation`).
3. After signing in as a moderator, look up a user by **Auth UUID**, verify details, confirm, then **Ban user permanently**.

Lookup and ban requests use **`fetch` with `credentials: "include"`** so your session cookie is sent to the **same origin** as the app. Open the moderation UI on the environment you are acting on (e.g. production site for production bans).

## API endpoints

Both require a **valid moderator session** (same rules as above).

### Lookup

- **URL**: `POST /api/moderation/lookup-user`
- **Body**: `{ "user_id": "<uuid>" }`
- **Response**: Auth email, profile fields, and whether a Pro subscription row exists.

### Ban

- **URL**: `POST /api/moderation/ban-user`
- **Body**: `{ "user_id": "<uuid>" }`

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `MODERATOR_EMAILS` | Yes | Comma-separated moderator emails (e.g. `you@domain.com,other@domain.com`). |
| `RESEND_API_KEY` | Yes | Resend API key for ban notification email. |
| `MODERATION_EMAIL_FROM` | Yes | Verified sender in Resend. |
| `NEXT_PUBLIC_APP_URL` | No | Used to derive the app name in the email (hostname); defaults to “ShrineKeep” if unset. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role for admin user lookup, storage delete, Auth delete. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | For session verification via `getUser()`. |
| `STRIPE_SECRET_KEY` | Yes | Stripe cancellation (same as checkout/webhooks). |
| `MODERATION_CORS_ORIGINS` | No | Rare: comma-separated origins if you must call moderation APIs from another origin with `credentials: "include"` (advanced). |

Copy from [`.env.local.example`](../.env.local.example); set the same on production (e.g. Vercel).

## Order of operations (ban)

1. Load the target Auth user by `user_id`; require a non-empty `email`.
2. **Stripe** — cancel billable subscription when `stripe_subscription_id` exists.
3. **Email** — Resend ban message; optional Pro-cancellation paragraph when applicable.
4. **Storage** — delete `item-photos/{user_id}/items/**` and `avatars/{user_id}/**`.
5. **Auth** — `auth.admin.deleteUser` so DB cascades (including wishlist share token).

## Stripe webhooks after ban

After Auth deletion, `public.subscriptions` may be gone. Webhook handlers that update by Stripe ids may match zero rows; they log and continue.

## Response shape (ban success)

```json
{
  "ok": true,
  "email_sent": true,
  "include_subscription_cancelled_notice": false,
  "deleted_storage": { "item_photos": 0, "avatars": 1 }
}
```

## Data map checklist (extend when adding features)

**PostgreSQL** — tables referencing `public.users(id)` with `ON DELETE CASCADE` in [supabase/schema.sql](../supabase/schema.sql): `users`, `boxes`, `items`, `tags`, `friendships`, `wish_lists`, `user_settings`, `subscriptions`, plus dependent rows via FK chains.

**Storage**

- Bucket `item-photos`: prefix `{user_id}/items/`
- Bucket `avatars`: prefix `{user_id}/`

**External**

- **Stripe**: subscription canceled by moderation.

## Resend

Verify your sending domain in the Resend dashboard. Unverified `MODERATION_EMAIL_FROM` domains will not deliver.
