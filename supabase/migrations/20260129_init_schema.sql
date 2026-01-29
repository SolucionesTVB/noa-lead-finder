-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Tabla leads
create table if not exists public.leads (
  id uuid primary key default uuid_generate_v4(),
  full_name text not null,
  type text check (type in ('agente', 'corredor')),
  phone text,
  whatsapp text,
  email text,
  facebook_url text,
  linkedin_url text,
  province text,
  canton text,
  district text,
  company text,
  insurance_company text,
  quality_score int check (quality_score between 1 and 10),
  conversion_probability numeric check (conversion_probability >= 0 and conversion_probability <= 1),
  status text default 'new' check (status in ('new','contacted','interested','converted')),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabla campaigns
create table if not exists public.campaigns (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  channel text not null check (channel in ('whatsapp','email')),
  message_template text not null,
  status text default 'draft' check (status in ('draft','scheduled','running','completed')),
  sent_count int default 0,
  delivered_count int default 0,
  response_count int default 0,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabla messages
create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','email')),
  content text not null,
  status text default 'pending' check (status in ('pending','sent','delivered','read')),
  has_response boolean default false,
  response_text text,
  wasender_message_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabla scraping_jobs
create table if not exists public.scraping_jobs (
  id uuid primary key default uuid_generate_v4(),
  source text not null check (source in ('facebook','linkedin','sugese')),
  search_query text,
  filters jsonb,
  status text default 'pending' check (status in ('pending','running','completed','failed')),
  leads_found int default 0,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Función para actualizar updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Triggers para updated_at
create trigger set_timestamp_on_leads
before update on public.leads
for each row execute procedure public.set_updated_at();

create trigger set_timestamp_on_campaigns
before update on public.campaigns
for each row execute procedure public.set_updated_at();

create trigger set_timestamp_on_messages
before update on public.messages
for each row execute procedure public.set_updated_at();

create trigger set_timestamp_on_scraping_jobs
before update on public.scraping_jobs
for each row execute procedure public.set_updated_at();

-- Índices para mejorar performance
create index if not exists idx_leads_user_id on public.leads(user_id);
create index if not exists idx_leads_status on public.leads(status);
create index if not exists idx_campaigns_user_id on public.campaigns(user_id);
create index if not exists idx_messages_campaign_id on public.messages(campaign_id);
create index if not exists idx_messages_lead_id on public.messages(lead_id);
create index if not exists idx_scraping_jobs_user_id on public.scraping_jobs(user_id);

-- RLS (Row Level Security) policies
alter table public.leads enable row level security;
alter table public.campaigns enable row level security;
alter table public.messages enable row level security;
alter table public.scraping_jobs enable row level security;

-- Policies para leads
create policy "Users can view own leads"
  on public.leads for select
  using (auth.uid() = user_id);

create policy "Users can insert own leads"
  on public.leads for insert
  with check (auth.uid() = user_id);

create policy "Users can update own leads"
  on public.leads for update
  using (auth.uid() = user_id);

create policy "Users can delete own leads"
  on public.leads for delete
  using (auth.uid() = user_id);

-- Policies para campaigns
create policy "Users can view own campaigns"
  on public.campaigns for select
  using (auth.uid() = user_id);

create policy "Users can insert own campaigns"
  on public.campaigns for insert
  with check (auth.uid() = user_id);

create policy "Users can update own campaigns"
  on public.campaigns for update
  using (auth.uid() = user_id);

create policy "Users can delete own campaigns"
  on public.campaigns for delete
  using (auth.uid() = user_id);

-- Policies para messages
create policy "Users can view own messages"
  on public.messages for select
  using (exists (
    select 1 from public.campaigns
    where campaigns.id = messages.campaign_id
    and campaigns.user_id = auth.uid()
  ));

create policy "Users can insert own messages"
  on public.messages for insert
  with check (exists (
    select 1 from public.campaigns
    where campaigns.id = messages.campaign_id
    and campaigns.user_id = auth.uid()
  ));

-- Policies para scraping_jobs
create policy "Users can view own scraping_jobs"
  on public.scraping_jobs for select
  using (auth.uid() = user_id);

create policy "Users can insert own scraping_jobs"
  on public.scraping_jobs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own scraping_jobs"
  on public.scraping_jobs for update
  using (auth.uid() = user_id);
