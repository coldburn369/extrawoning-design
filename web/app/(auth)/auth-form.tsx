"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";

type AuthFormProps = {
  mode: "login" | "register";
};

type PasswordFieldProps = {
  autoComplete: string;
  id: string;
  label: string;
  onChange?: (value: string) => void;
};

function FieldIcon({ children }: { children: ReactNode }) {
  return (
    <span className="auth-field__icon" aria-hidden="true">
      {children}
    </span>
  );
}

function PasswordField({ autoComplete, id, label, onChange }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-field__control">
        <FieldIcon>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <rect x="5" y="10" width="14" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </FieldIcon>
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder="Minimaal 8 tekens"
          minLength={8}
          required
          onChange={(event) => onChange?.(event.target.value)}
        />
        <button
          className="auth-field__reveal"
          type="button"
          aria-label={visible ? `${label} verbergen` : `${label} tonen`}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
            <circle cx="12" cy="12" r="2.5" />
            {visible ? <path d="m4 4 16 16" /> : null}
          </svg>
        </button>
      </div>
    </div>
  );
}

function EmailField() {
  return (
    <div className="auth-field">
      <label htmlFor="email">E-mailadres</label>
      <div className="auth-field__control">
        <FieldIcon>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m4 7 8 6 8-6" />
          </svg>
        </FieldIcon>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="naam@voorbeeld.nl"
          required
        />
      </div>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13" />
      <path d="m12 6 6 6-6 6" />
    </svg>
  );
}

export default function AuthForm({ mode }: AuthFormProps) {
  const isLogin = mode === "login";
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [formMessage, setFormMessage] = useState("");

  const strength = useMemo(() => {
    if (!password) return 0;
    return [
      password.length >= 8,
      /[a-z]/.test(password) && /[A-Z]/.test(password),
      /\d/.test(password),
      /[^A-Za-z0-9]/.test(password),
    ].filter(Boolean).length;
  }, [password]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isLogin && password !== passwordConfirm) {
      setFormMessage("De wachtwoorden komen nog niet overeen.");
      return;
    }

    setFormMessage(
      "De interface staat klaar. De accountkoppeling wordt samen met het dashboard geactiveerd.",
    );
  };

  return (
    <>
      <div className="auth-card__heading">
        <p className="auth-eyebrow">{isLogin ? "Inloggen" : "Nieuw account"}</p>
        <h1>{isLogin ? "Welkom terug" : "Maak je woningdossier aan"}</h1>
        <p>
          {isLogin
            ? "Log in om verder te gaan met je onderzoeken en opgeslagen woonkansen."
            : "Bewaar resultaten, vergelijk mogelijkheden en houd alle vervolgstappen overzichtelijk bij."}
        </p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        {!isLogin ? (
          <div className="auth-fields-row">
            <div className="auth-field">
              <label htmlFor="firstName">Voornaam</label>
              <div className="auth-field__control">
                <FieldIcon>
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21a8 8 0 0 1 16 0" />
                  </svg>
                </FieldIcon>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  autoComplete="given-name"
                  placeholder="Voornaam"
                  required
                />
              </div>
            </div>
            <div className="auth-field">
              <label htmlFor="lastName">Achternaam</label>
              <div className="auth-field__control">
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  autoComplete="family-name"
                  placeholder="Achternaam"
                  required
                />
              </div>
            </div>
          </div>
        ) : null}

        <EmailField />

        <PasswordField
          id="password"
          label="Wachtwoord"
          autoComplete={isLogin ? "current-password" : "new-password"}
          onChange={
            isLogin
              ? undefined
              : (value) => {
                  setPassword(value);
                  if (formMessage) setFormMessage("");
                }
          }
        />

        {!isLogin ? (
          <>
            <div className="auth-strength" data-score={strength}>
              <div aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </div>
              <span>
                {strength === 0
                  ? "Gebruik minimaal 8 tekens"
                  : strength < 3
                    ? "Kan nog sterker"
                    : strength === 3
                      ? "Sterk wachtwoord"
                      : "Zeer sterk wachtwoord"}
              </span>
            </div>
            <PasswordField
              id="passwordConfirm"
              label="Herhaal wachtwoord"
              autoComplete="new-password"
              onChange={(value) => {
                setPasswordConfirm(value);
                if (formMessage) setFormMessage("");
              }}
            />
          </>
        ) : null}

        <div className="auth-form__options">
          <label className="auth-checkbox">
            <input type="checkbox" name={isLogin ? "remember" : "terms"} required={!isLogin} />
            <span aria-hidden="true">
              <svg width="13" height="13" viewBox="0 0 24 24">
                <path d="m5 12 4 4L19 6" />
              </svg>
            </span>
            <em>
              {isLogin ? (
                "Ingelogd blijven"
              ) : (
                <>
                  Ik ga akkoord met de <Link href="/privacy/">privacyvoorwaarden</Link>
                </>
              )}
            </em>
          </label>
          {isLogin ? (
            <a href="mailto:info@extrawoning.nl?subject=Wachtwoord%20herstellen">
              Wachtwoord vergeten?
            </a>
          ) : null}
        </div>

        <button className="auth-submit" type="submit">
          <span>{isLogin ? "Inloggen" : "Account aanmaken"}</span>
          <ArrowIcon />
        </button>

        <p
          className="auth-form__status"
          data-error={formMessage.startsWith("De wachtwoorden") || undefined}
          aria-live="polite"
        >
          {formMessage || "\u00A0"}
        </p>
      </form>

      <div className="auth-card__alternate">
        <span>{isLogin ? "Nog geen account?" : "Al geregistreerd?"}</span>
        <Link href={isLogin ? "/register/" : "/login/"}>
          {isLogin ? "Maak gratis een account" : "Log in op je account"}
          <ArrowIcon />
        </Link>
      </div>
    </>
  );
}
