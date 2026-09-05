import { GarageClient } from "./garage-client";

export const metadata = { title: "Garage · Flux" };

export default function GaragePage() {
  // When Tesla live integration is off (the default demo configuration), the
  // "Connect Tesla" flow is a dead end (410), so the empty state should lead
  // with the demo vehicle instead.
  return <GarageClient teslaLive={false} />;
}
