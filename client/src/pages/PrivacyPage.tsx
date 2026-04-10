import { Link } from "react-router";
import { ArrowLeft, Shield } from "lucide-react";
import { useT } from "@/i18n/provider";

export function PrivacyPage() {
  const t = useT();
  return (
    <div className="min-h-dvh bg-bg px-6 py-12">
      <div className="mx-auto max-w-lg">
        {/* Back link */}
        <Link
          to="/login"
          className="mb-8 inline-flex items-center gap-2 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft size={16} />
          {t("privacy.back")}
        </Link>

        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15">
            <Shield size={24} className="text-primary-light" />
          </div>
          <h1 className="text-2xl font-bold text-text">{t("privacy.header.title")}</h1>
        </div>

        <p className="mb-6 text-sm text-text-muted">{t("privacy.updated")}</p>

        {/* Sections */}
        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold text-text">
            {t("privacy.sections.collected.title")}
          </h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-text-muted">
            <li>{t("privacy.sections.collected.item1")}</li>
            <li>{t("privacy.sections.collected.item2")}</li>
            <li>{t("privacy.sections.collected.item3")}</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold text-text">
            {t("privacy.sections.hosting.title")}
          </h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-text-muted">
            <li>{t("privacy.sections.hosting.item1")}</li>
            <li>{t("privacy.sections.hosting.item2")}</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold text-text">
            {t("privacy.sections.gps.title")}
          </h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-text-muted">
            <li>{t("privacy.sections.gps.item1")}</li>
            <li>{t("privacy.sections.gps.item2")}</li>
            <li>{t("privacy.sections.gps.item3")}</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold text-text">
            {t("privacy.sections.rights.title")}
          </h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-text-muted">
            <li>{t("privacy.sections.rights.item1")}</li>
            <li>{t("privacy.sections.rights.item2")}</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold text-text">
            {t("privacy.sections.cookies.title")}
          </h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-text-muted">
            <li>{t("privacy.sections.cookies.item1")}</li>
            <li>{t("privacy.sections.cookies.item2")}</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-lg font-semibold text-text">
            {t("privacy.sections.contact.title")}
          </h2>
          <p className="text-sm text-text-muted">
            {t("privacy.sections.contact.bodyBefore")}
            <a
              href="https://github.com/vlebourl/ecoride/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              {t("privacy.sections.contact.linkLabel")}
            </a>
            {t("privacy.sections.contact.bodyAfter")}
          </p>
        </section>
      </div>
    </div>
  );
}
