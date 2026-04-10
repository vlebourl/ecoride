export const fr = {
  "login.tagline": "Suivez vos trajets vélo et vos économies CO₂",
  "login.google": "Se connecter avec Google",
  "login.or": "ou",
  "login.name": "Nom",
  "login.email": "Email",
  "login.password": "Mot de passe",
  "login.loading": "Chargement...",
  "login.submit.signin": "Se connecter",
  "login.submit.signup": "Créer un compte",
  "login.toggle.haveAccount": "Déjà un compte ?",
  "login.toggle.noAccount": "Pas encore de compte ?",
  "login.errors.signup": "Erreur lors de la création du compte",
  "login.errors.signin": "Email ou mot de passe incorrect",
  "login.errors.generic": "Une erreur est survenue. Réessayez.",
  "login.privacy": "Politique de confidentialité",

  "notFound.title": "Page introuvable",
  "notFound.body": "La page que vous recherchez n'existe pas ou a été déplacée.",
  "notFound.back": "Retour à",

  "settings.language.row": "Langue",
  "settings.language.label": "Choisir la langue",
  "settings.language.fr": "Français",
  "settings.language.en": "English",
} as const;

export type TranslationKey = keyof typeof fr;
