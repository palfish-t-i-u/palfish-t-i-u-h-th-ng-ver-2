-- Add min_role column to department_permissions
-- Valid values: 'sale' (all users), 'leader' (leader+admin), 'manager' (admin only)
-- Default 'sale' = backward compatible (all roles get the permission)
ALTER TABLE department_permissions
  ADD COLUMN IF NOT EXISTS min_role TEXT NOT NULL DEFAULT 'sale';
