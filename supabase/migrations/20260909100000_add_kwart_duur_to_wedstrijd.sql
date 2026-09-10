-- Kwart-timer (jt-dvh.14.8): standaardduur per kwart, aanpasbaar per wedstrijd via wedstrijdService.updateKwartDuur.

alter table public.wedstrijd
  add column if not exists kwart_duur_seconden int not null default 1200;

comment on column public.wedstrijd.kwart_duur_seconden is 'Standaardduur van een kwart in seconden, aanpasbaar per wedstrijd. Default 1200 (20 min).';
