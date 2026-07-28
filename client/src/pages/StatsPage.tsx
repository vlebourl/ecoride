import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import type { Trip } from "@ecoride/shared/types";
import {
  useAchievements,
  useChartTrips,
  useAllTrips,
  useCreateTripPresetFromTrip,
  useDashboardSummary,
  useDeleteTrip,
  useProfile,
  useTrip,
} from "@/hooks/queries";
import { PageHeader } from "@/components/layout/PageHeader";
import { useT } from "@/i18n/provider";
import { tripLabel } from "@/lib/trip-utils";
import { StatsBadgesSection } from "@/components/stats/StatsBadgesSection";
import {
  buildChartData,
  getDayLabels,
  getMetricLabels,
  getMonthLabels,
  getPeriodLabels,
  type Metric,
  type Period,
} from "@/components/stats/chartData";
import { StatsMonthlySummarySection } from "@/components/stats/StatsMonthlySummarySection";
import { StatsRecentTripsSection } from "@/components/stats/StatsRecentTripsSection";
import { StatsTripDetailSheet } from "@/components/stats/StatsTripDetailSheet";
import { StatsTrendSection } from "@/components/stats/StatsTrendSection";

export function StatsPage() {
  const t = useT();
  const periodLabels = useMemo(() => getPeriodLabels(t), [t]);
  const metricLabels = useMemo(() => getMetricLabels(t), [t]);
  const dayLabels = useMemo(() => getDayLabels(t), [t]);
  const monthLabels = useMemo(() => getMonthLabels(t), [t]);
  const [period, setPeriod] = useState<Period>("week");
  const [metric, setMetric] = useState<Metric>("km");
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [tripPresetFormOpen, setTripPresetFormOpen] = useState(false);
  const [tripPresetLabel, setTripPresetLabel] = useState("");
  const [tripPresetFeedback, setTripPresetFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const { data: summary, isPending: summaryLoading } = useDashboardSummary("month");
  const { data: tripsData, isPending: tripsLoading } = useAllTrips();
  const { data: chartTripsData, isPending: chartLoading } = useChartTrips(period);
  const { data: achievements, isPending: achievementsLoading } = useAchievements();
  const { data: profileData } = useProfile();
  const { data: tripDetail } = useTrip(selectedTrip?.id ?? null);
  const deleteTrip = useDeleteTrip();
  const createTripPresetFromTrip = useCreateTripPresetFromTrip();

  const closeSelectedTrip = useCallback(() => {
    setTripPresetFormOpen(false);
    setTripPresetLabel("");
    setSelectedTrip(null);
  }, []);

  const openSelectedTrip = useCallback((trip: Trip) => {
    setTripPresetFeedback(null);
    setTripPresetFormOpen(false);
    setTripPresetLabel(tripLabel(trip.startedAt).replace(/^Trajet /, ""));
    setSelectedTrip(trip);
  }, []);

  useEffect(() => {
    if (!selectedTrip) {
      return;
    }

    window.history.pushState({ sheet: true }, "");
    window.addEventListener("popstate", closeSelectedTrip);
    return () => window.removeEventListener("popstate", closeSelectedTrip);
  }, [selectedTrip, closeSelectedTrip]);

  const isPending = summaryLoading || tripsLoading || chartLoading || achievementsLoading;
  const trips = tripsData?.trips ?? [];
  const chartTrips = useMemo(() => chartTripsData ?? [], [chartTripsData]);
  const displayTrip = tripDetail ?? selectedTrip;
  const gpsPoints = displayTrip?.gpsPoints;
  const hasGpsTrack = Array.isArray(gpsPoints) && gpsPoints.length > 1;
  const userTimezone = profileData?.user.timezone ?? undefined;

  const chartData = useMemo(
    () => buildChartData(chartTrips, period, dayLabels, monthLabels),
    [chartTrips, period, dayLabels, monthLabels],
  );

  const handleSaveTripPreset = () => {
    if (!selectedTrip || !tripPresetLabel.trim()) {
      return;
    }

    setTripPresetFeedback(null);
    createTripPresetFromTrip.mutate(
      {
        tripId: selectedTrip.id,
        label: tripPresetLabel.trim(),
      },
      {
        onSuccess: () => {
          setTripPresetFormOpen(false);
          closeSelectedTrip();
          setTripPresetFeedback({ type: "success", message: t("stats.detail.presetCreated") });
        },
        onError: () => {
          setTripPresetFeedback({ type: "error", message: t("stats.detail.presetError") });
        },
      },
    );
  };

  if (isPending || !summary) {
    return (
      <div
        className="flex flex-1 items-center justify-center"
        role="status"
        aria-label={t("stats.loadingAria")}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      {tripPresetFeedback && (
        <div
          className={`mx-6 mt-4 rounded-xl p-4 text-sm font-medium ${
            tripPresetFeedback.type === "success"
              ? "bg-primary/10 text-primary-light"
              : "bg-danger/10 text-danger"
          }`}
        >
          {tripPresetFeedback.message}
        </div>
      )}

      <PageHeader title={t("stats.header.title")} />

      <div className="space-y-12 px-6 pb-6">
        {summary.tripCount === 0 ? (
          <div className="flex flex-col items-center justify-center gap-6 py-20">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <BarChart3 size={40} className="text-primary-light" />
            </div>
            <div className="flex flex-col items-center gap-2 text-center">
              <h3 className="text-xl font-bold">{t("stats.empty.title")}</h3>
              <p className="max-w-xs text-sm text-text-muted">{t("stats.empty.body")}</p>
            </div>
          </div>
        ) : (
          <>
            <StatsMonthlySummarySection summary={summary} userTimezone={userTimezone} />
            <StatsTrendSection
              period={period}
              metric={metric}
              periodLabels={periodLabels}
              metricLabels={metricLabels}
              chartData={chartData}
              onPeriodChange={setPeriod}
              onMetricChange={setMetric}
            />
            <StatsRecentTripsSection
              trips={trips}
              userTimezone={userTimezone}
              onSelectTrip={openSelectedTrip}
            />
          </>
        )}

        <StatsBadgesSection achievements={achievements ?? []} challenges={summary.challenges} />
      </div>

      <StatsTripDetailSheet
        selectedTrip={selectedTrip}
        displayTrip={displayTrip}
        hasGpsTrack={hasGpsTrack}
        gpsPoints={gpsPoints}
        userTimezone={userTimezone}
        tripPresetFormOpen={tripPresetFormOpen}
        tripPresetLabel={tripPresetLabel}
        isCreatingPreset={createTripPresetFromTrip.isPending}
        isDeletingTrip={deleteTrip.isPending}
        onClose={closeSelectedTrip}
        onTogglePresetForm={() => {
          setTripPresetFeedback(null);
          setTripPresetFormOpen((open) => !open);
        }}
        onTripPresetLabelChange={setTripPresetLabel}
        onSaveTripPreset={handleSaveTripPreset}
        onCancelTripPreset={() => setTripPresetFormOpen(false)}
        onDeleteTrip={() => {
          if (!selectedTrip) {
            return;
          }
          deleteTrip.mutate(selectedTrip.id, { onSuccess: closeSelectedTrip });
        }}
      />
    </>
  );
}
