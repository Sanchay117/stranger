# Stranger found a data leak

Owner: **maya@duebook.demo**. Stranger: **stranger@duebook.demo**.

- Canary the owner planted: `stranger-canary-ba95e5`
- How it showed up: in the app's live updates
- Table: `bench_broadcast_leak`
- LEAK: Listening to the app's live updates, the stranger received the owner's new row the moment it was saved (broadcast on `bench_broadcast_leak:{owner}`).
- Kane run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7TAKR079PYZ3VK5V243BEZK/dashboard/share/US_WOB2MN6YHU91JFCV8TTFC19EYU5DV3UE1B52U2ZFK67TZIPX6Z4ITFPPR8GEO932?type=summary&agentView=true&fqdn=summary-page
- Full report: .stranger/report.md

## What to fix

The stranger joined a live-updates channel named after the owner and heard the owner's new row. Broadcast channels are public unless they are marked private, and their names are easy to guess, so anyone who knows the name hears everything sent on it.

Send on a private channel and add a policy on `realtime.messages` that only lets each user join their own topic:

```sql
-- where the row is sent, the last argument makes the message private
perform realtime.send(payload, 'new_row', 'bench_broadcast_leak:' || new.user_id::text, true);

create policy "Users hear only their own topic" on realtime.messages
  for select to authenticated
  using ((select realtime.topic()) = 'bench_broadcast_leak:' || (select auth.uid())::text);
```

In the client, join with `supabase.channel(topic, { config: { private: true } })`.

Do not fix this by filtering rows in the page or the client code. The data still reaches the browser, and anyone can call the API directly.

## Done means

Run `stranger run` again. It plants a fresh canary each time. The fix is done when it prints CLEAN.
