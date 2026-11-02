import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Runs the real migration in an embedded Postgres with a minimal stand-in for Supabase's
 * auth schema, then checks Row Level Security as two different signed-in users.
 */
const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
let db: PGlite;
let listingA: string;

async function as<T>(user: string, sql: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try {
    return await db.query<T>(sql, params);
  } finally {
    await db.exec(`reset role;`);
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated nologin;
    create role anon nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    insert into auth.users values ('${A}'), ('${B}');
  `);
  await db.exec(readFileSync(path.join(__dirname, "../supabase/migrations/0001_init.sql"), "utf8"));
  await db.exec(`
    grant usage on schema public to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant usage on all sequences in schema public to authenticated;
  `);
  const r = await as<{ id: string }>(A, `insert into listings (data) values ('{"shared":{"title":"A item"}}') returning id`);
  listingA = r.rows[0].id;
});

describe("user data isolation (RLS)", () => {
  it("owner sets user_id automatically and can read their listing", async () => {
    const r = await as<{ user_id: string }>(A, `select user_id from listings where id = $1`, [listingA]);
    expect(r.rows[0].user_id).toBe(A);
  });

  it("another user cannot see, update or delete it", async () => {
    expect((await as(B, `select * from listings where id = $1`, [listingA])).rows).toHaveLength(0);
    expect((await as(B, `update listings set data = '{}' where id = $1 returning id`, [listingA])).rows).toHaveLength(0);
    expect((await as(B, `delete from listings where id = $1 returning id`, [listingA])).rows).toHaveLength(0);
    expect((await as<{ data: any }>(A, `select data from listings where id = $1`, [listingA])).rows[0].data.shared.title).toBe("A item");
  });

  it("another user cannot create a listing owned by someone else", async () => {
    await expect(as(B, `insert into listings (user_id, data) values ($1, '{}')`, [A])).rejects.toThrow(/row-level security/);
  });

  it("another user cannot attach platform rows or events to someone else's listing", async () => {
    await expect(as(B, `insert into platform_listings (listing_id, platform) values ($1, 'ebay')`, [listingA])).rejects.toThrow(/row-level security/);
    await expect(as(B, `insert into publish_events (listing_id, platform, status) values ($1, 'ebay', 'published')`, [listingA])).rejects.toThrow(/row-level security/);
  });

  it("another user cannot claim (publish) someone else's listing", async () => {
    await expect(as(B, `select * from claim_platform_publish($1, 'ebay', 'h')`, [listingA])).rejects.toThrow(/listing not found/);
  });

  it("eBay tokens are private per user", async () => {
    await as(A, `insert into ebay_connections (env, access_token_enc, refresh_token_enc, access_expires_at) values ('sandbox','x','y', now())`);
    expect((await as(B, `select * from ebay_connections`)).rows).toHaveLength(0);
    expect((await as(A, `select * from ebay_connections`)).rows).toHaveLength(1);
  });
});

describe("claim_platform_publish (duplicate-prevention lock)", () => {
  it("first claim wins; a second claim while submitting is refused", async () => {
    const one = await as<{ claimed: boolean; status: string }>(A, `select * from claim_platform_publish($1,'ebay','h1')`, [listingA]);
    expect(one.rows[0]).toMatchObject({ claimed: true, status: "submitting" });
    const two = await as<{ claimed: boolean; status: string }>(A, `select * from claim_platform_publish($1,'ebay','h1')`, [listingA]);
    expect(two.rows[0]).toMatchObject({ claimed: false, status: "submitting" });
  });

  it("published and uncertain rows are never re-claimed; failed ones are", async () => {
    for (const [status, expected] of [["published", false], ["uncertain", false], ["failed", true], ["blocked", true]] as const) {
      await as(A, `update platform_listings set status = $2 where listing_id = $1 and platform = 'ebay'`, [listingA, status]);
      const r = await as<{ claimed: boolean }>(A, `select * from claim_platform_publish($1,'ebay','h')`, [listingA]);
      expect(r.rows[0].claimed, status).toBe(expected);
    }
  });

  it("only one row can ever exist per listing and platform", async () => {
    await expect(as(A, `insert into platform_listings (listing_id, platform) values ($1, 'ebay')`, [listingA])).rejects.toThrow(/duplicate key/);
  });
});
