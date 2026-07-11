-- backend/migrations/2026-07-11-dingtalk-enterprise-robot.sql
-- Migration: Switch dingtalk_team_groups from custom webhook to enterprise robot
-- Replaces webhook_url + secret with open_conversation_id
-- Date: 2026-07-11
-- Note: Apply on sandbox first, then prod.

-- Step 1: Add open_conversation_id column
ALTER TABLE public.dingtalk_team_groups
  ADD COLUMN IF NOT EXISTS open_conversation_id TEXT;

-- Step 2: Drop old webhook columns (no data to migrate — table is empty)
ALTER TABLE public.dingtalk_team_groups
  DROP COLUMN IF EXISTS webhook_url,
  DROP COLUMN IF EXISTS secret;

-- Step 3: Make open_conversation_id NOT NULL
ALTER TABLE public.dingtalk_team_groups
  ALTER COLUMN open_conversation_id SET NOT NULL;
