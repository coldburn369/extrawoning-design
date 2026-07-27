import type { Metadata } from "next";

import AuthForm from "../auth-form";
import AuthShell from "../auth-shell";

export const metadata: Metadata = {
  title: "Inloggen — ExtraWoning",
  description: "Log in op je persoonlijke ExtraWoning-dossier.",
};

export default function LoginPage() {
  return (
    <AuthShell mode="login">
      <AuthForm mode="login" />
    </AuthShell>
  );
}
