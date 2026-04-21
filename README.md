# 🏉 AFL Tipping 2026 — Handicap Competition

A full-stack AFL line/handicap tipping competition app for 8 participants.
- **Frontend:** React + Tailwind CSS (hosted on Netlify)
- **Database:** Supabase (Postgres + Realtime)
- **Serverless functions:** Netlify Functions (scraping + results)

---

## 📋 Deployment Guide (Plain English)

This guide will take you from zero to a live app. No coding experience required. It takes about 20–30 minutes.

---

### STEP 1 — Create a GitHub account (if you don't have one)

1. Go to **github.com** and click "Sign up"
2. Create a free account

---

### STEP 2 — Put the project on GitHub

1. Go to **github.com/new** to create a new repository
2. Name it `afl-tipping` — make it **Private**
3. Click "Create repository"
4. Follow GitHub's instructions to upload the files from this project folder

> **Easiest method:** Use GitHub Desktop (desktop.github.com) — drag and drop the project folder, then click "Publish repository"

---

### STEP 3 — Create a Supabase project (the database)

1. Go to **supabase.com** and click "Start your project" — sign up for free
2. Click "New project"
3. Fill in:
   - **Name:** `afl-tipping`
   - **Database Password:** make up a strong password and save it somewhere
   - **Region:** Sydney (ap-southeast-2) — closest to Australia
4. Click "Create new project" — wait ~2 minutes for it to set up

---

### STEP 4 — Run the database setup SQL

1. In Supabase, click **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. Open the file `supabase/schema.sql` from this project
4. Copy ALL the text and paste it into the SQL editor
5. Click **"Run"** (or press Cmd+Enter)
6. You should see "Success. No rows returned"

**Then run the seed data:**

1. Click **"New query"** again
2. Open the file `supabase/seed.sql` from this project
3. Copy ALL the text and paste it into the SQL editor
4. Click **"Run"**
5. You should see "Success. No rows returned"

This loads all 207 fixtures, Rounds 0–4 results, all historical tips, and the leaderboard.

---

### STEP 5 — Get your Supabase keys

1. In Supabase, click **"Project Settings"** (gear icon at bottom left)
2. Click **"API"**
3. You'll need these two values — copy them somewhere:
   - **Project URL** (looks like `https://abcxyz.supabase.co`)
   - **anon/public key** (a long string starting with `eyJ...`)
   - **service_role key** (another long string — keep this SECRET)

---

### STEP 6 — Deploy to Netlify

1. Go to **netlify.com** and sign up for free (use your GitHub account)
2. Click **"Add new site"** → **"Import an existing project"**
3. Click **"GitHub"** and authorise Netlify
4. Find and select your `afl-tipping` repository
5. Leave the build settings as-is (Netlify will detect them automatically):
   - Build command: `npm run build`
   - Publish directory: `dist`
6. Click **"Deploy site"** — wait about 2 minutes

---

### STEP 7 — Add environment variables to Netlify

After deploying, you need to tell Netlify your Supabase credentials:

1. In Netlify, go to your site → **"Site configuration"** → **"Environment variables"**
2. Click **"Add a variable"** and add each of these:

| Key | Value |
|-----|-------|
| `VITE_SUPABASE_URL` | Your Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key |
| `SUPABASE_URL` | Your Supabase Project URL (same as above) |
| `SUPABASE_SERVICE_KEY` | Your Supabase service_role key |

3. After adding all 4 variables, go to **"Deploys"** → **"Trigger deploy"** → **"Deploy site"**
4. Wait for it to rebuild (~2 minutes)

---

### STEP 8 — Test it!

1. Click the URL Netlify gives you (something like `https://amazing-name-123456.netlify.app`)
2. You should see the AFL Tipping login screen
3. Select your name from the dropdown and click "Enter Tipping"
4. Test admin access: click "Admin" tab, enter PIN `afl2026`

---

### STEP 9 — Share with participants

Send everyone the Netlify URL. They:
1. Select their name from the dropdown
2. No password needed
3. Tips are saved automatically when they click a team

> **Optional:** In Netlify, go to Site configuration → Domain management to set a custom domain like `tips.yourdomain.com`

---

## 🔒 Admin Guide

### Locking a round

Lock a round **before the first game kicks off** on Thursday night.
1. Log in as Admin (PIN: `afl2026`)
2. Go to Admin → confirm you're on the right round number
3. Click **"Lock Round"**
4. Once locked, everyone can see each other's tips

### Setting lines (handicaps)

**Option A — Automatic scrape from Sportsbet:**
1. Click **"Scrape Lines"** in the admin panel
2. Review the scraped lines (edit any that look wrong)
3. Click **"Approve & Publish"**

**Option B — Manual entry (if scrape fails):**
1. In Admin → Lines tab, you'll see manual entry fields
2. Enter the home team's handicap (e.g. `-23.5` means home gives 23.5 points)
3. Click **"Save & Publish Lines"**

### Entering results

**Option A — Automatic (recommended):**
1. Click **"Fetch Results"** — this pulls from the free Squiggle API
2. Tips are automatically marked correct/incorrect
3. Leaderboard updates instantly

**Option B — Manual:**
1. Go to Admin → Results tab
2. Enter the home team's final margin for each game
3. Click **"Save"** per game

### Scheduled automation

These run automatically without you doing anything:
- **Every Wednesday 9am AEST:** Scrapes Sportsbet for upcoming round lines
- **Every Sunday 11pm AEST:** Fetches results from Squiggle API

---

## 🕷 Scraper Maintenance

If Sportsbet changes their website and scraping breaks:

1. Open `netlify/functions/scrape-lines.js`
2. Look for the `CSS_SELECTORS` object near the top
3. Update the selector strings to match the new page structure
4. The file includes detailed comments on what each selector does
5. The admin panel will show a clear error message if scraping fails — you can always use manual entry as a fallback

---

## 🏗 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Database | Supabase (Postgres) |
| Realtime | Supabase Realtime subscriptions |
| Hosting | Netlify |
| Serverless | Netlify Functions (Node.js) |
| Scraping | Puppeteer + @sparticuz/chromium |
| Results API | api.squiggle.com.au |

---

## 📁 Project Structure

```
afl-tipping/
├── src/
│   ├── App.jsx              # Login, routing, auth context
│   ├── main.jsx             # Entry point
│   ├── index.css            # Tailwind + global styles
│   ├── lib/
│   │   └── supabase.js      # Supabase client
│   └── pages/
│       ├── TippingPage.jsx  # Main tipping screen
│       ├── LeaderboardPage.jsx  # Live ladder
│       ├── HistoryPage.jsx  # Round history viewer
│       └── AdminPage.jsx    # Admin panel
├── netlify/
│   └── functions/
│       ├── scrape-lines.js  # Sportsbet scraper (Puppeteer)
│       ├── fetch-results.js # Squiggle API results fetcher
│       └── package.json     # Function dependencies
├── supabase/
│   ├── schema.sql           # Database tables + RLS policies
│   └── seed.sql             # Historical data R0-R4
├── netlify.toml             # Netlify build + scheduled functions
├── .env.example             # Environment variable template
└── README.md                # This file
```

---

## 🐛 Troubleshooting

**"Missing Supabase environment variables" error:**
Check that you added all 4 environment variables in Netlify and re-deployed.

**Leaderboard not updating:**
Go to Admin panel and click "Rebuild Ladder".

**Scraping fails:**
Use manual line entry in the admin panel. This is normal — Sportsbet sometimes changes their page structure.

**Tips not saving:**
Check that the round is not locked. Participants can only tip on unlocked rounds.

**"No data for this round yet" in History:**
The round either has no approved lines, or results haven't been entered yet.
