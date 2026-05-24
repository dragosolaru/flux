-- 010: add sender_email to documents table
-- Required by the inbound-email route which inserts sender_email on every email document.
-- Without this column, all email document inserts fail silently and documents never appear.

alter table documents
  add column if not exists sender_email text;

create index if not exists documents_sender_email_idx
  on documents(sender_email)
  where sender_email is not null;
