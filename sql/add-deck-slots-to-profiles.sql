-- Add deck_slots column to profiles table for multiple deck management
-- This column stores an array of deck objects: { slot_name, spells, wand, core, potions }
-- Migration date: 2026-04-27

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS deck_slots JSONB DEFAULT '[]'::jsonb;

-- Add comment to document the structure
COMMENT ON COLUMN profiles.deck_slots IS 'Array of saved deck slots. Each slot: { slot_name: string, spells: string[], wand: string, core: string, potions: string }';

-- Ensure RLS allows authenticated users to update this column
-- This assumes RLS is enabled and there's a policy for authenticated users
-- If no policy exists, you may need to add one like:
-- CREATE POLICY "Users can update own deck_slots" ON profiles
-- FOR UPDATE USING (auth.uid() = id)
-- WITH CHECK (auth.uid() = id);
