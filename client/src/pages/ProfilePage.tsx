import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { FuelType } from "@ecoride/shared/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProfileActionsSection } from "@/components/profile/ProfileActionsSection";
import { ProfileBadgesSection } from "@/components/profile/ProfileBadgesSection";
import { ProfileFeedbackCard } from "@/components/profile/ProfileFeedbackCard";
import { ProfileSettingsCard } from "@/components/profile/ProfileSettingsCard";
import { ProfileSummarySection } from "@/components/profile/ProfileSummarySection";
import { ProfileTripPresetsSection } from "@/components/profile/ProfileTripPresetsSection";
import { ProfileVehicleEditorCard } from "@/components/profile/ProfileVehicleEditorCard";
import {
  useAchievements,
  useDeleteAccount,
  useDeleteTripPreset,
  useExportData,
  useFuelPrice,
  useImportData,
  useProfile,
  useSubmitFeedback,
  useTripPresets,
  useUpdateProfile,
} from "@/hooks/queries";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useT } from "@/i18n/provider";
import { signOut } from "@/lib/auth";
import { formatFullDate } from "@/lib/format-utils";
import { isBleSupported, scanAndConnect } from "@/lib/super73-ble";

export function ProfilePage() {
  const t = useT();
  const navigate = useNavigate();
  const { data: profileData, isPending: profileLoading } = useProfile();
  const { data: achievements = [], isPending: achievementsLoading } = useAchievements();
  const { data: tripPresetsData } = useTripPresets();
  const updateProfile = useUpdateProfile();
  const push = usePushNotifications();
  const deleteAccount = useDeleteAccount();
  const deleteTripPreset = useDeleteTripPreset();
  const exportData = useExportData();
  const importData = useImportData();
  const submitFeedback = useSubmitFeedback();
  const importFileRef = useRef<HTMLInputElement>(null);

  const userFuelType = profileData?.user?.fuelType ?? "sp95";
  const { data: fuelPrice, isPending: fuelPriceLoading } = useFuelPrice(userFuelType);

  const [showVehicle, setShowVehicle] = useState(false);
  const [showPersonalInfo, setShowPersonalInfo] = useState(false);
  const [vehicleModel, setVehicleModel] = useState("");
  const [fuelType, setFuelType] = useState<FuelType>("sp95");
  const [consumption, setConsumption] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackType, setFeedbackType] = useState<"bug" | "feature">("bug");
  const [feedbackTitle, setFeedbackTitle] = useState("");
  const [feedbackDesc, setFeedbackDesc] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);

  const user = profileData?.user;
  const stats = profileData?.stats;
  const tripPresets = tripPresetsData ?? [];

  const handleVehicleToggle = () => {
    if (showVehicle) {
      setShowVehicle(false);
      return;
    }
    if (!user) return;

    setVehicleModel(user.vehicleModel ?? "");
    setFuelType(user.fuelType ?? "sp95");
    setConsumption(String(user.consumptionL100 ?? ""));
    setShowVehicle(true);
  };

  if (profileLoading || achievementsLoading || !user || !stats) {
    return (
      <div
        className="flex flex-1 items-center justify-center"
        role="status"
        aria-label={t("profile.loadingAria")}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const handleSaveVehicle = () => {
    updateProfile.mutate(
      {
        vehicleModel: vehicleModel || undefined,
        fuelType,
        consumptionL100: consumption ? Number(consumption) : undefined,
      },
      {
        onSuccess: () => {
          setSaveSuccess(true);
          setTimeout(() => {
            setSaveSuccess(false);
            setShowVehicle(false);
          }, 500);
        },
      },
    );
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const handleDeleteAccount = () => {
    const confirmed = window.confirm(t("profile.delete.confirm"));
    if (!confirmed) return;
    deleteAccount.mutate(undefined, {
      onSuccess: () => navigate("/login"),
    });
  };

  const handleExportData = () => {
    exportData.mutate();
  };

  const handleImportClick = () => {
    importFileRef.current?.click();
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const confirmed = window.confirm(t("profile.import.confirm"));
    if (!confirmed) return;

    importData.mutate(file, {
      onSuccess: (data) => {
        window.alert(
          t("profile.import.success", { imported: data.imported, skipped: data.skipped }),
        );
      },
      onError: (error) => {
        window.alert(
          t("profile.import.error", {
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      },
    });
  };

  const handleDeleteTripPreset = (tripPresetId: string, label: string) => {
    const confirmed = window.confirm(t("profile.presets.confirmDelete", { label }));
    if (!confirmed) return;
    deleteTripPreset.mutate(tripPresetId);
  };

  const handleFeedbackToggle = () => {
    setShowFeedback((current) => !current);
    setFeedbackSent(false);
  };

  const handleFeedbackSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitFeedback.mutate(
      {
        type: feedbackType,
        title: feedbackTitle,
        description: feedbackDesc,
      },
      {
        onSuccess: () => {
          setFeedbackSent(true);
          setFeedbackTitle("");
          setFeedbackDesc("");
        },
      },
    );
  };

  const handleSuper73RowClick = () => {
    if (user.super73Enabled) navigate("/vehicle");
  };

  const handleSuper73ToggleClick = async () => {
    if (user.super73Enabled) {
      updateProfile.mutate({ super73Enabled: false });
      return;
    }
    if (!isBleSupported()) return;

    try {
      await scanAndConnect();
      updateProfile.mutate({ super73Enabled: true });
      navigate("/vehicle");
    } catch {
      // User cancelled pairing — leave access disabled.
    }
  };

  return (
    <>
      <PageHeader title={t("profile.header.title")} />

      <div className="space-y-8 px-6 pb-6">
        <ProfileSummarySection
          user={user}
          stats={stats}
          fuelPrice={fuelPrice}
          fuelPriceLoading={fuelPriceLoading}
        />

        <ProfileBadgesSection achievements={achievements} />

        <ProfileTripPresetsSection
          tripPresets={tripPresets}
          deletePending={deleteTripPreset.isPending}
          onDelete={handleDeleteTripPreset}
        />

        <ProfileVehicleEditorCard
          open={showVehicle}
          vehicleModel={vehicleModel}
          fuelType={fuelType}
          consumption={consumption}
          saveSuccess={saveSuccess}
          saving={updateProfile.isPending}
          onVehicleModelChange={setVehicleModel}
          onFuelTypeChange={setFuelType}
          onConsumptionChange={setConsumption}
          onSave={handleSaveVehicle}
        />

        <ProfileSettingsCard
          user={user}
          showPersonalInfo={showPersonalInfo}
          push={push}
          bleSupported={isBleSupported()}
          profileUpdatePending={updateProfile.isPending}
          onTogglePersonalInfo={() => setShowPersonalInfo((current) => !current)}
          onVehicleClick={handleVehicleToggle}
          onSuper73RowClick={handleSuper73RowClick}
          onSuper73ToggleClick={handleSuper73ToggleClick}
          formatMemberSince={formatFullDate}
        />

        <ProfileFeedbackCard
          open={showFeedback}
          feedbackType={feedbackType}
          feedbackTitle={feedbackTitle}
          feedbackDescription={feedbackDesc}
          feedbackSent={feedbackSent}
          pending={submitFeedback.isPending}
          isError={submitFeedback.isError}
          onToggle={handleFeedbackToggle}
          onFeedbackTypeChange={setFeedbackType}
          onFeedbackTitleChange={setFeedbackTitle}
          onFeedbackDescriptionChange={setFeedbackDesc}
          onSubmit={handleFeedbackSubmit}
        />

        <input
          ref={importFileRef}
          type="file"
          accept="application/json,.json"
          onChange={handleImportFile}
          className="hidden"
        />

        <ProfileActionsSection
          isAdmin={user.isAdmin}
          onLogout={handleLogout}
          onExport={handleExportData}
          onImportClick={handleImportClick}
          onDeleteAccount={handleDeleteAccount}
          exportPending={exportData.isPending}
          importPending={importData.isPending}
          deletePending={deleteAccount.isPending}
        />
      </div>
    </>
  );
}
