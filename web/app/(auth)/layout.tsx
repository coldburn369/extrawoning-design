import type { ReactNode } from "react";
import { connection } from "next/server";

import "./auth.css";

export default async function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  // The preview CSP uses a fresh per-request nonce. Opting out of static
  // rendering lets Next attach that nonce to the client form scripts.
  await connection();

  return children;
}
