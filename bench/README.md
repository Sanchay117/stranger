# Stranger bench

Ten small notes apps on one Supabase project. Each has one bug left in on purpose, a different way to leak or
tamper with another account's data, and one has none. Stranger runs on each with the real Kane CLI, the same
way it runs on any app: the owner plants a canary, a second account looks for it, then the API checks.

**Stranger caught 8 of 9 bugs and stayed quiet on the clean control.** 10 cases run, 589 Kane credits, against http://localhost:5231.

| Case | The bug | Expected | Stranger said | | Kane |
| --- | --- | --- | --- | --- | --- |
| [rls_off](cases/rls_off/.stranger/report.md) | The table never turns on row level security, so every account, and anyone with the public key, reads every row. | LEAK | LEAK (page) | caught | [run](https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T8NZKNERXXKA6RHQVVYA8N/dashboard/share/US_BB40D5K3VONJ066GPIE2WU9JJFHMS6AU50NITTJZK57VFUGDL6UKVTY21A81ZCJJ?type=summary&agentView=true&fqdn=summary-page) |
| [client_filter](cases/client_filter/.stranger/report.md) | The page asks only for its own rows, but the read policy lets any signed-in account read all of them. | LEAK | LEAK (network) | caught | [run](https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T9216CS5AEH4DSQJE7YDE8/dashboard/share/US_OWT1NJN9T1Z8A47BEUY9UCR9NAXNQ2PU68U5ZCX543C7K1IWSZEDG01LS40U1928?type=summary&agentView=true&fqdn=summary-page) |
| [leaky_view](cases/leaky_view/.stranger/report.md) | The table is locked down, but the page reads a view that runs with its creator's rights, so row level security never applies. | LEAK | LEAK (network) | caught | [run](https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T9F3B0DYMDMHNXJ8VVABYB/dashboard/share/US_CBF88BEURZGV1SM8HH2J2RCC27GYM960AD3E1BUPR0DWWB9VBHRATMNC0S8QCL9J?type=summary&agentView=true&fqdn=summary-page) |
| [leaky_rpc](cases/leaky_rpc/.stranger/report.md) | "My notes" comes from a security definer function that forgets to filter by the caller. The page hides the rest. | LEAK | LEAK (anonymous) | **missed** | [run](https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T9R0QMH67JNQ2F0V21TS7F/dashboard/share/US_G70SXNVV9CT84483KSX4EL4HIEZ4K69MQYRLHIHH7WQJSU77GOBGBIZRY35XCBR6?type=summary&agentView=true&fqdn=summary-page) |
| [detail_page](cases/detail_page/.stranger/report.md) | The list is scoped, but each note's own page loads it by id through a function that never checks who is asking. | LEAK | LEAK (direct-link) | caught | [run](https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T85EAGETJ9DG02M1F9XS7X/dashboard/share/US_WWDE90TAK0QDFE0RJ0XMQSJEL9QKC46A8Z6IEDGY20WJS55HMIEPLQLZD40O3JQE?type=summary&agentView=true&fqdn=summary-page) |
| [forged_insert](cases/forged_insert/.stranger/report.md) | Reads and edits are scoped, but the insert policy never checks the owner column, so anyone can add notes to someone else's account. | TAMPER | TAMPER (forged) | caught | [run](https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T9Y7YTA3NB34WCZXYQ3GKK/dashboard/share/US_A3MOZMA60CZZT7YR8ZILUQ9JFDI30JFZ0ND6W7LNMZ5TEFUL68ZJ52PANDTH0NC8?type=summary&agentView=true&fqdn=summary-page) |
| [leaky_total](cases/leaky_total/.stranger/report.md) | Every policy is right, but the total on the page comes from a view that sums every account. No text leaks, only a number. | LEAK | LEAK (aggregate) | caught | [run](https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7TA5VKTDN0KBXGMWVTQ0MAT/dashboard/share/US_ZQHUQ9UDC60XJ3TC5V4IGOZW6EKCCQO5SMAZYTYBOVKLYLA927ZLFVQJ3QRJBO0O?type=summary&agentView=true&fqdn=summary-page) |
| [storage_leak](cases/storage_leak/.stranger/report.md) | Each note is also saved as a file under the owner's folder, but the storage policy only checks the bucket. | LEAK | LEAK (storage) | caught | [run](https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7TACZWFZV12211TQP06BK3D/dashboard/share/US_6F4IKTUFA2G5KP95WORLKY5B45WCSY3B9N6XGKYGN1UV23M9JXF35PASDYB3V7KD?type=summary&agentView=true&fqdn=summary-page) |
| [broadcast_leak](cases/broadcast_leak/.stranger/report.md) | New notes are broadcast on the public channel bench_broadcast_leak:<user id>. Anyone who joins it hears them. | LEAK | LEAK (realtime) | caught | [run](https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7TAKR079PYZ3VK5V243BEZK/dashboard/share/US_WOB2MN6YHU91JFCV8TTFC19EYU5DV3UE1B52U2ZFK67TZIPX6Z4ITFPPR8GEO932?type=summary&agentView=true&fqdn=summary-page) |
| [all_good](cases/all_good/.stranger/report.md) | Owner-only policies for every action, a private bucket scoped to the owner's folder, and a note page that reads through row level security. | CLEAN | CLEAN | clean, as it should be | [run](https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7TATPPWZBF3ZKM0HFBV0MAD/dashboard/share/US_FS53LVYGHM7C8MRK5NG4Y0X3RQGMS1SEFXE5CJSOYKYLM0F2KHWWEU14B8QK6U3A?type=summary&agentView=true&fqdn=summary-page) |

Each case folder has the run's `report.md`, its `FIX.md` (the brief a coding agent gets) and `history.jsonl`.
The bugs are in [`migrations/`](migrations/), the app is [`demo/bench/`](../demo/bench/), live at `/bench/?case=<case>`.

## What Stranger does not catch

- A database function that may write (not marked stable or immutable) or that needs arguments Kane did not log: Stranger never calls it on its own. The detail_page case is caught through its page instead.
- Apps whose server reads the database with the service key (API routes, server actions): the page check and replays still run, but the forged owner, files and live-update checks speak Supabase only.
- Pages Kane never visits. Stranger checks what the owner's and the stranger's runs touch, and lists the user tables it did not reach.

## Run it

```bash
node --env-file=.env scripts/bench-apply.mjs          # create or reset the case tables (needs SUPABASE_DB_URL)
node --env-file=.env bench/run.mjs --url http://localhost:5231   # about 50 Kane credits a case
```
