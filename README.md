# ShrineKeep

## [Consumerism has never been this organized.](https://www.shrinekeep.com)

A versatile utility webapp to track completion, values, and spending for any collection of items.
[www.shrinekeep.com]
## Features

- **Hierarchical Collections**: Organize items in boxes (collections) with unlimited nesting
- **Item Management**: Track items with photos, descriptions, values, acquisition dates and prices
- **Wishlists**: Create wishlists with expected prices and easily mark items as acquired
- **Value Tracking**: Automatically track value changes over time with visual graphs
- **Image Search**: Search the web for images (via SerpAPI) and select a thumbnail for items
- **Social Features**: Share collections with friends and view public wishlists
- **Tags & Search**: Tag items and search across all your collections
- **Custom Color Schemes**: Personalize your app's appearance with custom color themes
- **Public Wishlist Sharing**: Share your wishlist with others via a shareable link
- **Settings Management**: Customize app preferences and appearance settings

## Tech Stack

- **Frontend**: Next.js 16 (React, TypeScript)
- **Styling**: Tailwind CSS + shadcn/ui components
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **CAPTCHA**: Cloudflare Turnstile
- **Email**: Resend
- **Billing**: Stripe
- **Deployment**: Vercel (recommended)
- **Charts**: Recharts
- **Drag & Drop**: @dnd-kit
- **Theme Management**: next-themes for dynamic theme switching
- **Color Picker**: react-colorful for color customization
- **Skeleton screens**: [boneyard-js](https://boneyard.vercel.app/overview) — DOM-captured bones for loading states (dashboard grids, stats panel, search cards, value graph)

### Skeleton loading (boneyard-js)

ShrineKeep uses [boneyard-js](https://boneyard.vercel.app/overview) so loading UIs follow real layout shapes. Official React + Next.js usage is documented at [boneyard features](https://boneyard.vercel.app/features). **ShrineKeep handles race conditions correctly to correctly load all bones first.**

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Supabase account (free tier works)
- SerpAPI API key (optional, for image search)
- Cloudflare Turnstile (optional)
- Stripe (optional)
- Resend (optional)

### Setup Instructions
Detailed instructions available in SETUP.md

1. **Clone the repository**
   ```bash
   git clone https://github.com/SirSaltySalmon/ShrineKeep
   cd ShrineKeep
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Supabase**
   - Create a new project at [supabase.com](https://supabase.com)
   - Go to Settings > API to get your URL and anon key
   - Go to Settings > Database to get your service role key (keep this secret!)
   - Create a storage bucket named `item-photos` with public access
   - Further instructions in SETUP.md

4. **Set up the database**
   - In Supabase, go to SQL Editor
   - Copy and paste the contents of `supabase/schema.sql`
   - Run the SQL script to create all tables, policies, and triggers

5. **Configure environment variables**
   - Copy `.env.local.example` to `.env.local`
   - Fill in your Supabase credentials:
     ```
     NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
     SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
     ```

6. **Set up Captcha with Cloudflare Turnstile (Optional)**
   - This website implements captcha integration for Cloudflare Turnstile
   - Follow Supabase's guide [here](https://supabase.com/docs/guides/auth/auth-captcha?queryGroups=captcha-method&captcha-method=turnstile-1) up until you inputted your secret key and copied your site key
   - Add to `.env.local`:
     ```
     TURNSTILE_SITEKEY=your-turnstile-sitekey-here
     ```
   - If you turn off Captcha in Supabase, this step is optional

7. **Set up SerpAPI for image search (Optional)**
   - Uses the **Google Images Light** engine (minimal data, faster). Sign up at [serpapi.com](https://serpapi.com) and get your API key from [manage-api-key](https://serpapi.com/manage-api-key)
   - Add to `.env.local`:
     ```
     SERPAPI_API_KEY=your_serpapi_api_key
     ```
8. **Set up Stripe (Optional)**
   - For implementing paid subscriptions.
   - Detailed instructions will be written later. Fill out .env variables for Stripe if you can figure it out yourself.

9. **Set up Resend (Optional)**
   - For sending emails and moderation.
   - Detailed instructions will be written later. Fill out .env variables for Resend if you can figure it out yourself.

10. **Run the development server**
   ```bash
   npm run dev
   ```
11. **Regenerating bones for loading screens (Optional**)
   With the dev server running:
   
   ```bash
   npx boneyard-js build http://localhost:3000/boneyard-preview --force
   ```
   The **`/boneyard-preview`** route mounts the skeleton variants used for capture. Use `--force` after layout changes so the incremental cache does not skip updates.

12. **Open your browser**
   - Navigate to [http://localhost:3000](http://localhost:3000)

## Deployment

### Deploy to Vercel
Before this, make sure to run this at least once:
   ```bash
   npm run build
   ```
Then, fix any errors if needed.

1. Push your code to GitHub
2. Import your repository in [Vercel](https://vercel.com)
3. Add your environment variables in Vercel's project settings
4. Deploy!

Vercel will automatically:
- Build your Next.js app
- Deploy on every push to main
- Provide a production URL

### Environment Variables for Production

Make sure to add all environment variables in your Vercel project settings. Refer to **.env.local.example**

## Key Features Implementation

### Hierarchical Boxes
- Boxes can contain other boxes (collections) and items
- Navigate through boxes with breadcrumbs
- Hover preview shows total value and item count

### Item Management
- Add items with photos (upload or web image search)
- Track current value, acquisition price, and date
- 4MB max photo size
- Automatic value history tracking
- Free 50 items for non-paying users. Pro users can have unlimited items

### Wishlists
- Create wishlist items with expected prices
- Wishlist items do not contribute to the free 50 items cap
- One-click "Mark as Acquired" converts to regular item
- Separate from regular collections
- Associate with a box to designate it as part of a collection

### Value Tracking
- Every value change is recorded with timestamp
- View value history as a line graph
- Delete individual history records
- Track collection-level value changes

### Image Search (SerpAPI, Google Images Light)
- Search the web for images by item name (light engine: minimal data, fast)
- Select from search results for item thumbnails
- Images are referenced (not downloaded)

## Security
- Row-Level Security (RLS) enabled on all tables
- Users can only access their own data
- Public collections are viewable by friends
- File uploads validated (type and size)
- Authentication via Supabase Auth
- **Moderation**: accounts listed in `MODERATOR_EMAILS` can use `/moderation` and moderation APIs; the server verifies the Supabase session JWT (email cannot be spoofed by the client). Ban flow cancels Pro when applicable, emails the user, purges storage, and deletes the Auth user. See [docs/moderation.md](docs/moderation.md).

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

See LICENSE file for details.

## Support

For issues and questions, please open an issue on GitHub.
