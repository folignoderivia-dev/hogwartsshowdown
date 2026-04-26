-- Create app_errors table for logging application errors
CREATE TABLE IF NOT EXISTS app_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  error_name TEXT NOT NULL,
  error_message TEXT NOT NULL,
  component TEXT,
  stack_trace TEXT,
  url TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries by timestamp
CREATE INDEX IF NOT EXISTS idx_app_errors_created_at ON app_errors(created_at DESC);

-- Create index for faster queries by user_id
CREATE INDEX IF NOT EXISTS idx_app_errors_user_id ON app_errors(user_id);

-- Create index for faster queries by error_name
CREATE INDEX IF NOT EXISTS idx_app_errors_error_name ON app_errors(error_name);

-- Optional: Create a view for admin dashboard with aggregated error stats
CREATE OR REPLACE VIEW error_stats AS
SELECT 
  error_name,
  COUNT(*) as error_count,
  COUNT(DISTINCT user_id) as affected_users,
  MAX(created_at) as last_occurrence
FROM app_errors
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY error_name
ORDER BY error_count DESC;

-- Grant permissions for authenticated users
GRANT SELECT, INSERT ON app_errors TO authenticated;
GRANT SELECT ON error_stats TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Enable Row Level Security (RLS)
ALTER TABLE app_errors ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert their own errors
CREATE POLICY "Users can insert their own errors" ON app_errors
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

-- Allow authenticated users to select all errors (for admin panel)
CREATE POLICY "Users can select all errors" ON app_errors
  FOR SELECT
  TO authenticated
  USING (true);

