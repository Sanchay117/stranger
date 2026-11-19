# Stranger found a data leak

Owner: **maya@duebook.demo**. Stranger: **stranger@duebook.demo**.

- Canary the owner planted: `stranger-canary-7220a5`
- How it showed up: on the owner's own record page, which the stranger opened by its address (http://localhost:5231/bench/?case=detail_page&note=345e95a9-1acb-4db5-bfb5-d5e2ed251281)
- Table: `bench_detail_page`
- Kane's failing check: assert: the text "stranger-canary-7220a5" is not shown on that page either
- Kane run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7T85EAGETJ9DG02M1F9XS7X/dashboard/share/US_WWDE90TAK0QDFE0RJ0XMQSJEL9QKC46A8Z6IEDGY20WJS55HMIEPLQLZD40O3JQE?type=summary&agentView=true&fqdn=summary-page
- Full report: .stranger/report.md

## What to fix

The list page hid the owner's record, but its own page (http://localhost:5231/bench/?case=detail_page&note=345e95a9-1acb-4db5-bfb5-d5e2ed251281) showed it to the stranger. Whatever loads one record by its id does not check who is asking.

The pages called `bench_detail_page_get()` (04_detail_page.sql): a `security definer` function that takes the record's id. It reads the table with its creator's rights, so row level security never applies, and it is the likely loader of that page. (Stranger never calls a function that takes arguments itself, so this is where to look, not a second proof.) The table's own read policy may be fine.

Make it run with the caller's rights, or check the owner inside it, in a new migration:

```sql
alter function public.bench_detail_page_get security invoker;
-- or keep it security definer and add  and user_id = (select auth.uid())  to its where clause
```

Do not fix this by filtering rows in the page or the client code. The data still reaches the browser, and anyone can call the API directly.

## Done means

Run `stranger run` again. It plants a fresh canary each time. The fix is done when it prints CLEAN.
