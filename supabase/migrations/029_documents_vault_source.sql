-- 029: allow 'vault-upload' in documents.source
-- The vehicle-document vault inserts source='vault-upload' (car docs uploaded
-- via the Documents page), but the check constraint only permitted
-- upload/email/whatsapp, so every vault upload failed with
-- documents_source_check. Extend the allowed set.

alter table documents
  drop constraint if exists documents_source_check;

alter table documents
  add constraint documents_source_check
  check (source in ('upload', 'email', 'whatsapp', 'vault-upload'));
