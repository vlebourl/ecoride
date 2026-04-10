import { Languages } from "lucide-react";
import { useI18n, type Locale } from "@/i18n/provider";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="flex w-full items-center justify-between p-4">
      <div className="flex items-center gap-4">
        <Languages size={20} className="text-text-muted" />
        <span className="text-sm font-medium">{t("settings.language.row")}</span>
      </div>
      <label className="sr-only" htmlFor="language-select">
        {t("settings.language.label")}
      </label>
      <select
        id="language-select"
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="rounded-lg bg-surface-high px-3 py-2 text-sm text-text outline-none focus:ring-2 focus:ring-primary/30"
      >
        <option value="fr">{t("settings.language.fr")}</option>
        <option value="en">{t("settings.language.en")}</option>
      </select>
    </div>
  );
}
