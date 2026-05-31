import { useAuth } from "../hooks/useAuth";
import { useMe } from "../hooks/useMe";
import { Button } from "./ui";

export default function PendingActivationPage() {
  const { user, signOut } = useAuth();
  const { profile } = useMe();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gmv-bg p-6">
      <div className="w-full max-w-md rounded-gmv-lg border border-gmv-border bg-gmv-canvas p-8 text-center shadow-gmv-card">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-2xl">
          ⏳
        </div>
        <h1 className="text-xl font-bold text-gmv-text-strong">Tài khoản chờ kích hoạt</h1>
        <p className="mt-3 text-sm leading-relaxed text-gmv-muted">
          {profile?.email || user?.email} đã đăng ký thành công. Admin sẽ liên kết CRM, phân quyền và kích hoạt
          trước khi bạn sử dụng hệ thống.
        </p>
        <p className="mt-2 text-xs text-gmv-muted">Liên hệ quản trị nếu cần hỗ trợ gấp.</p>
        <Button type="button" variant="secondary" className="mt-6 w-full" onClick={() => signOut()}>
          Đăng xuất
        </Button>
      </div>
    </div>
  );
}
