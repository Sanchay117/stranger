// The bench: one small notes app, ten ways to break it. Each case has its own table (and sometimes a
// view, a database function, a storage bucket or a live channel), set up by bench/migrations/.
// Shared by the bench page, the scorecard and bench/run.mjs.
//
// read:   how the "Your notes" list loads ('all' trusts the database, 'mine' adds user_id=eq.<me>,
//         'rpc' calls a function and filters in the browser, 'view' reads a view with user_id=eq.<me>)
// detail: how a note's own page loads it ('rpc' through a function by id, 'table' through the table)
// open:   after saving, go to the new note's own page (so the owner's run visits a record address)
// expect: what Stranger should say, and which check should say it
export const CASES = [
  {
    id: 'rls_off',
    table: 'bench_rls_off',
    read: 'all',
    title: 'Row level security off',
    bug: 'The table never turns on row level security, so every account, and anyone with the public key, reads every row.',
    expect: { verdict: 'LEAK', seen: ['page', 'network', 'anonymous'] },
    check: 'Kane sees the owner\'s note on the stranger\'s page',
  },
  {
    id: 'client_filter',
    table: 'bench_client_filter',
    read: 'mine',
    title: 'Filtered in the page only',
    bug: 'The page asks only for its own rows, but the read policy lets any signed-in account read all of them.',
    expect: { verdict: 'LEAK', seen: ['network'] },
    check: "The owner's own page read, sent again with the stranger's login",
  },
  {
    id: 'leaky_view',
    table: 'bench_leaky_view',
    view: 'bench_leaky_view_list',
    read: 'view',
    title: 'View without security_invoker',
    bug: 'The table is locked down, but the page reads a view that runs with its creator\'s rights, so row level security never applies.',
    expect: { verdict: 'LEAK', seen: ['network'] },
    check: "The owner's read of the view, sent again with the stranger's login",
  },
  {
    id: 'leaky_rpc',
    table: 'bench_leaky_rpc',
    rpc: 'bench_leaky_rpc_mine',
    read: 'rpc',
    title: 'Database function returns everyone\'s rows',
    bug: '"My notes" comes from a security definer function that forgets to filter by the caller. The page hides the rest.',
    expect: { verdict: 'LEAK', seen: ['network'] },
    check: "The function call, sent again with the stranger's login",
  },
  {
    id: 'detail_page',
    table: 'bench_detail_page',
    get: 'bench_detail_page_get',
    read: 'all',
    detail: 'rpc',
    open: true,
    title: 'Record page skips the owner check',
    bug: 'The list is scoped, but each note\'s own page loads it by id through a function that never checks who is asking.',
    expect: { verdict: 'LEAK', seen: ['direct-link'] },
    check: "Kane opens the owner's note page by its address, as the stranger",
  },
  {
    id: 'forged_insert',
    table: 'bench_forged_insert',
    read: 'all',
    title: 'Insert without a "with check"',
    bug: 'Reads and edits are scoped, but the insert policy never checks the owner column, so anyone can add notes to someone else\'s account.',
    expect: { verdict: 'TAMPER', seen: ['forged'] },
    check: "A row in the owner's name, sent with the stranger's login",
  },
  {
    id: 'leaky_total',
    table: 'bench_leaky_total',
    total: 'bench_leaky_total_sum',
    read: 'all',
    title: 'Total adds up everyone',
    bug: 'Every policy is right, but the total on the page comes from a view that sums every account. No text leaks, only a number.',
    expect: { verdict: 'LEAK', seen: ['aggregate'] },
    check: "Numeric canary: the stranger's total moves when only the owner adds a note",
  },
  {
    id: 'storage_leak',
    table: 'bench_storage_leak',
    bucket: 'bench-files',
    read: 'all',
    title: 'Files readable by any account',
    bug: 'Each note is also saved as a file under the owner\'s folder, but the storage policy only checks the bucket.',
    expect: { verdict: 'LEAK', seen: ['storage'] },
    check: "The owner uploads a canary file; the stranger downloads and lists it",
  },
  {
    id: 'broadcast_leak',
    table: 'bench_broadcast_leak',
    live: true,
    read: 'all',
    title: 'Live updates on a public channel',
    bug: 'New notes are broadcast on the public channel bench_broadcast_leak:<user id>. Anyone who joins it hears them.',
    expect: { verdict: 'LEAK', seen: ['realtime'] },
    check: "The stranger listens on the owner's likely channels while the owner saves a note",
  },
  {
    id: 'all_good',
    table: 'bench_all_good',
    bucket: 'bench-good',
    read: 'all',
    detail: 'table',
    open: true,
    title: 'Nothing wrong (control)',
    bug: 'Owner-only policies for every action, a private bucket scoped to the owner\'s folder, and a note page that reads through row level security.',
    expect: { verdict: 'CLEAN', seen: [] },
    check: 'Every check runs, and none should fire',
  },
]

// What Stranger does not catch, said plainly on the scorecard. Not run on the bench.
export const LIMITS = [
  'A database function that may write (not marked stable or immutable) or that needs arguments Kane did not log: Stranger never calls it on its own. The detail_page case is caught through its page instead.',
  'Apps whose server reads the database with the service key (API routes, server actions): the page check and replays still run, but the forged owner, files and live-update checks speak Supabase only.',
  'Pages Kane never visits. Stranger checks what the owner\'s and the stranger\'s runs touch, and lists the user tables it did not reach.',
]

export const caseById = (id) => CASES.find((c) => c.id === id) ?? null

// Did a run find what the case planted? The expected verdict, and when the case names checks,
// one of them is where it was found.
export function caught(c, run) {
  if (!run) return null
  if (run.verdict !== c.expect.verdict) return false
  if (!c.expect.seen.length) return true
  const seen = new Set([run.seen, ...(run.findings ?? []).map((f) => f.seen)].filter(Boolean))
  return c.expect.seen.some((s) => seen.has(s))
}
