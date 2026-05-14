
-- Send log table
create table if not exists public.invoice_send_log (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.billing_invoices(id) on delete cascade,
  recipient text not null,
  cc text,
  subject text not null,
  body text,
  pdf_path text,
  provider text not null default 'mock',
  status text not null default 'pending' check (status in ('pending','sent','opened','failed')),
  error text,
  idempotency_key text unique,
  sent_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_invoice_send_log_invoice on public.invoice_send_log(invoice_id, created_at desc);

alter table public.invoice_send_log enable row level security;

create policy "auth read send log"
  on public.invoice_send_log for select
  to authenticated using (true);

create policy "auth insert send log"
  on public.invoice_send_log for insert
  to authenticated with check (auth.uid() is not null);

create policy "auth update own send log"
  on public.invoice_send_log for update
  to authenticated using (sent_by = auth.uid() or public.has_role(auth.uid(),'admin'));

-- Private bucket for invoice PDFs
insert into storage.buckets (id, name, public)
values ('invoice-pdfs','invoice-pdfs', false)
on conflict (id) do nothing;

create policy "auth read invoice pdfs"
  on storage.objects for select
  to authenticated using (bucket_id = 'invoice-pdfs');

create policy "auth upload invoice pdfs"
  on storage.objects for insert
  to authenticated with check (bucket_id = 'invoice-pdfs');

create policy "auth update invoice pdfs"
  on storage.objects for update
  to authenticated using (bucket_id = 'invoice-pdfs');
