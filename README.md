# Credits Desk Dashboard

A read-only dashboard built from the "Credits desk tracker" Google Sheet.

- `index.html` — the page itself
- `app.js` — draws the tables/charts from the data
- `data.js` — the actual numbers (a snapshot of the sheet)
- `scripts/update_data.py` + `scripts/requirements.txt` — regenerates `data.js` from the live sheet
- `.github/workflows/update-data.yml` — runs that script automatically 4x/day on GitHub, and gives you a manual "Run workflow" button

Open `index.html` by double-clicking it — it works straight from your computer,
no internet needed (except for one small styling library loaded from a CDN).

---

## Part 1 — Put this on GitHub (step by step, no experience needed)

### Step 1: Create a free GitHub account (skip if you already have one)
1. Go to https://github.com
2. Click **Sign up**, follow the instructions (email, password, username).

### Step 2: Create a new repository (a "repository" = a project folder on GitHub)
1. Once logged in, click the **+** icon top-right → **New repository**.
2. Name it something like `credits-desk-dashboard`.
3. Leave it **Public** (so GitHub Pages can show it later) or **Private** if you don't need it published.
4. Do **not** check "Add a README" (we already have files to upload).
5. Click **Create repository**.

### Step 3: Upload everything
1. On the new (empty) repository page, click **"uploading an existing file"**
   (a blue link in the middle of the page).
2. Drag and drop **the whole folder contents** — `index.html`, `app.js`,
   `data.js`, the `scripts` folder, and the `.github` folder — into the
   browser window. (If the drag-and-drop uploader skips the hidden `.github`
   folder, use **GitHub Desktop** instead: install it, "Add local repository",
   pick this folder, then "Publish repository" — that uploads everything,
   hidden folders included. You can always add `scripts`/`.github` later if
   you skip Part 2 for now.)
3. Scroll down, click the green **Commit changes** button.

That's it — your files are now on GitHub.

### Step 4 (optional but recommended): Turn it into a live website with GitHub Pages
This gives you a real URL like `https://yourname.github.io/credits-desk-dashboard/`
that you can open from any browser, on any device.

1. In your repository, click **Settings** (top menu).
2. In the left sidebar, click **Pages**.
3. Under "Build and deployment" → "Branch", choose **main** and folder **/ (root)**.
4. Click **Save**.
5. Wait about a minute, then refresh the page — GitHub will show you the live URL at the top
   (something like `https://<your-username>.github.io/credits-desk-dashboard/`).
6. Open that URL — your dashboard is now live for anyone with the link.

---

## Part 2 — Automatic updates, 4x/day, plus a manual "update now" button

A static GitHub Pages site can't safely hold a live, logged-in connection to
a private Google Sheet (that would mean exposing your Google login to every
visitor). Instead, this repo includes a small robot (`update-data.yml`) that
runs **on GitHub's own servers**, logs into the sheet with a dedicated
"service account" (not your personal account), rebuilds `data.js`, and
commits the fresh file — automatically, 4 times a day, forever, for free.

You only need to set this up **once**.

### One-time setup: create a Google service account
1. Go to https://console.cloud.google.com/ and create a project (or use an
   existing one) — top-left dropdown → **New Project** → give it any name.
2. In the search bar, type **Google Sheets API** → open it → click **Enable**.
3. In the left menu: **APIs & Services → Credentials** → **Create Credentials**
   → **Service account**. Give it any name (e.g. `credits-desk-bot`) → **Done**.
4. Click on the service account you just created → tab **Keys** → **Add Key**
   → **Create new key** → type **JSON** → **Create**. A `.json` file downloads
   to your computer — keep it, you'll paste its contents in step 6.
5. Copy the service account's **email address** (looks like
   `credits-desk-bot@your-project.iam.gserviceaccount.com`, shown on its page).
   Open the Google Sheet, click **Share**, paste that email in, give it
   **Viewer** access, click **Send**. (This is the only way the robot can
   read the sheet — nothing else changes.)
6. Back in your GitHub repository: **Settings → Secrets and variables →
   Actions → New repository secret**.
   - Name: `GOOGLE_SERVICE_ACCOUNT_JSON`
   - Value: open the `.json` file you downloaded in step 4 with any text
     editor, copy **everything**, and paste it here.
   - Click **Add secret**.

That's it. From now on:
- The dashboard refreshes itself automatically every 6 hours (4x/day).
- To force an update right now, click the **"Update data now"** button at
  the top of the dashboard — it opens this repo's **Actions** tab. Click the
  **Run workflow** button there (you may need to click the workflow name
  "Update dashboard data" on the left first), then **Run workflow** again to
  confirm. It finishes in under a minute; refresh the dashboard page after.

If you'd rather skip all of this, you can still update data manually any
time by asking Hermes to re-pull the sheet and overwrite `data.js` on GitHub
directly (open `data.js` in the repo, pencil icon to edit, paste, commit).

---

## What's on the dashboard

- **Overview**: KPIs (applications, $ received, open pipeline, open
  applications) for an all-time or custom date-range/month view, plus a
  trend chart (applications submitted / credits received, by day/week/month).
- **By Provider**: pick any provider to see its own KPIs, programs, and a
  trend chart, filterable by date.
- **By Website**: pick any client website/company to see every provider it
  applied to, when, and its current status.
- **Compare**: pick providers and two different periods (Period A / Period
  B) to see a side-by-side trend chart aligned by day/week/month since each
  period's own start.
- **Program Catalog**: all known credit programs, sorted by size, with notes.
- **Applications Log**: every application row, searchable and filterable by status.
