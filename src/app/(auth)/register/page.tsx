import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = {
  title: "Create your Flux account",
};

export default function RegisterPage() {
  return (
    <div className="w-full max-w-xs">
      <Suspense fallback={null}>
        <LoginForm mode="register" />
      </Suspense>
    </div>
  );
}
