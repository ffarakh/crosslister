-- Crosslister core schema. Every row is owned by one user and protected by RLS.

create table public.listings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,   -- ListingDraft (shared fields, platform overrides, photos)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index listings_user_idx on public.listings(user_id, updated_at desc);

-- One row per (listing, platform). The unique constraint + claim function is the duplicate-prevention lock.
create table public.platform_listings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  listing_id    uuid not null references public.listings(id) on delete cascade,
  platform      text not null check (platform in ('ebay','facebook','vinted')),
  status        text not null default 'idle'
                check (status in ('idle','submitting','published','failed','uncertain','blocked')),
  content_hash  text,
  external_id   text,
  external_url  text,
  attempt       int not null default 0,
  last_error    jsonb,
  submitted_at  timestamptz,
  updated_at    timestamptz not null default now(),
  unique (listing_id, platform)
);

create table public.publish_events (
  id          bigserial primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  listing_id  uuid not null references public.listings(id) on delete cascade,
  platform    text not null,
  status      text not null,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

create table public.ebay_connections (
  user_id             uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  env                 text not null check (env in ('sandbox','production')),
  access_token_enc    text not null,
  refresh_token_enc   text not null,
  access_expires_at   timestamptz not null,
  refresh_expires_at  timestamptz,
  scopes              text,
  defaults            jsonb not null default '{}'::jsonb,  -- policy ids, merchantLocationKey
  updated_at          timestamptz not null default now()
);

alter table public.listings          enable row level security;
alter table public.platform_listings enable row level security;
alter table public.publish_events    enable row level security;
alter table public.ebay_connections  enable row level security;

create policy own_listings on public.listings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- platform rows must belong to the caller AND point at a listing the caller owns
create policy own_platform_listings on public.platform_listings for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
              and exists (select 1 from public.listings l where l.id = listing_id and l.user_id = auth.uid()));

create policy own_events on public.publish_events for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
              and exists (select 1 from public.listings l where l.id = listing_id and l.user_id = auth.uid()));

create policy own_ebay on public.ebay_connections for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Atomically claim the right to submit (listing, platform).
-- Returns claimed=true only if no submission is in flight/uncertain and it isn't already published.
-- SECURITY INVOKER: RLS still applies, so a user can never claim someone else's listing.
create or replace function public.claim_platform_publish(p_listing uuid, p_platform text, p_hash text)
returns table (claimed boolean, status text, external_id text, external_url text, attempt int, submitted_at timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare r public.platform_listings;
begin
  if not exists (select 1 from public.listings l where l.id = p_listing) then
    raise exception 'listing not found' using errcode = 'P0002';
  end if;

  insert into public.platform_listings (listing_id, platform)
  values (p_listing, p_platform)
  on conflict (listing_id, platform) do nothing;

  update public.platform_listings pl
     set status = 'submitting', content_hash = p_hash, attempt = pl.attempt + 1,
         submitted_at = now(), updated_at = now(), last_error = null
   where pl.listing_id = p_listing and pl.platform = p_platform
     and pl.status in ('idle','failed','blocked')
  returning * into r;

  if found then
    return query select true, r.status, r.external_id, r.external_url, r.attempt, r.submitted_at;
  else
    return query select false, pl.status, pl.external_id, pl.external_url, pl.attempt, pl.submitted_at
      from public.platform_listings pl where pl.listing_id = p_listing and pl.platform = p_platform;
  end if;
end $$;

revoke execute on function public.claim_platform_publish(uuid, text, text) from public, anon;
grant execute on function public.claim_platform_publish(uuid, text, text) to authenticated;
