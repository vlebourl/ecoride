import { NavLink } from "react-router";
import { LayoutDashboard, Bike, BarChart3, Trophy, User } from "lucide-react";
import { NAV_ROUTES } from "@/lib/navTabs";

const icons = {
  "/": { icon: LayoutDashboard, label: "Accueil" },
  "/trip": { icon: Bike, label: "Trajet" },
  "/stats": { icon: BarChart3, label: "Stats" },
  "/leaderboard": { icon: Trophy, label: "Classement" },
  "/profile": { icon: User, label: "Profil" },
} as const;

const tabs = NAV_ROUTES.map((to) => ({ to, ...icons[to] }));

export function BottomNav() {
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-outline-variant/10 bg-surface/90 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0.5rem))] backdrop-blur-2xl sm:px-4"
    >
      {tabs.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            `flex min-h-[44px] min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1 transition-all duration-150 active:scale-90 ${
              isActive
                ? "rounded-xl bg-primary/10 px-2 py-1 text-primary-light"
                : "text-text-dim hover:text-text-muted"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span className="flex h-5 w-5 items-center justify-center sm:h-6 sm:w-6">
                <Icon
                  size={18}
                  className="h-[18px] w-[18px] sm:h-5 sm:w-5"
                  strokeWidth={isActive ? 2.2 : 1.8}
                  aria-hidden="true"
                />
              </span>
              <span className="max-w-[56px] truncate text-center text-[10px] font-bold uppercase tracking-wider sm:max-w-none sm:text-xs sm:tracking-widest">
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
