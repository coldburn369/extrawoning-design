import Link from "next/link";
import type { ReactNode } from "react";

type AuthShellProps = {
  children: ReactNode;
  mode: "login" | "register";
};

export default function AuthShell({ children, mode }: AuthShellProps) {
  const isLogin = mode === "login";

  return (
    <main className="auth-page">
      <div className="auth-page__atmosphere" aria-hidden="true" />

      <header className="auth-header">
        <Link className="auth-brand" href="/landing/" aria-label="ExtraWoning — terug naar de website">
          <img
            src="/assets/extrawoning-reveal.svg"
            alt="ExtraWoning"
            width="490"
            height="83"
          />
        </Link>

        <div className="auth-switch">
          <span>{isLogin ? "Nog geen account?" : "Al een account?"}</span>
          <Link href={isLogin ? "/register/" : "/login/"}>
            {isLogin ? "Account aanmaken" : "Inloggen"}
          </Link>
        </div>
      </header>

      <div className="auth-layout">
        <aside className="auth-story" aria-label="ExtraWoning analyseert jouw woning">
          <div className="auth-story__copy">
            <p className="auth-eyebrow">
              <span />
              Jouw woningdossier
            </p>
            <h2>Alle kansen van je woning, helder op één plek.</h2>
            <p>
              Bewaar onderzoeken, vergelijk scenario&apos;s en werk vanuit één
              overzicht toe naar een onderbouwde volgende stap.
            </p>
          </div>

          <div className="auth-visual" aria-hidden="true">
            <span className="auth-visual__map" />
            <span className="auth-visual__grid" />
            <span className="auth-visual__glow" />
            <img
              className="auth-visual__house"
              src="/assets/townhouse.webp"
              alt=""
              width="1536"
              height="1024"
            />
            <span className="auth-visual__scan" />

            <span className="auth-orbit auth-orbit--one">
              <i>01</i>
              Regels
            </span>
            <span className="auth-orbit auth-orbit--two">
              <i>02</i>
              Gebouw
            </span>
            <span className="auth-orbit auth-orbit--three">
              <i>03</i>
              Potentieel
            </span>

            <div className="auth-insight">
              <span className="auth-insight__icon">
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3 19 6v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
                  <path d="m8.5 12 2.3 2.3L15.5 10" />
                </svg>
              </span>
              <span>
                <small>Persoonlijk dossier</small>
                <strong>Van eerste scan tot duidelijk besluit</strong>
              </span>
            </div>
          </div>

          <div className="auth-story__footer">
            <span>
              <i />
              Beveiligde omgeving
            </span>
            <span>Regels · Gebouw · Potentieel</span>
          </div>
        </aside>

        <section className="auth-card" aria-label={isLogin ? "Inloggen" : "Account aanmaken"}>
          {children}
        </section>
      </div>

      <footer className="auth-footer">
        <span>© ExtraWoning 2026</span>
        <nav aria-label="Juridische links">
          <Link href="/privacy/">Privacy</Link>
          <a href="mailto:info@extrawoning.nl">Hulp nodig?</a>
        </nav>
      </footer>
    </main>
  );
}
