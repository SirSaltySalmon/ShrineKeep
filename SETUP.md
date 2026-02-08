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
4. Make it **Public** (toggle on)
5. Click **Create bucket**

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

## Step 4: Set Up Google Custom Search (Optional)

This is optional but enables the image search feature.

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the **Custom Search API**:
   - Go to **APIs & Services** > **Library**
   - Search for "Custom Search API"
   - Click **Enable**
4. Create an API Key:
   - Go to **APIs & Services** > **Credentials**
   - Click **Create Credentials** > **API Key**
   - Copy the API key
5. Set up Custom Search Engine:
   - Go to [Programmable Search Engine](https://programmablesearchengine.google.com/)
   - Click **Add**
   - Select "Search the entire web"
   - Give it a name (e.g., "ShrineKeep Images")
   - Click **Create**
   - Copy the **Search Engine ID**

6. Add to `.env.local`:
   ```
   NEXT_PUBLIC_GOOGLE_SEARCH_API_KEY=your-api-key
   NEXT_PUBLIC_GOOGLE_SEARCH_ENGINE_ID=your-engine-id
   ```

## Step 5: Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Step 6: Create Your First Account

1. Click **Sign up**
2. Enter a username, email, and password
3. Or sign up with Google (if you configured OAuth in Supabase)

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

### Google Images search not working
- Make sure you added the API key and Engine ID to `.env.local`
- Check that the Custom Search API is enabled in Google Cloud Console
- The free tier allows 100 searches per day

## Next Steps

- Start adding items to your collection!
- Create boxes to organize your items
- Add items to your wishlist
- Track value changes over time

For deployment instructions, see the main README.md file.
