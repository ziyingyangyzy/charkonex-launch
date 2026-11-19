# Charkonex Launch Board

A shared project board for the Charkonex launch: six workstreams (clinic partnerships, digital marketing, regulatory path, sleep algorithm, fundraising, events), a timeline to launch, lead and support owners, and task status that the whole team updates together.

The site is static (GitHub Pages). Tasks live in a Supabase database, behind a team password. This repo holds no task data.

## How the team uses it

1. Open the site and enter the team password (asked once per browser).
2. Pick your name under **I am** so the board records who updated what.
3. Click a status button to advance it (To do → In progress → Done → Blocked). Click a task or a timeline bar to edit it. Click a workstream name to change its owners.
4. Changes reach everyone within about 5 seconds.

**Team** renames people (A–D are placeholders), adds people and changes the launch date.

## Setup (one time)

1. **Supabase**: create a free project at supabase.com. Open SQL Editor, paste the setup SQL, change `CHANGE-ME` on the last line to your team password, then click Run.
2. **config.js**: fill in `supabaseUrl` and `supabaseAnonKey` from Supabase → Project Settings → API. The anon key is public by design. The password protects the data.
3. **GitHub Pages**: Settings → Pages → Source: *Deploy from a branch*, Branch: `main`, folder `/ (root)`.

To change the password later, run the last statement of `supabase/setup.sql` again with the new password, then share it with the team.

## Files

- `index.html`: page layout and styles
- `app.js`: board logic and sync
- `config.js`: Supabase connection
- `supabase/setup.sql`: tables and password-checked functions (no task data)
- `assets/logo.png`: Charkonex logo
