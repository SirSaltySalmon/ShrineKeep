# ShrineKeep

A versatile utility webapp to track completion, values, and spending for any collection of items.

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

- **Frontend**: Next.js 14+ (React, TypeScript)
- **Styling**: Tailwind CSS + shadcn/ui components
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **Deployment**: Vercel (recommended)
- **Charts**: Recharts
- **Drag & Drop**: @dnd-kit
- **Theme Management**: next-themes for dynamic theme switching
- **Color Picker**: react-colorful for color customization

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Supabase account (free tier works)
- SerpAPI API key (optional, for image search)

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

6. **Set up SerpAPI for image search (Optional)**
   - Uses the **Google Images Light** engine (minimal data, faster). Sign up at [serpapi.com](https://serpapi.com) and get your API key from [manage-api-key](https://serpapi.com/manage-api-key)
   - Add to `.env.local` (server-side only; do not use `NEXT_PUBLIC_`):
     ```
     SERPAPI_API_KEY=your_serpapi_api_key
     ```

7. **Run the development server**
   ```bash
   npm run dev
   ```

8. **Open your browser**
   - Navigate to [http://localhost:3000](http://localhost:3000)

## Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Import your repository in [Vercel](https://vercel.com)
3. Add your environment variables in Vercel's project settings
4. Deploy!

Vercel will automatically:
- Build your Next.js app
- Deploy on every push to main
- Provide a production URL

### Environment Variables for Production

Make sure to add all environment variables in your Vercel project settings:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (optional, only if you need server-side admin access)
- `SERPAPI_API_KEY` (optional, for image search; keep server-side)

## Project Structure

```
ShrineKeep/
├── app/                    # Next.js app directory
│   ├── auth/              # Authentication pages
│   ├── dashboard/         # Main dashboard
│   ├── settings/           # Settings page
│   └── wishlist/          # Wishlist page
│       └── [token]/       # Public wishlist view
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   ├── settings/         # Settings components
│   ├── box-grid.tsx      # Box display component
│   ├── item-grid.tsx     # Item display component
│   ├── item-dialog.tsx   # Item create/edit dialog
│   ├── theme-provider.tsx # Theme management
│   └── value-graph.tsx   # Value tracking graph
├── lib/                   # Utilities and helpers
│   ├── supabase/         # Supabase client setup
│   ├── types.ts          # TypeScript types
│   ├── utils.ts          # Utility functions
│   └── settings.ts       # Settings utilities
├── supabase/             # Database schema
│   └── schema.sql        # Complete database schema
└── public/               # Static assets
```

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

### Wishlists
- Create wishlist items with expected prices
- One-click "Mark as Acquired" converts to regular item
- Separate from regular collections

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

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

See LICENSE file for details.

## Support

For issues and questions, please open an issue on GitHub.
