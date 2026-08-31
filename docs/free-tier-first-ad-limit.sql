-- Free-tier paywall: one live ad, then upgrade.
--
-- User's spec: "the one connection meaning when the first advertisement
-- goes out -- but i want them to see the data and know it works." So the
-- limit is NOT on drafting/generating ad copy (createAutopilotPack and
-- PostGenerator.jsx both stay unlimited -- a user can write as many drafts
-- as they want) and NOT on viewing analytics (no SELECT-side restriction
-- at all, ever). It's specifically on generated_posts.status reaching
-- "posted" -- the moment a free user's first ad actually goes live via
-- PostGenerator.jsx's "Mark as Posted" button (src/components/autopilot/
-- PostGenerator.jsx markAsPosted), or via the LinkedIn/Instagram auto-post
-- routes (api/postToLinkedIn.js, api/postToInstagram.js) which write
-- status: "posted" directly on create. A second post reaching "posted"
-- while still on the free tier is rejected; their first live post and its
-- clicks/conversions/earnings stay fully visible forever.
--
-- Statement-level trigger with a transition table, not row-level: a single
-- INSERT can carry many rows at once (db().GeneratedPost.bulkCreate does
-- one multi-row `insert()` call, used by createAutopilotPack for up to 9
-- draft rows in one shot) and a row-level trigger would see its own
-- statement's earlier rows as "already existing," incorrectly blocking a
-- multi-row batch part-way through. This checks each row's prior state via
-- new_rows once per statement instead.
--
-- Uses NEW.created_by_id, not auth.uid() -- createAutopilotPack.js's writes
-- go through the service-role connection (api/_lib/db.js), where auth.uid()
-- resolves to NULL, which would have silently skipped the check entirely
-- for that path.
-- AFTER trigger, so by the time this runs every row from the statement --
-- whether one row or a bulk multi-row insert -- is already in the table.
-- That means a plain total count (no need to exclude new_rows) already
-- reflects the true post-statement state, and closes a bypass a row-
-- exclusion version would have missed: a single INSERT carrying two
-- status:"posted" rows at once, where each row's own prior-count check
-- would have seen zero *other* posted rows and let both through.
create or replace function public.enforce_free_tier_post_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  tier text;
  posted_count int;
begin
  for rec in select distinct created_by_id from new_rows where status = 'posted' loop
    select subscription_tier into tier from public.profiles where id = rec.created_by_id;
    if tier = 'free' then
      select count(*) into posted_count
      from public.generated_posts
      where created_by_id = rec.created_by_id
        and status = 'posted';
      if posted_count > 1 then
        raise exception 'FREE_TIER_LIMIT: The free plan includes one live ad. Upgrade to Pro or Lifetime to publish more.';
      end if;
    end if;
  end loop;
  return null;
end;
$$;

-- Two separate triggers, not one INSERT OR UPDATE trigger -- Postgres
-- rejects a transition table on a trigger with more than one event, and
-- separately rejects one on a column-list trigger (AFTER UPDATE OF
-- status), so the status filter above happens inside the function instead.
drop trigger if exists enforce_free_tier_post_limit_insert_trg on public.generated_posts;
create trigger enforce_free_tier_post_limit_insert_trg
after insert on public.generated_posts
referencing new table as new_rows
for each statement execute function public.enforce_free_tier_post_limit();

drop trigger if exists enforce_free_tier_post_limit_update_trg on public.generated_posts;
create trigger enforce_free_tier_post_limit_update_trg
after update on public.generated_posts
referencing new table as new_rows
for each statement execute function public.enforce_free_tier_post_limit();
