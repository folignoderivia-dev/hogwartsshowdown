-- Add last_reset_date column to world_boss_state table
-- This column tracks when the boss was last reset (either by defeat or daily reset)
-- Migration date: 2026-04-27

ALTER TABLE world_boss_state 
ADD COLUMN IF NOT EXISTS last_reset_date TIMESTAMPTZ DEFAULT NOW();

-- Update existing rows to set initial last_reset_date
UPDATE world_boss_state 
SET last_reset_date = NOW() 
WHERE last_reset_date IS NULL;
