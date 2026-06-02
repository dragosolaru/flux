# Vehicle Deactivate & Delete — Design Spec
_Date: 2026-06-02_

## Summary

Add the ability to deactivate (soft-delete) or permanently delete a vehicle from the garage. Deactivation is reversible; deletion is permanent. Both actions are available in two places: the garage card menu and the Settings → Vehicles section.

## Approach

Soft-delete-first. The primary action is **Deactivate** (reversible, data preserved). Permanent deletion is a secondary, harder-to-reach action with strong confirmation. The schema already has `is_active boolean default true` and all read queries already filter `.eq("is_active", true)`, so a deactivated vehicle disappears from every page automatically.

---

## Architecture

### Data layer

- `vehicles.is_active = false` → soft-delete. Vehicle invisible to all existing queries.
- Hard `DELETE` → cascades to `mock_vehicle_state`, `charging_sessions`, `trips`, `command_events`, `tesla_tokens`, `vehicle_snapshots`, `battery_health_history`, `energy_costs`. Documents orphan (`vehicle_id = null`).
- Free tier slot: `canAddVehicle` already counts only `is_active = true` — deactivation frees the slot immediately.

### API changes

| Endpoint | Change |
|----------|--------|
| `PATCH /api/vehicles/[id]` | Accept `is_active: z.boolean().optional()`. On `is_active: true` (reactivate), check `canAddVehicle` → 403 if free tier slot full. |
| `GET /api/vehicles` | Add `?include_inactive=true` query param — returns all vehicles regardless of `is_active`. Used only by Settings server component. |
| `DELETE /api/vehicles/[id]` | No change — hard delete. |

---

## UI

### Garage card (`/garage`)

- `⋮` button (MoreVertical icon) top-right of each vehicle card.
- Opens Radix `DropdownMenu` with one item: **Deactivate**.
- `AlertDialog` confirmation: title + description assuring data is safe + Cancel / Deactivate CTA.
- On confirm: PATCH `{ is_active: false }` → invalidate `["vehicles"]` → card fades out.

**Component:** `src/components/garage/VehicleCardMenu.tsx`

### Settings → Vehicles section

**Active vehicles:** Each row gets a small `Deactivate` button (outline) beside the ScenarioPicker.

**Inactive vehicles:** Collapsible section "Inactive vehicles" (hidden if empty) below active vehicles. Each row shows vehicle name + two actions:
- `Reactivate` (outline) — disabled with tooltip if free tier slot is full.
- `Delete permanently` (destructive) → `AlertDialog` with a required checkbox "I understand this is irreversible" + Delete CTA.

**Component:** `src/components/settings/InactiveVehiclesList.tsx`

---

## i18n keys (all 5 locales: en / ro / de / fr / hu)

```
garage.menu_deactivate
garage.deactivate_confirm_title
garage.deactivate_confirm_desc
garage.deactivate_confirm_cta
settings.inactive_vehicles_title
settings.reactivate
settings.reactivate_blocked
settings.delete_permanently
settings.delete_confirm_title
settings.delete_confirm_checkbox
settings.delete_confirm_cta
```

---

## Error handling

- Reactivation on full free-tier slot → 403 → toast with upgrade prompt.
- DELETE on non-owned vehicle → 403 (existing ownership check).
- Network error on any action → toast error, no optimistic update rollback needed (query refetch restores state).

---

## Out of scope

- Bulk deactivation / bulk delete
- Scheduled auto-deactivation
- Export data before delete (covered by existing GDPR export in `/api/user/export`)
