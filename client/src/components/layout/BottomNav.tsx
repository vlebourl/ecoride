import { NavLink } from "react-router";
import {
  LayoutDashboard,
  Bike,
  BarChart3,
  Trophy,
  User,
} from "lucide-react";

const tabs = [
  { to: "/", icon: LayoutDashboard, label: "Accueil" },
  { to: "/trip", icon: Bike, label: "Trajet" },
  { to: "/stats", icon: BarChart3, label: "Stats" },
  { to: "/leaderboard", icon: Trophy, label: "Classement" },
  { to: "/profile", icon: User, label: "Profil" },
] as const;

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around bg-surface/90 px-4 pb-8 pt-3 backdrop-blur-2xl border-t border-outline-variant/10">
      {tabs.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 transition-all duration-150 active:scale-90 ${
              isActive
                ? "text-primary-light rounded-2xl bg-primary/10 px-3 py-1.5"
                : "text-text-dim hover:text-text-muted px-2 py-1.5"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={22} strokeWidth={isActive ? 2.2 : 1.8} />
              <span className="text-[10px] font-bold uppercase tracking-widest">
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
