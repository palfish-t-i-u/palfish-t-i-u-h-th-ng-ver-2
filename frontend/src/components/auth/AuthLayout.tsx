import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

function Logo() {
  return (
    <div className="auth-logo">
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <rect width="36" height="36" rx="9" fill="rgba(255,255,255,0.2)" />
        <rect x="6" y="6" width="10" height="10" rx="2.5" fill="white" opacity="0.9" />
        <rect x="20" y="6" width="10" height="10" rx="2.5" fill="white" opacity="0.9" />
        <rect x="6" y="20" width="10" height="10" rx="2.5" fill="white" opacity="0.9" />
        <rect x="20" y="20" width="10" height="10" rx="2.5" fill="white" opacity="0.4" />
      </svg>
    </div>
  );
}

export default function AuthLayout({ children, title, subtitle }: Props) {
  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <div className="auth-brand-inner">
          <Logo />
          <h1 className="auth-brand-title">PalFish GMV</h1>
          <p className="auth-brand-desc">
            Hệ thống quản lý doanh thu & đối soát thanh toán
          </p>
          <div className="auth-brand-features">
            <div className="auth-feature">
              <span className="auth-feature-icon">📊</span>
              <div>
                <div className="auth-feature-label">Dashboard doanh thu</div>
                <div className="auth-feature-desc">Theo dõi KPI theo thời gian thực</div>
              </div>
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon">💳</span>
              <div>
                <div className="auth-feature-label">Quản lý thanh toán</div>
                <div className="auth-feature-desc">Tạo & theo dõi yêu cầu thanh toán</div>
              </div>
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon">🔄</span>
              <div>
                <div className="auth-feature-label">Đối soát tự động</div>
                <div className="auth-feature-desc">So khớp dữ liệu CRM & ngân hàng</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="auth-content">
        <div className="auth-card">
          <h2 className="auth-title">{title}</h2>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}
