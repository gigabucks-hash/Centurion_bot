import type { Metadata } from "next";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { getDataSource } from "@/lib/api";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  const local = process.env.CENTURION_LOCAL === "1" && getDataSource() !== "http";
  return <LoginScreen realWallet={getDataSource() === "http" || local} localPaper={local} />;
}
