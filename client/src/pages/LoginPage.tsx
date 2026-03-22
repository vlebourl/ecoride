import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { signIn, signUp } from "@/lib/auth";
import appLogo from "/pwa-192x192.png?url";

export function LoginPage() {
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = () => {
    signIn.social({ provider: "google", callbackURL: window.location.origin + "/" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isRegister) {
        const { error: err } = await signUp.email({
          email,
          password,
          name,
        });
        if (err) {
          setError(err.message || "Erreur lors de la création du compte");
          setLoading(false);
          return;
        }
      } else {
        const { error: err } = await signIn.email({
          email,
          password,
        });
        if (err) {
          setError(err.message || "Email ou mot de passe incorrect");
          setLoading(false);
          return;
        }
      }
      navigate("/");
    } catch {
      setError("Une erreur est survenue. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6">
      {/* Logo */}
      <div className="mb-12 flex flex-col items-center gap-4">
        <img src={appLogo} alt="ecoRide" className="h-20 w-20 rounded-2xl" />
        <h1 className="text-4xl font-black tracking-tighter">
          <span className="text-text">eco</span><span className="text-primary-light">Ride</span>
        </h1>
        <p className="text-center text-sm text-text-muted">
          Suivez vos trajets vélo et vos économies CO₂
        </p>
      </div>

      <div className="w-full max-w-sm">
        {/* Google Sign In */}
        <button
          onClick={handleGoogleLogin}
          aria-label="Se connecter avec Google"
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-6 py-4 text-sm font-bold text-gray-800 shadow-lg active:scale-95"
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Se connecter avec Google
        </button>

        {/* Separator */}
        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-surface-high" />
          <span className="text-sm text-text-muted">ou</span>
          <div className="h-px flex-1 bg-surface-high" />
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {isRegister && (
            <label>
              <span className="sr-only">Nom</span>
              <input
                type="text"
                placeholder="Nom"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                className="rounded-xl border border-surface-high bg-surface px-4 py-3 text-white placeholder-text-muted outline-none focus:border-primary w-full"
              />
            </label>
          )}
          <label>
            <span className="sr-only">Email</span>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="rounded-xl border border-surface-high bg-surface px-4 py-3 text-white placeholder-text-muted outline-none focus:border-primary w-full"
            />
          </label>
          <label>
            <span className="sr-only">Mot de passe</span>
            <input
              type="password"
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={isRegister ? "new-password" : "current-password"}
              className="rounded-xl border border-surface-high bg-surface px-4 py-3 text-white placeholder-text-muted outline-none focus:border-primary w-full"
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-xl bg-primary py-3 font-bold text-black active:scale-95 disabled:opacity-50"
          >
            {loading
              ? "Chargement..."
              : isRegister
                ? "Créer un compte"
                : "Se connecter"}
          </button>
        </form>

        {/* Toggle login/register */}
        <p className="mt-4 text-center text-sm text-text-muted">
          {isRegister ? "Déjà un compte ?" : "Pas encore de compte ?"}{" "}
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError("");
            }}
            className="text-primary underline"
          >
            {isRegister ? "Se connecter" : "Créer un compte"}
          </button>
        </p>

        {/* Privacy policy */}
        <p className="mt-6 text-center text-xs text-text-muted">
          <Link to="/privacy" className="underline hover:text-text">
            Politique de confidentialit&eacute;
          </Link>
        </p>
      </div>
    </div>
  );
}
