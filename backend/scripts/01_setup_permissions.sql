-- Khởi tạo bảng department_permissions và permission_overrides cho hệ thống phân quyền động
-- Chạy script này trong Supabase SQL Editor

-- 1. Bảng phân quyền theo bộ phận (Department Permissions)
CREATE TABLE IF NOT EXISTS public.department_permissions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    department TEXT NOT NULL,
    module_key TEXT NOT NULL,
    access_level TEXT NOT NULL CHECK (access_level IN ('none', 'read', 'full')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(department, module_key)
);

-- Bật RLS nhưng cho phép authenticated users access qua API (hoặc Service Role access)
ALTER TABLE public.department_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for service role" ON public.department_permissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable read access for authenticated users" ON public.department_permissions FOR SELECT TO authenticated USING (true);

-- 2. Bảng phân quyền vượt cấp cá nhân (Permission Overrides)
CREATE TABLE IF NOT EXISTS public.permission_overrides (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_email TEXT NOT NULL,
    module_key TEXT NOT NULL,
    access_level TEXT NOT NULL CHECK (access_level IN ('none', 'read', 'full')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(user_email, module_key)
);

ALTER TABLE public.permission_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for service role" ON public.permission_overrides FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable read access for authenticated users" ON public.permission_overrides FOR SELECT TO authenticated USING (true);

-- 3. Tạo function tự động update updated_at (Tên riêng biệt để không ghi đè function hệ thống)
CREATE OR REPLACE FUNCTION public.permissions_handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Gắn trigger cho 2 bảng
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_department_permissions_updated_at') THEN
    CREATE TRIGGER set_department_permissions_updated_at
    BEFORE UPDATE ON public.department_permissions
    FOR EACH ROW
    EXECUTE FUNCTION public.permissions_handle_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_permission_overrides_updated_at') THEN
    CREATE TRIGGER set_permission_overrides_updated_at
    BEFORE UPDATE ON public.permission_overrides
    FOR EACH ROW
    EXECUTE FUNCTION public.permissions_handle_updated_at();
  END IF;
END $$;


