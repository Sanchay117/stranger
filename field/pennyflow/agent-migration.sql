-- Row Level Security on transactions was turned off outside of migrations,
-- which left the existing per-user policies inert. Turn it back on.
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
