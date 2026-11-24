# Stranger: CLEAN

The stranger saw their own data and none of the owner's.

- App: http://localhost:4173/duebook/
- Owner: maya@duebook.demo planted `stranger-canary-66224d`
- Stranger: stranger@duebook.demo looked for it (control `stranger-control-66224d`)
- When: 2026-11-24T17:59:47.689Z

## Coverage
1 of 1 user-data tables were read during this check (`invoices`).

## Kane runs
- Owner plants the canary: **passed** in 99s, 28.820342500000002 credits
  - Kane: created and saved an invoice on Duebook
  - Run: https://test-manager.lambdatest.com/projects/01M87B5FB8HWSB5MPAJ9QVB8NC/test-cases/01M87BDJ17Z0B1K3D1AG0ESP53/dashboard/share/US_KOI8J8X3G1A50KX94YK7SQ3VCI51GMYAWXPAA3YRL56UKX225S9H52HMR5TJQ12S?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/bcae5bbd-e96b-4ffc-8ac3-a7c107e223a6`
- Stranger looks for it: **passed** in 117s, 29.398565 credits
  - Kane: opened the Your invoices list on Duebook
  - Run: https://test-manager.lambdatest.com/projects/01M87B5FB8HWSB5MPAJ9QVB8NC/test-cases/01M87BGJQ21HMMSZ597DWQYPYT/dashboard/share/US_O2FUEDNKAA3UYTYIW60IK7JHKN06BLKXQEBSP5MCQ98442VA2QIIKYVWFL59E00C?type=summary&agentView=true&fqdn=summary-page
  - Evidence: `~/.testmuai/kaneai/sessions/1d73af86-dc27-460a-a993-573580120eca`

## Data reads sent again
Right after Kane's runs, Stranger sent every data read from both pages again (GETs, and database functions that cannot write and take no arguments): with the stranger's login, then with none.

- With the stranger's login: GET https://fadkgxjjyvyaxonyubqj.supabase.co/rest/v1/invoices (both pages) -> 200
- With no login: GET https://fadkgxjjyvyaxonyubqj.supabase.co/rest/v1/invoices (both pages) -> 200

## Numeric canary
The owner added a second row with 7331 in `amount_cents`, then Stranger read the stranger's data again (1 of 1 reads were stable enough to compare). The row was removed afterwards.

- Nothing the stranger reads changed. Totals and counts don't depend on the owner's data.

## Tamper check
The stranger tried to change, then delete, the owner's canary row in `invoices`, and the owner read it back after each try.

- Change `note`: blocked, the row is as the owner left it (HTTP 204)
- Delete: blocked, the row is still there (HTTP 204)

## Forged owner
Signed in as the stranger, Stranger tried to add a row to `invoices` that names the owner in `user_id` (HTTP 403).

- Refused: no such row was stored.

## Live updates
The stranger opened the app's realtime connection and listened for database changes on `invoices` and on 4 likely channels (`invoices:{owner}`, `user:{owner}`, `{owner}`, `invoices`). Then the owner added a row.

- Joined: `database changes on invoices`, `invoices:{owner}`, `user:{owner}`, `{owner}`, `invoices`
- Heard nothing of the owner's row.
- Row deleted afterwards: yes

## Blast radius
Counts come from the existing GET replays with the stranger's login and with none. The original queries still apply. No row values are stored.

- `invoices`: stranger reads none. With no login: none.
