import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";

const TripPage = lazy(() => import("@/pages/TripPage").then((m) => ({ default: m.TripPage })));
const StatsPage = lazy(() => import("@/pages/StatsPage").then((m) => ({ default: m.StatsPage })));
const LeaderboardPage = lazy(() =>
  import("@/pages/LeaderboardPage").then((m) => ({
    default: m.LeaderboardPage,
  })),
);
const ProfilePage = lazy(() =>
  import("@/pages/ProfilePage").then((m) => ({ default: m.ProfilePage })),
);
const NotFoundPage = lazy(() =>
  import("@/pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })),
);
const PrivacyPage = lazy(() =>
  import("@/pages/PrivacyPage").then((m) => ({ default: m.PrivacyPage })),
);

function LoadingSpinner() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="trip" element={<TripPage />} />
            <Route path="stats" element={<StatsPage />} />
            <Route path="leaderboard" element={<LeaderboardPage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
