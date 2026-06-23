-- 030: allow 'manual' in documents.source for manually entered car expenses
-- Users can add car costs (service, parking, insurance) without uploading a
-- file via the manual entry form on the Costs page.

alter table documents
  drop constraint if exists documents_source_check;

alter table documents
  add constraint documents_source_check
  check (source in ('upload', 'email', 'whatsapp', 'vault-upload', 'manual'));
