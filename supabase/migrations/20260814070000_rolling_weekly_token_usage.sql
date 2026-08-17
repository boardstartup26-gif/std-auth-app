-- Switch increment_usage() from a calendar-day cap to a rolling 7-day
-- (weekly) window. The usage table keeps its existing shape — one row per
-- user per calendar day (IST) — but the limit check now sums token_count
-- over [p_date - 6, p_date] instead of reading just p_date's row, and the
-- upsert still only touches today's (p_date) row.
--
-- The sum-then-upsert is not a single atomic statement the way the old
-- `ON CONFLICT ... WHERE token_count + p_cost <= p_limit` guard was, so a
-- per-user advisory transaction lock serializes concurrent requests for the
-- same user and preserves the reserve-before-spend atomicity guarantee.
CREATE OR REPLACE FUNCTION "public"."increment_usage"("p_user_id" "uuid", "p_date" "date", "p_cost" integer, "p_limit" integer) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  window_start date := p_date - 6;
  existing_total int;
  new_total int;
BEGIN
  -- Serialize concurrent requests for this user for the duration of the
  -- transaction (released automatically on commit/rollback).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  SELECT COALESCE(SUM(token_count), 0) INTO existing_total
  FROM usage
  WHERE user_id = p_user_id
    AND usage_date BETWEEN window_start AND p_date;

  new_total := existing_total + p_cost;
  IF new_total > p_limit THEN
    RAISE EXCEPTION 'TOKEN_LIMIT_EXCEEDED';
  END IF;

  INSERT INTO usage (user_id, usage_date, token_count)
  VALUES (p_user_id, p_date, p_cost)
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET token_count = usage.token_count + p_cost;

  RETURN new_total;
END;
$$;
