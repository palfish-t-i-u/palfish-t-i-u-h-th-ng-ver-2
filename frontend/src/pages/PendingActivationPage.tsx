import { useAuth } from "../hooks/useAuth";
import { useMe } from "../hooks/useMe";
import { Button } from "../components/ui";
import AuthLayout from "../components/auth/AuthLayout";
import "../components/auth/auth.css";

export default function PendingActivationPage() {
  const { user, signOut } = useAuth();
  const { profile } = useMe();

  return (
    <AuthLayout title="Tài khoản chờ kích hoạt">
      <div className="auth-pending">
        <div className="auth-pending-icon">⏳</div>
        <h3>Đang chờ admin duyệt</h3>
        <p>
          Tài khoản <strong>{profile?.email || user?.email}</strong> đã đăng ký thành công.
        </p>
        <p>
          Admin sẽ liên kết CRM, phân quyền vai trò và kích hoạt tài khoản
          trước khi bạn có thể sử dụng hệ thống.
        </p>
        <p style={{ marginTop: 8, fontSize: 12, color: "var(--gmv-muted)" }}>
          Liên hệ quản trị nếu cần hỗ trợ gấp.
        </p>
      </div>
      <div style={{ marginTop: 24 }}>
        <Button type="button" variant="secondary" fullWidth onClick={() => signOut()}>
          Đăng xuất
        </Button>
      </div>
    </AuthLayout>
  );
}
