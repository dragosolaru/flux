import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = {
  title: "Sign in · Flux",
};

export default function LoginPage() {
  return (
    <div className="w-full max-w-xs">
      <Suspense fallback={null}>
        <LoginForm mode="login" />
      </Suspense>
    </div>
  );
}
