import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import LoginPage from "./pages/LoginPage";
import SignUpPage from "./pages/SignUpPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import MainPage from "./pages/MainPage";
import PendingActivationPage from "./pages/PendingActivationPage";
import { useMe } from "./hooks/useMe";
import ErrorBoundary from "./components/ErrorBoundary";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isDevMode } = useAuth();
  const { profile, loading: meLoading } = useMe();

  // Lần đầu load: chờ auth xong
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gmv-muted">
        Đang tải...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  // Lần đầu load profile: chờ /me (chỉ khi chưa có profile)
  // Khi token refresh (chuyển tab quay lại), profile đã có → không hiện loading
  if (!isDevMode && meLoading && !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gmv-muted">
        Đang tải...
      </div>
    );
  }

  if (!isDevMode && profile && !profile.isActivated && profile.role !== "system") {
    return <PendingActivationPage />;
  }

  return <>{children}</>;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gmv-muted">
        Đang tải...
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Login recovery pages — không redirect dù đã có session (OTP / magic link recovery). */
function AuthFlowRoute({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gmv-muted">
        Đang tải...
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
    <div className="gmv-light-ui min-h-screen">
    <Routes>
      <Route
        path="/login"
        element={
          <GuestRoute>
            <LoginPage />
          </GuestRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <GuestRoute>
            <SignUpPage />
          </GuestRoute>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <AuthFlowRoute>
            <ForgotPasswordPage />
          </AuthFlowRoute>
        }
      />
      <Route
        path="/reset-password"
        element={
          <AuthFlowRoute>
            <ForgotPasswordPage />
          </AuthFlowRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </div>
    </ErrorBoundary>
  );
}
