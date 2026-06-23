import { apiFetch } from "@/lib/api-fetch";
import type { Document, VaultDocument } from "@/types/costs";

const BASE = "/api/documents";

export function list(vehicleId: string): Promise<Document[]> {
  return apiFetch<Document[]>(`${BASE}?vehicleId=${vehicleId}`);
}

export async function upload(
  vehicleId: string,
  file: File,
): Promise<{ id: string; status: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("vehicleId", vehicleId);
  // Multipart upload — bypasses apiFetch's JSON Content-Type on purpose.
  const res = await fetch(BASE, { method: "POST", body: form });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message ?? "Upload failed");
  }
  return res.json() as Promise<{ id: string; status: string }>;
}

export function recover(): Promise<{ recovered: number }> {
  return apiFetch<{ recovered: number }>(`${BASE}/recover`, { method: "POST" });
}

export function update(
  documentId: string,
  updates: Record<string, unknown>,
): Promise<unknown> {
  return apiFetch(`${BASE}/${documentId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export function remove(documentId: string): Promise<unknown> {
  return apiFetch(`${BASE}/${documentId}`, { method: "DELETE" });
}

export function listVault(vehicleId: string): Promise<VaultDocument[]> {
  return apiFetch<VaultDocument[]>(`/api/vehicles/${vehicleId}/vault`);
}

export function updateVaultDoc(
  vehicleId: string,
  documentId: string,
  data: {
    amount_ron?: number | null;
    valid_until?: string | null;
    valid_from?: string | null;
    issuer?: string | null;
    plate_number?: string | null;
  },
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/vehicles/${vehicleId}/vault/${documentId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function createManualVaultDoc(
  vehicleId: string,
  data: {
    document_type: string;
    amount_ron?: number | null;
    valid_from?: string | null;
    valid_until?: string | null;
    issuer?: string | null;
    plate_number?: string | null;
  },
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/api/vehicles/${vehicleId}/vault`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}
