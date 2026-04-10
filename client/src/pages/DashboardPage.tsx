import { useState, useMemo, useRef, useCallback } from "react";
import { Link } from "react-router";
import {
  Bike,
  Leaf,
  MapPin,
  Megaphone,
  ChevronRight,
  Car,
  X,
  CloudOff,
  Euro,
  Route,
  Bell,
  AlertTriangle,
} from "lucide-react";
import { useDashboardSummary, useProfile, useActiveAnnouncement } from "@/hooks/queries";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { getPendingTrips, getRejectedTrips } from "@/lib/offline-queue";
import { PageHeader } from "@/components/layout/PageHeader";
import { useT } from "@/i18n/provider";
import type { TranslationKey } from "@/i18n/locales/fr";
import appLogo from "/pwa-192x192.png?url";

interface Milestone {
  value: number;
  labelKey: TranslationKey;
}

// --- Milestone data ---
// Money: subjective price comparisons (approximate French prices 2024)
const MONEY_MILESTONES: Milestone[] = [
  { value: 5, labelKey: "dashboard.milestones.money.coffee" },
  { value: 15, labelKey: "dashboard.milestones.money.cinema" },
  { value: 30, labelKey: "dashboard.milestones.money.restaurant" },
  { value: 75, labelKey: "dashboard.milestones.money.fuelTank" },
  { value: 150, labelKey: "dashboard.milestones.money.bikeService" },
  { value: 300, labelKey: "dashboard.milestones.money.weekendFrance" },
  { value: 750, labelKey: "dashboard.milestones.money.usedBike" },
  { value: 1500, labelKey: "dashboard.milestones.money.ebike" },
  { value: 3000, labelKey: "dashboard.milestones.money.sunVacation" },
  { value: 5000, labelKey: "dashboard.milestones.money.yearlyTransport" },
  { value: 10000, labelKey: "dashboard.milestones.money.savedCar" },
];

// KM: real distances (road: Google Maps, flight: great circle)
const KM_MILESTONES: Milestone[] = [
  { value: 10, labelKey: "dashboard.milestones.km.firstRide" },
  { value: 100, labelKey: "dashboard.milestones.km.hundred" },
  { value: 500, labelKey: "dashboard.milestones.km.parisLyon" },
  { value: 1000, labelKey: "dashboard.milestones.km.parisBarcelona" },
  { value: 2500, labelKey: "dashboard.milestones.km.parisIstanbul" },
  { value: 3500, labelKey: "dashboard.milestones.km.tourDeFrance" },
  { value: 6000, labelKey: "dashboard.milestones.km.parisNewYork" },
  { value: 10000, labelKey: "dashboard.milestones.km.quarterEarth" },
  { value: 40000, labelKey: "dashboard.milestones.km.aroundWorld" },
];

// CO2: car equivalents (ADEME: 7 L/100km × 2.31 kg/L = 0.162 kg/km)
// Aviation: DGAC emission factors per passenger
const CO2_MILESTONES: Milestone[] = [
  { value: 5, labelKey: "dashboard.milestones.co2.airportTrip" },
  { value: 20, labelKey: "dashboard.milestones.co2.parisRouen" },
  { value: 50, labelKey: "dashboard.milestones.co2.parisRennes" },
  { value: 75, labelKey: "dashboard.milestones.co2.parisLyonCar" },
  { value: 150, labelKey: "dashboard.milestones.co2.flightGeneva" },
  { value: 250, labelKey: "dashboard.milestones.co2.flightRome" },
  { value: 500, labelKey: "dashboard.milestones.co2.flightMarrakech" },
  { value: 1000, labelKey: "dashboard.milestones.co2.oneTonne" },
  { value: 1500, labelKey: "dashboard.milestones.co2.flightNewYork" },
  { value: 2500, labelKey: "dashboard.milestones.co2.flightJohannesburg" },
  { value: 5000, labelKey: "dashboard.milestones.co2.frenchFootprint" },
  { value: 10000, labelKey: "dashboard.milestones.co2.tenTonnes" },
];

function getNextMilestone(current: number, milestones: Milestone[]) {
  const next = milestones.find((m) => m.value > current);
  if (!next) {
    const last = milestones[milestones.length - 1]!;
    return { target: last.value, labelKey: last.labelKey, progress: 1 };
  }
  const prev = milestones.filter((m) => m.value <= current).pop();
  const base = prev?.value ?? 0;
  const progress = (current - base) / (next.value - base);
  return { target: next.value, labelKey: next.labelKey, progress: Math.min(progress, 1) };
}

export function DashboardPage() {
  const t = useT();
  const { data: today, isPending: todayPending } = useDashboardSummary("day");
  const { data: allTime, isPending: allTimePending } = useDashboardSummary("all");
  const { data: profileData } = useProfile();
  const [vehiclePromptDismissed, setVehiclePromptDismissed] = useState(false);
  const [notifPromptDismissed, setNotifPromptDismissed] = useState(
    () => localStorage.getItem("ecoride:notification-prompt-dismissed") === "true",
  );
  const push = usePushNotifications();
  const { data: announcement } = useActiveAnnouncement();
  const [dismissedAnnouncementId, setDismissedAnnouncementId] = useState<string | null>(() =>
    localStorage.getItem("ecoride:ann-dismissed"),
  );
  const [dismissedRejectedSyncSignature, setDismissedRejectedSyncSignature] = useState<
    string | null
  >(() => localStorage.getItem("ecoride:rejected-sync-dismissed"));
  const annSwipeRef = useRef<{ startX: number; currentX: number }>({ startX: 0, currentX: 0 });
  const annRef = useRef<HTMLDivElement>(null);

  const dismissAnn = useCallback(() => {
    if (!announcement) return;
    localStorage.setItem("ecoride:ann-dismissed", announcement.id);
    setDismissedAnnouncementId(announcement.id);
  }, [announcement]);

  const showAnn = !!announcement && dismissedAnnouncementId !== announcement.id;

  const pendingTrips = getPendingTrips();
  const rejectedTrips = getRejectedTrips();
  const rejectedSyncSignature =
    rejectedTrips.length > 0 ? `${rejectedTrips[0]!.rejectedAt}:${rejectedTrips.length}` : null;
  const dismissRejectedSync = useCallback(() => {
    if (!rejectedSyncSignature) return;
    localStorage.setItem("ecoride:rejected-sync-dismissed", rejectedSyncSignature);
    setDismissedRejectedSyncSignature(rejectedSyncSignature);
  }, [rejectedSyncSignature]);
  const showRejectedSync =
    rejectedSyncSignature !== null && dismissedRejectedSyncSignature !== rejectedSyncSignature;

  const isPending = todayPending || allTimePending;

  // MUST be before any early return to respect Rules of Hooks
  const milestones = useMemo(
    () =>
      allTime
        ? [
            {
              key: "eur",
              icon: <Euro size={16} className="text-primary-light" />,
              current: allTime.totalMoneySavedEur,
              unit: "€",
              ...getNextMilestone(allTime.totalMoneySavedEur, MONEY_MILESTONES),
            },
            {
              key: "km",
              icon: <Route size={16} className="text-primary-light" />,
              current: allTime.totalDistanceKm,
              unit: "km",
              ...getNextMilestone(allTime.totalDistanceKm, KM_MILESTONES),
            },
            {
              key: "co2",
              icon: <Leaf size={16} className="text-primary-light" />,
              current: allTime.totalCo2SavedKg,
              unit: "kg",
              ...getNextMilestone(allTime.totalCo2SavedKg, CO2_MILESTONES),
            },
          ]
        : [],
    [allTime],
  );

  if (isPending || !today || !allTime) {
    return (
      <div
        className="flex flex-1 items-center justify-center"
        role="status"
        aria-label={t("dashboard.loadingAria")}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const isNewUser = allTime.tripCount === 0;

  return (
    <>
      <PageHeader title={t("dashboard.header.title")} titleHidden />

      {/* Admin announcement banner (swipable) */}
      {showAnn && (
        <div
          ref={annRef}
          data-testid="announcement-banner"
          className="mx-6 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 transition-all"
          onTouchStart={(e) => {
            annSwipeRef.current.startX = e.touches[0]!.clientX;
            annSwipeRef.current.currentX = e.touches[0]!.clientX;
          }}
          onTouchMove={(e) => {
            annSwipeRef.current.currentX = e.touches[0]!.clientX;
            const dx = annSwipeRef.current.currentX - annSwipeRef.current.startX;
            if (annRef.current) {
              annRef.current.style.transform = `translateX(${dx}px)`;
              annRef.current.style.opacity = String(1 - Math.abs(dx) / 200);
            }
          }}
          onTouchEnd={() => {
            const dx = annSwipeRef.current.currentX - annSwipeRef.current.startX;
            if (Math.abs(dx) > 100) {
              dismissAnn();
            } else if (annRef.current) {
              annRef.current.style.transform = "";
              annRef.current.style.opacity = "";
            }
          }}
        >
          <div className="flex items-start gap-3">
            <Megaphone size={18} className="mt-0.5 shrink-0 text-primary-light" />
            <div className="flex-1">
              <p className="text-sm font-bold text-text">{announcement.title}</p>
              <p className="text-xs text-text-muted">{announcement.body}</p>
            </div>
            <button
              onClick={dismissAnn}
              aria-label={t("dashboard.announcement.dismissAria")}
              className="shrink-0 rounded p-1 text-text-muted hover:text-text"
            >
              <X size={14} />
            </button>
          </div>
          {announcement.url && (
            <Link
              to={announcement.url}
              className="mt-2 inline-block text-xs font-bold text-primary-light underline"
            >
              {t("dashboard.announcement.more")}
            </Link>
          )}
        </div>
      )}

      {/* Offline sync banners */}
      {pendingTrips.length > 0 && (
        <div className="mx-6 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3">
          <CloudOff size={18} className="shrink-0 text-primary-light" />
          <span className="flex-1 text-xs font-medium text-text">
            {t(
              pendingTrips.length > 1 ? "dashboard.sync.pendingMany" : "dashboard.sync.pendingOne",
              { count: pendingTrips.length },
            )}
          </span>
        </div>
      )}
      {showRejectedSync && (
        <div className="mx-6 flex items-center gap-3 rounded-xl border border-warning/20 bg-warning/10 px-4 py-3">
          <AlertTriangle size={18} className="shrink-0 text-warning" />
          <span className="flex-1 text-xs font-medium text-text">
            {t(
              rejectedTrips.length > 1
                ? "dashboard.sync.rejectedMany"
                : "dashboard.sync.rejectedOne",
              { count: rejectedTrips.length },
            )}
          </span>
          <button
            onClick={dismissRejectedSync}
            aria-label={t("dashboard.sync.dismissRejectedAria")}
            className="shrink-0 rounded p-2 text-text-muted hover:text-text"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {isNewUser ? (
        /* ---- Empty state: first-time user ---- */
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
          <img src={appLogo} alt="ecoRide" className="h-20 w-20 rounded-2xl" />
          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="text-2xl font-bold">
              {t("dashboard.welcome.titleLead")} <span className="text-text">eco</span>
              <span className="text-primary-light">Ride</span> !
            </h2>
            <p className="max-w-xs text-sm text-text-muted">{t("dashboard.welcome.body")}</p>
          </div>
          <Link
            to="/trip"
            className="mt-2 flex items-center gap-3 rounded-xl bg-primary px-8 py-4 text-sm font-bold text-bg transition-colors hover:bg-primary-light active:scale-95"
          >
            <Bike size={20} />
            {t("dashboard.cta.start")}
          </Link>
        </div>
      ) : (
        /* ---- Main dashboard ---- */
        <div className="flex flex-col gap-6 px-6 pb-6">
          {/* Quick Action CTA */}
          <Link
            to="/trip"
            className="group flex items-center justify-between rounded-2xl bg-primary p-6 shadow-[0_8px_32px_rgba(46,204,113,0.25)] transition-all hover:bg-primary-light active:scale-[0.98]"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-bg/20">
                <Bike size={28} className="text-bg" />
              </div>
              <div>
                <span className="block text-lg font-black text-bg">{t("dashboard.cta.start")}</span>
                <span className="block text-sm font-medium text-bg/70">
                  {t("dashboard.cta.subtitle")}
                </span>
              </div>
            </div>
            <ChevronRight
              size={24}
              className="text-bg/60 transition-transform group-hover:translate-x-1"
            />
          </Link>

          {/* Vehicle onboarding prompt */}
          {!vehiclePromptDismissed &&
            profileData?.user.consumptionL100 == null &&
            allTime.tripCount > 0 && (
              <div className="flex items-center gap-3 rounded-xl border border-warning/20 bg-warning/10 px-4 py-3">
                <Car size={18} className="shrink-0 text-warning" />
                <Link to="/profile" className="flex-1 text-xs font-medium text-text">
                  {t("dashboard.vehiclePrompt.body")}
                </Link>
                <button
                  onClick={() => setVehiclePromptDismissed(true)}
                  aria-label={t("dashboard.vehiclePrompt.dismissAria")}
                  className="shrink-0 rounded p-2 text-text-muted hover:text-text"
                >
                  <X size={14} />
                </button>
              </div>
            )}

          {/* Notification prompt */}
          {!notifPromptDismissed && push.status === "unsubscribed" && allTime.tripCount > 0 && (
            <div
              data-testid="notification-prompt"
              className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3"
            >
              <Bell size={18} className="shrink-0 text-primary-light" />
              <span className="flex-1 text-xs font-medium text-text">
                {t("dashboard.notifPrompt.body")}
              </span>
              <button
                onClick={() => push.toggle()}
                disabled={push.busy}
                className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-bg"
              >
                {t("dashboard.notifPrompt.enable")}
              </button>
              <button
                onClick={() => {
                  localStorage.setItem("ecoride:notification-prompt-dismissed", "true");
                  setNotifPromptDismissed(true);
                }}
                aria-label={t("dashboard.notifPrompt.dismissAria")}
                className="shrink-0 rounded p-1 text-text-muted hover:text-text"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Today's Summary */}
          <section className="rounded-xl bg-surface-container p-5">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-text-muted">
              {t("dashboard.today.title")}
            </h3>
            {today.tripCount > 0 ? (
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="flex items-center justify-center gap-1">
                    <MapPin size={14} className="text-primary-light" />
                    <span className="text-2xl font-black text-text">{today.tripCount}</span>
                  </div>
                  <span className="text-xs font-bold uppercase text-text-muted">
                    {t(
                      today.tripCount > 1
                        ? "dashboard.today.tripsMany"
                        : "dashboard.today.tripsOne",
                    )}
                  </span>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1">
                    <Bike size={14} className="text-primary-light" />
                    <span className="text-2xl font-black text-text">
                      {today.totalDistanceKm.toFixed(1)}
                    </span>
                  </div>
                  <span className="text-xs font-bold uppercase text-text-muted">
                    {t("dashboard.today.kmUnit")}
                  </span>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1">
                    <Leaf size={14} className="text-primary-light" />
                    <span className="text-2xl font-black text-text">
                      {today.totalCo2SavedKg.toFixed(1)}
                    </span>
                  </div>
                  <span className="text-xs font-bold uppercase text-text-muted">
                    {t("dashboard.today.co2Unit")}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-center text-sm text-text-muted">{t("dashboard.today.empty")}</p>
            )}
          </section>

          {/* Streak */}
          <div className="flex items-center gap-3 rounded-xl bg-surface-container px-5 py-4">
            <span className="text-xl">
              {allTime.currentStreak > 0 ? "\uD83D\uDD25" : "\uD83D\uDEF4"}
            </span>
            <span className="text-sm font-bold text-text">
              {allTime.currentStreak > 0
                ? t(
                    allTime.currentStreak > 1
                      ? "dashboard.streak.activeMany"
                      : "dashboard.streak.activeOne",
                    { count: allTime.currentStreak },
                  )
                : t("dashboard.streak.start")}
            </span>
          </div>

          {/* Progressive Milestones */}
          <section className="space-y-3" data-testid="milestones">
            <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">
              {t("dashboard.milestones.title")}
            </h3>
            {milestones.map((m) => (
              <div key={m.key} className="rounded-xl bg-surface-container p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {m.icon}
                    <span className="text-xs font-bold text-text-muted">{t(m.labelKey)}</span>
                  </div>
                  <span className="text-xs font-bold text-primary-light">
                    {m.current < m.target
                      ? `${m.unit === "€" ? m.current.toFixed(2) : m.unit === "km" || m.unit === "kg" ? m.current.toFixed(1) : Math.round(m.current)} / ${m.target} ${m.unit}`
                      : `${m.target} ${m.unit}`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-high">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${Math.max(m.progress * 100, 2)}%` }}
                  />
                </div>
              </div>
            ))}
          </section>
        </div>
      )}
    </>
  );
}
