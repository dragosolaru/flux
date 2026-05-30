-- WhatsApp phone registration: lets inbound WhatsApp media be safely attributed
-- to the owning user by matching the sender's number. Stored E.164, unique so a
-- number maps to exactly one account.
alter table profiles
  add column if not exists whatsapp_phone text unique;
