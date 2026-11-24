# Stranger: LEAK

> Saved from Notely run `106ece`. This was a local checkout with a throwaway Supabase database and synthetic test accounts. The RLS state described below applies to that test setup.

The app's pages looked clean, but the `notes` table, read straight from Supabase with the stranger's login, returns the owner's canary. The browser has the project's address and public key from signing in, so anyone can read it that way, whatever the app's own server code filters. With no login at all, the API returns it too. The stranger could change and delete the owner's row in `notes`. The stranger could create a row in `notes` that names the owner in `user_id`, so anyone can add records to someone else's account.

- App: Notely (local checkout)
- Owner: owner@field.test planted `stranger-canary-106ece`
- Stranger: stranger@field.test looked for it (control `stranger-control-106ece`)
- When: 2026-11-24T13:08:07.575Z

## Coverage
1 of 1 user-data tables were read during this check (`notes`).

## Kane runs
- Owner plants the canary: **passed** in 98s, 25.954317500000002 credits
  - Kane: created a new note on the notes site
  - Run: [Owner steps](https://stranger-2yf3.vercel.app/runs/106ece/)
- Stranger looks for it: **passed** in 122s, 32.745163 credits
  - Kane: created a new note and opened the notes list on the notes page
  - Run: [Stranger steps](https://stranger-2yf3.vercel.app/runs/106ece/)

## Data reads sent again
Right after Kane's runs, Stranger sent every data read from both pages again (GETs, and database functions that cannot write and take no arguments): with the stranger's login, then with none.

None of the pages' data reads held the owner's canary, so Stranger read the user tables straight from Supabase as the owner, found it in `notes`, and read that table again as the stranger and with no login. The browser has the project's address and public key from signing in, so anyone can send these reads.

- With the stranger's login: GET [app server function] (both pages) -> 200
- With no login: GET [app server function] (both pages) -> 200
- With the stranger's login: GET [Supabase notes endpoint] (straight from Supabase) -> 200, **owner's canary in the response**
- With no login: GET [Supabase notes endpoint] (straight from Supabase) -> 200, **owner's canary in the response**

## Numeric canary
The owner added a second row with 7331 in no numeric column, then Stranger read the stranger's data again (1 of 1 reads were stable enough to compare). The row was removed afterwards.

- Nothing the stranger reads changed. Totals and counts don't depend on the owner's data.

## Tamper check
The stranger tried to change, then delete, the owner's canary row in `notes`, and the owner read it back after each try.

- Change `title`: **the owner's row changed** (HTTP 204)
- Delete: **the owner's row was deleted** (HTTP 204)
- Put back by the owner afterwards: yes

## Forged owner
Signed in as the stranger, Stranger tried to add a row to `notes` that names the owner in `user_id` (HTTP 201).

- **It was stored: the stranger put a record into the owner's account.**
- Deleted again afterwards: yes

## Live updates
The stranger opened the app's realtime connection and listened for database changes on `notes` and on 4 likely channels (`notes:{owner}`, `user:{owner}`, `{owner}`, `notes`). Then the owner added a row.

- Joined: `database changes on notes`, `notes:{owner}`, `user:{owner}`, `{owner}`, `notes`
- Heard nothing of the owner's row.
- Row deleted afterwards: yes

## Blast radius
Counts come from the existing GET replays with the stranger's login and with none. The original queries still apply. No row values are stored.

- `notes`: stranger reads 4 rows from 1 other account. With no login: 8 rows.

## Where the canary showed up
- [Supabase notes endpoint] the `notes` table, read straight from Supabase with the stranger's login: …stranger-canary-106ece…
- [Supabase notes endpoint] the `notes` table, read straight from Supabase with no login: …stranger-canary-106ece…
