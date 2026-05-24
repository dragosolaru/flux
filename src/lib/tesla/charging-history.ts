import { getValidAccessToken } from "./tokens";
import { TESLA_REGIONS } from "./constants";

interface TeslaChargingSession {
  din: string;
  chargeStartDateTime: string;
  chargeStopDateTime: string;
  siteLocationName: string;
  chargeEnergyAddedKwh: number;
  fees: { totalDue: number; currencyCode: string } | null;
  vehicleId: number;
}

interface TeslaChargingHistoryResponse {
  data: TeslaChargingSession[];
}

function baseUrl(region: string): string {
  return TESLA_REGIONS[region as keyof typeof TESLA_REGIONS] ?? TESLA_REGIONS.eu;
}

export async function fetchTeslaChargingHistory(params: {
  vehicleId: string;       // our internal UUID
  teslaVehicleId: number;
  pageNo?: number;
  pageSize?: number;
}): Promise<TeslaChargingSession[]> {
  const { accessToken, region } = await getValidAccessToken(params.vehicleId);
  const pageNo = params.pageNo ?? 0;
  const pageSize = params.pageSize ?? 50;

  const url = `${baseUrl(region)}/api/1/dx/charging/history?vehicleId=${params.teslaVehicleId}&pageNo=${pageNo}&pageSize=${pageSize}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Tesla charging history ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as TeslaChargingHistoryResponse;
  return json.data ?? [];
}
