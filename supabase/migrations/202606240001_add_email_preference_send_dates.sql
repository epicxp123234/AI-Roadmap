alter table public.email_preferences
  add column if not exists checkin_last_sent_on date,
  add column if not exists weekly_last_sent_on date;
