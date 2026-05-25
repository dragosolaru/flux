-- 011: extend documents.source to include 'whatsapp' and add sender_phone column

alter table documents
  drop constraint if exists documents_source_check;

alter table documents
  add constraint documents_source_check
  check (source in ('upload', 'email', 'whatsapp'));

alter table documents
  add column if not exists sender_phone text;

create index if not exists documents_sender_phone_idx
  on documents(sender_phone)
  where sender_phone is not null;
