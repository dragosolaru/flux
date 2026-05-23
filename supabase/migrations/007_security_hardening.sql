-- Security hardening migration (2026-05-23):
-- 1. Track sender_email on inbound documents so /api/documents/recover can
--    restrict recovery to documents from the authenticated user's own email.
--    Prevents user-B from claiming user-A's unmatched documents.
-- 2. Deactivate any legacy non-Tesla vehicles so the trimmed brand registry
--    cannot hit getBrand() returning null at runtime.

-- 1. Sender-email tracking
alter table documents add column if not exists sender_email text;

create index if not exists documents_sender_email_idx
  on documents (sender_email)
  where sender_email is not null;

comment on column documents.sender_email is
  'Lowercased sender email when source = email; used by /api/documents/recover to filter claimable rows to the authenticated user';

-- 2. Deactivate legacy non-Tesla vehicles
-- (No-op if no such rows exist; safe to run multiple times.)
update vehicles
   set is_active = false
 where brand <> 'tesla'
   and is_active = true;
