# Analytics Setup — Visitors & Button Clicks

Your site now has two free trackers wired in. You just need to create the accounts,
copy two IDs, and paste them into `client/index.html`.

## What each tool gives you

- **Google Analytics 4 (GA4)** — how many visitors, where they came from, which pages
  they viewed, and every button/link click (sent as `button_click` / `link_click` events).
- **Microsoft Clarity** — heatmaps + session recordings. You literally watch replays of
  what each visitor did and see exactly which buttons get clicked. No extra code needed.

## Step 1 — Get your GA4 Measurement ID

1. Go to https://analytics.google.com and sign in.
2. Admin (bottom-left gear) → **Create → Property**. Enter your site name.
3. Under the property: **Data streams → Add stream → Web**. Enter `https://docifydocai.com`.
4. Copy the **Measurement ID** — it looks like `G-XXXXXXXXXX`.

## Step 2 — Get your Clarity Project ID

1. Go to https://clarity.microsoft.com and sign in.
2. **Add new project** → name it, set the URL to `https://docifydocai.com`.
3. Open **Settings → Overview** and copy the **Project ID** (a short string like `abcd1234ef`).

## Step 3 — Paste both IDs into the site

Open `client/index.html`. In the `<!-- ANALYTICS -->` block near the top, replace:

- `GA_MEASUREMENT_ID` → your `G-XXXXXXXXXX` id  (appears in **3 places** — replace all)
- `CLARITY_PROJECT_ID` → your Clarity project id  (appears in **1 place**)

Save, commit, and deploy. That's it.

## Step 4 — Confirm it works

- Open your live site, click around a few buttons.
- **GA4:** Reports → **Realtime** — you should see yourself as an active user within ~30s,
  and your clicks under the events list.
- **Clarity:** the dashboard shows recordings within a few minutes; open one to watch a
  replay, or open **Heatmaps** to see click density on each page.

## Where to see "which button was clicked"

- **Fastest visual answer:** Clarity → Heatmaps (click map per page) or Recordings.
- **As countable data:** GA4 → Reports → Engagement → Events → `button_click`. Each event
  carries a `label` (the button's text) so you can see which buttons are clicked most.

## Notes

- Because this is a single-page app, pageviews are sent manually on every route change
  (handled in `client/src/analytics.js`) so navigation between pages counts correctly.
- Both tools are free. If you later want a consent/cookie banner for GDPR, add it before
  the trackers fire — ask and I can wire that in.
