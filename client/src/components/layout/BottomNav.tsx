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
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around bg-surface/90 px-2 sm:px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom,0.5rem))] pt-2 backdrop-blur-2xl border-t border-outline-variant/10"
    >
      {tabs.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-0 transition-all duration-150 active:scale-90 ${
              isActive
                ? "text-primary-light rounded-xl bg-primary/10 px-2 py-1"
                : "text-text-dim hover:text-text-muted px-1 py-1"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                size={20}
                className="sm:w-6 sm:h-6"
                strokeWidth={isActive ? 2.2 : 1.8}
                aria-hidden="true"
              />
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider sm:tracking-widest truncate max-w-[56px] sm:max-w-none text-center">
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
