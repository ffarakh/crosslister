-- Performance: evaluate auth.uid() once per query (not per row) and index foreign keys.

drop policy if exists own_listings on public.listings;
create policy own_listings on public.listings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists own_platform_listings on public.platform_listings;
create policy own_platform_listings on public.platform_listings for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.listings l where l.id = listing_id and l.user_id = (select auth.uid())));

drop policy if exists own_events on public.publish_events;
create policy own_events on public.publish_events for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.listings l where l.id = listing_id and l.user_id = (select auth.uid())));

drop policy if exists own_ebay on public.ebay_connections;
create policy own_ebay on public.ebay_connections for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists own_rate_limits on public.rate_limits;
create policy own_rate_limits on public.rate_limits for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index if not exists platform_listings_user_idx on public.platform_listings(user_id);
create index if not exists publish_events_listing_idx on public.publish_events(listing_id);
create index if not exists publish_events_user_idx on public.publish_events(user_id);
