# ShrineKeep Setup Guide

This guide will walk you through setting up ShrineKeep from scratch.

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project
3. Wait for the project to finish provisioning (takes a few minutes)

### Get Your Supabase Credentials

1. Go to **Settings** > **API**
2. Copy the following:
   - **Project URL** (this is your `NEXT_PUBLIC_SUPABASE_URL`)
   - **anon/public key** (this is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
3. Go to **Settings** > **Database**
4. Copy the **service_role key** (this is your `SUPABASE_SERVICE_ROLE_KEY` - keep this secret!)

### Set Up Database Schema

1. In Supabase, go to **SQL Editor**
2. Click **New Query**
3. Open the file `supabase/schema.sql` from this project
4. Copy the entire contents and paste into the SQL Editor
5. Click **Run** (or press Ctrl+Enter)
6. You should see "Success. No rows returned"

### Create Storage Bucket

1. In Supabase, go to **Storage**
2. Click **New bucket**
3. Name it: `item-photos`
4. Make it **Private** (toggle OFF - bucket should be private for security)
5. Click **Create bucket**

**Important**: The bucket must be **private** for the security policies to work correctly. Images are stored in user-specific folders (`{user_id}/items/{filename}`) and access is controlled by Row Level Security policies:
- Private items: Only the owner can access (via signed URLs)
- Wishlist items: Publicly accessible (via public URLs, controlled by storage policies)

### Create Avatars Bucket (for profile photos)

1. In Supabase **Storage**, click **New bucket**
2. Name it: `avatars`
3. Make it **Public** (so profile photos can be shown without signed URLs)
4. Optionally set **File size limit** to 2 MB and **Allowed MIME types** to `image/jpeg`, `image/png`, `image/gif`, `image/webp`
5. Click **Create bucket**
6. Run the migration that adds storage policies for `avatars`: `supabase/migrations/20250215000000_add_avatars_bucket.sql`

### Enable Google Sign-In (Optional)

To use “Sign in with Google” you must enable the Google provider in Supabase and add credentials from Google Cloud.

1. In Supabase, go to **Authentication** > **Providers**
2. Find **Google** and turn it **ON**
3. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project
4. Go to **APIs & Services** > **Credentials** > **Create credentials** > **OAuth client ID**
5. Choose **Web application**, set **Authorized redirect URIs** to:
   - `https://<your-project-ref>.supabase.co/auth/v1/callback`  
   (Find your project ref in Supabase **Settings** > **API** > **Project URL**, e.g. `https://abcdefgh.supabase.co` → ref is `abcdefgh`)
6. Copy the **Client ID** and **Client secret** into Supabase under **Authentication** > **Providers** > **Google**
7. Save

For local dev, you can also add `http://localhost:3000` as an authorized origin in the Google OAuth client if needed.

### Configure Redirections (Optional)
When logging in using Google, configuration is needed to allow redirecting after log in.
1. Go to **Authentication**
2. Go to **URL Configuration**
3. Fill out **Site URL** with the URL you are deploying on.
4. For auths to work frictionlessly, add URL to **Redirect URLs** as well, in this format:
- https://shrinekeep.com/* (or your own domain replacing shrinekeep.com)
- http://localhost:3000/* (for testing on your local device)
   These same URLs are used for Google sign-in and for **forgot password** reset links (e.g. `/auth/reset-password`).

### Log in with custom SMTP (Optional)
1. Go to **Authentication**
2. Go to **Email** and check out **SMTP Settings**. Almost required for production grade deployment.
3. Get information from your domain name & email provider and submit.



## Step 3: Configure Environment Variables

1. Copy `.env.local.example` to `.env.local`:
   ```bash
   cp .env.local.example .env.local
   ```

2. Open `.env.local` and fill in your Supabase credentials:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   ```

## Step 4: Set up Captcha with Cloudflare Turnstile (Optional)

This website implements captcha integration for Cloudflare Turnstile.

1. Follow Supabase's guide [here](https://supabase.com/docs/guides/auth/auth-captcha?queryGroups=captcha-method&captcha-method=turnstile-1) up until you have input your secret key and copied your site key
2. Add to `.env.local`:
   ```
   TURNSTILE_SITEKEY=your-turnstile-sitekey-here
   ```

If you turn off Captcha in Supabase, this step is optional.

## Step 5: Set Up SerpAPI for Image Search (Optional)

This is optional but enables the image search feature (search the web for item thumbnails). The app uses SerpAPI’s **Google Images Light** engine (minimal data, faster responses).

1. Go to [serpapi.com](https://serpapi.com) and create a free account
2. Open your [API key page](https://serpapi.com/manage-api-key)
3. Copy your API key
4. Add to `.env.local` (do **not** use `NEXT_PUBLIC_`—the key stays server-side):
   ```
   SERPAPI_API_KEY=your-serpapi-api-key
   ```

The free tier includes a limited number of searches per month.

## Step 6: Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Step 7: Create Your First Account

1. Click **Sign up**
2. Enter a name, email, and password
3. Or sign up with Google (if you configured OAuth in Supabase)

## Step 8: Cloud Deployment (Optional)

If you want to access your site from the internet, you can use cloud deployment services. One such is below.

1. Push your code to GitHub
2. Import your repository in [Vercel](https://vercel.com)
3. Add your **environment variables** in Vercel's project settings. This is **IMPORTANT**, because .env.local has been set to be ignored by git and will not be pushed to GitHub for security purposes. Without configuring, the website will be missing vital API keys.
4. Deploy!

## Troubleshooting

### "Invalid API key" error
- Make sure your `.env.local` file has the correct values
- Restart the dev server after changing environment variables

### "Storage bucket not found" error
- Make sure you created the `item-photos` bucket in Supabase Storage
- Make sure it's set to **Public**

### Database errors
- Make sure you ran the `schema.sql` script in Supabase SQL Editor
- Check that all tables were created (go to **Table Editor** in Supabase)

### Error saving wishlist item
- If the database was created before `box_id` was made nullable, run in Supabase SQL Editor:  
  `ALTER TABLE public.items ALTER COLUMN box_id DROP NOT NULL;`

### Image search not working
- Make sure you added `SERPAPI_API_KEY` to `.env.local`
- Restart the dev server after adding the key
- Check your [SerpAPI dashboard](https://serpapi.com/manage-api-key) for quota and errors

### "Unsupported provider: provider is not enabled" (Google sign-in)
- Google sign-in must be enabled in your Supabase project
- In Supabase go to **Authentication** > **Providers**, turn **Google** **ON**, and add your Google OAuth Client ID and Client secret (see **Enable Google Sign-In** above)

### Settings not saving
- Make sure you ran the `migration_add_user_settings.sql` script if upgrading
- Ensure the `user_settings` table exists in your database
- For **Personal** settings (display name switch), run `supabase/migrations/20250214000000_add_use_custom_display_name.sql` if the column is missing

### Public wishlist link not working
- Ensure `user_settings` table exists and has RLS policies enabled
- Make sure the wishlist is set to public in Settings
- Verify the share token is valid

### Header shows "user_xxxx" instead of Google name
- The app prefers `public.users.name` and falls back to session metadata when the stored name looks like `user_xxxxxxxx`. If it still shows the default: run the **"Re-backfill names from auth"** SQL below (overwrites `name` from Google/auth for all users). If you never added the column, run the full **"Add name column"** block first.

## Next Steps

- Start adding items to your collection!
- Create boxes to organize your items
- Add items to your wishlist
- Track value changes over time

For deployment instructions, see the main README.md file.
