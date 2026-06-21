import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { getStations } from "@/lib/external/charging-networks/stations";
import { getAllAvailability } from "@/lib/external/charging-networks/availability";
import { getNetworkMeta } from "@/lib/external/charging-networks/meta";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const network = searchParams.get("network");
  const minKw = searchParams.get("minKw")
    ? Math.min(Math.max(Number(searchParams.get("minKw")), 0), 1000)
    : null;
  const plug = searchParams.get("plug");

  let stations = getStations();

  if (network && network !== "all") {
    stations = stations.filter((s) => s.networkId === network);
  }
  if (minKw != null && !isNaN(minKw)) {
    stations = stations.filter((s) => s.maxKw >= minKw);
  }
  if (plug) {
    stations = stations.filter((s) => s.plugTypes.includes(plug as never));
  }

  const availability = getAllAvailability();
  const availMap = Object.fromEntries(availability.map((a) => [a.stationId, a]));

  const result = stations.map((s) => ({
    ...s,
    networkMeta: getNetworkMeta(s.networkId),
    availability: availMap[s.id] ?? null,
  }));

  return NextResponse.json(result);
}
