## Tried on real apps we didn't write

We ran Stranger on Notely, a Lovable notes app that loads data through TanStack Start server functions.
We tested a local copy on a throwaway Supabase database. We never tested the hosted app.
The app as shipped returned [CLEAN](https://stranger-2yf3.vercel.app/runs/115d8f/).
Turning off row-level security in our local database gave Kane a [visible leak](https://stranger-2yf3.vercel.app/runs/e7ff8f/).
Filtering notes in the app's server code hid the note from the page. Stranger still [found it in Supabase](https://stranger-2yf3.vercel.app/runs/106ece/).
That test led to two changes in Stranger. It can now check tables behind server functions and write a fix brief when row-level security was turned off.

PennyFlow, a Vite finance tracker that reads Supabase from the browser, closed the whole loop: [CLEAN](https://stranger-2yf3.vercel.app/runs/3555e0/) as shipped, a [LEAK](https://stranger-2yf3.vercel.app/runs/56eb00/) with row-level security turned off in our local database, a migration written by a fresh Claude Code agent from the fix brief alone, then [CLEAN](https://stranger-2yf3.vercel.app/runs/10dfea/) with a fresh canary.
See the [field-test notes and fix brief](field/README.md) for the full evidence.
