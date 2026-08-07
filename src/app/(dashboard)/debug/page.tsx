import { notFound } from "next/navigation";

import { isAdmin } from "@/lib/admin";
import { DebugClient } from "./debug-client";

export const metadata = {
  title: "Debug · Flux",
};

// 404 rather than a redirect: a non-admin should not be able to tell this route
// exists at all.
export default async function DebugPage() {
  if (!(await isAdmin())) notFound();
  return <DebugClient />;
}
