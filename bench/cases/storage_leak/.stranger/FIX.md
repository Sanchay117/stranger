# Stranger found a data leak

Owner: **maya@duebook.demo**. Stranger: **stranger@duebook.demo**.

- Canary the owner planted: `stranger-canary-46d442`
- How it showed up: in a file the stranger could download or list
- Table: `bench_storage_leak`
- LEAK: The owner's file in the `bench-files` storage bucket: the stranger could download it, the stranger could see it in a listing.
- Kane run: https://test-manager.lambdatest.com/projects/01M7MEBMA112B980E8N84CQZNQ/test-cases/01M7TACZWFZV12211TQP06BK3D/dashboard/share/US_6F4IKTUFA2G5KP95WORLKY5B45WCSY3B9N6XGKYGN1UV23M9JXF35PASDYB3V7KD?type=summary&agentView=true&fqdn=summary-page
- Full report: .stranger/report.md

## What to fix

Files in `bench-files` are readable by accounts that don't own them. Supabase Storage keeps files in `storage.objects`, and its policies decide who can read each file. A public bucket skips them for downloads altogether.

Your migrations leave these open read policies on storage.objects:

- `"Bench: signed-in users can read files"` (08_storage_leak.sql): `using (bucket_id = 'bench-files')`

Keep the bucket private and upload each file under the owner's id (`<user id>/file.txt`), then only let owners read their own folder:

```sql
update storage.buckets set public = false where id = 'bench-files';
drop policy if exists "Bench: signed-in users can read files" on storage.objects;
create policy "Owners can read their own files" on storage.objects
  for select to authenticated
  using (bucket_id in ('bench-files') and (storage.foldername(name))[1] = (select auth.uid())::text);
```

Do not fix this by filtering rows in the page or the client code. The data still reaches the browser, and anyone can call the API directly.

## Done means

Run `stranger run` again. It plants a fresh canary each time. The fix is done when it prints CLEAN.
