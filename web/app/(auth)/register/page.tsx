import type { Metadata } from "next";

import AuthForm from "../auth-form";
import AuthShell from "../auth-shell";

export const metadata: Metadata = {
  title: "Account aanmaken — ExtraWoning",
  description: "Maak een ExtraWoning-account en bewaar je woningonderzoeken.",
};

export default function RegisterPage() {
  return (
    <AuthShell mode="register">
      <AuthForm mode="register" />
    </AuthShell>
  );
}
