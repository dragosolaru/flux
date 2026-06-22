import { NextResponse } from "next/server";

import { isNotificationsEnabled } from "@/lib/feature-flags";

export async function GET() {
  if (!isNotificationsEnabled()) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) {
    return NextResponse.json({ message: "Push not configured" }, { status: 503 });
  }
  return NextResponse.json({ publicKey: key });
}
