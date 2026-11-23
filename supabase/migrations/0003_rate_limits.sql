-- Per-user fixed-window rate limiting (protects AI spend and eBay API quota).
create table if not exists public.rate_limits (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  bucket       text not null,
  window_start timestamptz not null default now(),
  count        int not null default 0,
  primary key (user_id, bucket)
);
alter table public.rate_limits enable row level security;
drop policy if exists own_rate_limits on public.rate_limits;
create policy own_rate_limits on public.rate_limits for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.bump_rate_limit(p_bucket text, p_max int, p_window_seconds int)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare cur public.rate_limits;
begin
  insert into public.rate_limits (bucket, window_start, count)
  values (p_bucket, now(), 0)
  on conflict (user_id, bucket) do nothing;

  select * into cur from public.rate_limits
   where user_id = auth.uid() and bucket = p_bucket for update;

  if cur.window_start < now() - make_interval(secs => p_window_seconds) then
    update public.rate_limits set window_start = now(), count = 1
     where user_id = auth.uid() and bucket = p_bucket;
    return true;
  end if;

  if cur.count >= p_max then
    return false;
  end if;

  update public.rate_limits set count = count + 1
   where user_id = auth.uid() and bucket = p_bucket;
  return true;
end $$;

revoke execute on function public.bump_rate_limit(text, int, int) from public, anon;
grant execute on function public.bump_rate_limit(text, int, int) to authenticated;
