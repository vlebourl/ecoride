import { Link } from "react-router";
import { ArrowLeft, Shield } from "lucide-react";

export function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-bg px-6 py-12">
      <div className="mx-auto max-w-lg">
        {/* Back link */}
        <Link
          to="/login"
          className="mb-8 inline-flex items-center gap-2 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft size={16} />
          Retour
        </Link>

        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15">
            <Shield size={24} className="text-primary-light" />
          </div>
          <h1 className="text-2xl font-bold text-text">Politique de confidentialit&eacute;</h1>
        </div>

        <p className="mb-6 text-sm text-text-muted">
          Derni&egrave;re mise &agrave; jour : mars 2026
        </p>

        {/* Sections */}
        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold text-text">Donn&eacute;es collect&eacute;es</h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-text-muted">
            <li>Email et nom (via Google OAuth ou inscription par email)</li>
            <li>Traces GPS pendant les trajets enregistr&eacute;s</li>
            <li>
              Pr&eacute;f&eacute;rences de v&eacute;hicule (type de v&eacute;lo, v&eacute;hicule de
              comparaison)
            </li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold text-text">H&eacute;bergement et partage</h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-text-muted">
            <li>
              Les donn&eacute;es sont stock&eacute;es sur un serveur auto-h&eacute;berg&eacute;
            </li>
            <li>Aucune donn&eacute;e n'est partag&eacute;e avec des tiers</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold text-text">
            Utilisation des donn&eacute;es GPS
          </h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-text-muted">
            <li>Suivi de vos trajets v&eacute;lo (distance, dur&eacute;e, trac&eacute;)</li>
            <li>G&eacute;olocalisation pour les prix de carburant</li>
            <li>Les donn&eacute;es GPS ne sont utilis&eacute;es &agrave; aucune autre fin</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold text-text">Vos droits</h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-text-muted">
            <li>
              Vous pouvez exporter vos donn&eacute;es &agrave; tout moment depuis votre profil
            </li>
            <li>
              Vous pouvez supprimer votre compte et toutes vos donn&eacute;es depuis votre profil
            </li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold text-text">Cookies</h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-text-muted">
            <li>Cookies de session uniquement (Better Auth)</li>
            <li>Aucun cookie d'analyse ou de publicit&eacute;</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-lg font-semibold text-text">Contact</h2>
          <p className="text-sm text-text-muted">
            Pour toute question, ouvrez une{" "}
            <a
              href="https://github.com/vlebourl/ecoride/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              issue sur GitHub
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
