-- Add bot-related columns to profiles table
-- Run this SQL in Supabase SQL Editor

-- Add is_bot column to identify bot accounts
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT FALSE;

-- Add simulated_online column to control which bots appear in online list
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS simulated_online BOOLEAN DEFAULT FALSE;

-- Create index for faster bot queries
CREATE INDEX IF NOT EXISTS idx_profiles_bot_online 
ON profiles(is_bot, simulated_online) 
WHERE is_bot = TRUE;

-- Comment to document the purpose
COMMENT ON COLUMN profiles.is_bot IS 'Identifies if a profile is a bot account (non-human player)';
COMMENT ON COLUMN profiles.simulated_online IS 'Controls which bots appear in the online list (simulates login/logout)';
