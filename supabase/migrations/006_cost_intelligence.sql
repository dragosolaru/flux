-- =============================================================================
-- 006: Cost Intelligence — documents, energy_costs, exchange_rates
-- =============================================================================

-- ---------------------------------------------------------------------------
-- documents — raw uploaded files (images, PDFs) with AI-parsed data
-- ---------------------------------------------------------------------------
create table if not exists documents (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  vehicle_id        uuid references vehicles(id) on delete set null,
  source            text not null check (source in ('upload', 'email')),
  document_type     text check (document_type in ('home_bill', 'public_receipt', 'unknown')),
  storage_path      text not null,
  mime_type         text not null,
  original_filename text,
  parsed_json       jsonb,
  status            text not null default 'pending'
                    check (status in ('pending', 'processing', 'done', 'error', 'needs_review')),
  error_message     text,
  confidence        numeric(4,3),
  created_at        timestamptz not null default now(),
  processed_at      timestamptz
);

create index if not exists documents_vehicle_created_idx
  on documents(vehicle_id, created_at desc);
create index if not exists documents_user_status_idx
  on documents(user_id, status);

alter table documents enable row level security;

drop policy if exists "Users see own documents" on documents;
create policy "Users see own documents" on documents
  for all using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- energy_costs — structured cost records derived from documents
-- ---------------------------------------------------------------------------
create table if not exists energy_costs (
  id                      uuid primary key default gen_random_uuid(),
  document_id             uuid not null references documents(id) on delete cascade,
  vehicle_id              uuid not null references vehicles(id) on delete cascade,
  document_type           text not null check (document_type in ('home_bill', 'public_receipt')),

  period_start            date not null,
  period_end              date not null,

  total_kwh               numeric(10,3),
  vehicle_kwh_attributed  numeric(10,3),

  original_amount         numeric(10,2) not null,
  original_currency       text not null default 'RON',
  exchange_rate           numeric(10,6) not null default 1,
  cost_ron                numeric(10,2) not null,

  provider_name           text,
  charger_network         text,
  location_name           text,
  location_lat            numeric(9,6),
  location_lng            numeric(9,6),

  charging_session_id     uuid references charging_sessions(id) on delete set null,
  is_manually_edited      boolean not null default false,
  created_at              timestamptz not null default now()
);

create index if not exists energy_costs_vehicle_period_idx
  on energy_costs(vehicle_id, period_start desc);

alter table energy_costs enable row level security;

drop policy if exists "Users see own energy costs" on energy_costs;
create policy "Users see own energy costs" on energy_costs
  for all using (
    vehicle_id in (select id from vehicles where user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- exchange_rates — BNR rate cache (public data, no RLS needed)
-- ---------------------------------------------------------------------------
create table if not exists exchange_rates (
  rate_date     date not null,
  currency      text not null,
  rate_to_ron   numeric(12,6) not null,
  fetched_at    timestamptz not null default now(),
  primary key (rate_date, currency)
);

-- ---------------------------------------------------------------------------
-- charging_sessions — add cost_ron + cost_source columns
-- ---------------------------------------------------------------------------
alter table charging_sessions
  add column if not exists cost_ron    numeric(8,2),
  add column if not exists cost_source text
    check (cost_source in ('document', 'tariff_estimate', 'manual'));
