
# BLUEPRINT: PAPI HAIR DESIGN - Booking System do 100% Production Ready

## Sumar sucasneho stavu

Aplikacia ma solidny zaklad: 6-krokovy booking flow, admin panel s kalendarem, sprava zamestnancov/sluzieb/zakaznikov, offline reception mode, PWA, e-mail notifikacie a AI generovanie popisov sluzieb. Landing page je interaktivna "expanding cards" stranka.

Nizsie je kompletny zoznam vsetkeho, co treba opravit, doplnit a vylepsit, rozdeleny do kategórii od najkritickejsich po nice-to-have.

---

## A. KRITICKE OPRAVY (musia byt pred spustenim)

### A1. Landing page - prepojenie s papihairdesign.sk
- Aktualna `/` (LiquidPlayground) sluzi ako landing pre booking system
- Treba pridat jasny **"Spat na papihairdesign.sk"** odkaz v headeri/footeri pre navigaciu na oficialnu stranku
- Na papihairdesign.sk pridat tlacidlo/odkaz "Rezervovat online" ktory smeruje na `booking.papihairdesign.sk/booking`
- Pridat **Open Graph meta tagy** (`og:title`, `og:description`, `og:image`) pre zdielanie na socialnych sietach

### A2. Chybajuca tabulka `employee_services`
- Kod pouziva `(supabase as any).from("employee_services")` - tabulka existuje ale nie je v TypeScript typoch
- Treba pridat migraciu na formalizaciu tabulky + RLS politiky
- Pridat foreign keys na `employees(id)` a `services(id)`

### A3. Chybajuca tabulka `notification_logs`
- Edge function `send-appointment-notification` pise do `notification_logs`, ale tabulka nemusi existovat
- Treba overit a pridat migraciu ak chyba
- Rovnako RPC funkcie `get_business_admin_emails` a `was_notification_sent`

### A4. Chybajuce potvrdenie e-mailov zakaznikov
- Booking potvrdenie (send-booking-email) zavisi od SMTP configu v business tabulke
- Treba overit ze SMTP je nakonfigurovany a funguje, alebo pouzit Lovable Cloud e-mail system
- Pridat **fallback** ak SMTP nefunguje - ukazat aspon hlasku "Potvrdenie nebolo mozne odoslat"

### A5. Hardcoded DEMO_BUSINESS_ID
- V BookingPage.tsx, LiquidPlayground.tsx, MobileCalendarShell.tsx je napevno `a1b2c3d4-0000-0000-0000-000000000001`
- Pre produkcny system treba dynamicky ziskat business_id:
  - Na `/booking` cez URL parameter alebo slug (`/booking/papihairdesign`)
  - Na landing page rovnako
- Toto je kriticke pre spravne fungovanie multi-tenant architektury

---

## B. BOOKING FLOW - VYLEPSENIA

### B1. Potvrdenie pred odoslanim
- Pridat **sumarny krok** pred finalnym odoslanim: zobraziena vybratej sluzby, zamestnanca, datumu, casu a kontaktnych udajov
- Tlacidlo "Potvrdit rezervaciu" az po skontrolovani

### B2. Zrusenie rezervacie zakaznikom
- Aktualne zakaznik nema moznost zrusit rezervaciu
- Pridat stranku `/cancel/:token` s jednoduchym formulárom na zrusenie
- Respektovat `cancellation_hours` nastavenie z business tabulky
- Odoslat email o zruseni

### B3. Pripomienka pred terminom
- Automaticky email/notifikacia **24h a 1h pred terminom**
- Vyzaduje CRON job alebo Supabase scheduled function
- "Nezabudnite na vas termin zajtra o 14:00 - Strihanie vlasov u Misky"

### B4. Kalendar v booking flow - indikacia dostupnosti
- Aktualne kalendar neukazuje ktore dni maju volne terminy
- Pridat **farebne bodky** na dni s volnymi slotmi (zelena = volne, seda = plno)
- Predchadzat sklamaniu zakaznikov klikajucich na plne dni

### B5. Vyber viacerych sluzieb
- Zakaznik by mal mat moznost zarezervovat viac sluzieb naraz (napr. Strih + Farbenie)
- Automaticky spocitat celkovy cas a cenu
- Zobrazit v summary pred potvrdenim

### B6. Preferovany zamestnanec "Jedno kto"
- Pridat moznost "Je mi jedno kto" - system automaticky vyberie zamestnanca s najskorim volnym terminom

---

## C. NOTIFIKACIE A KOMUNIKACIA

### C1. SMS notifikacie (volitelne)
- Integracia s SMS provider (Twilio/MessageBird) pre SMS pripomienky
- Alternativa: WhatsApp Business API

### C2. Push notifikacie (PWA)
- Vyuzit existujuci PWA setup na posielanie push notifikacii
- Admin dostane push ked pride nova rezervacia
- Zakaznik dostane push pripomienku

### C3. E-mail o zmene statusu
- Ked admin zmeni status rezervacie (potvrdena/zrusena/dokoncena), zakaznik dostane email
- Aktualne sa posiela len pri vytvoreni

---

## D. ADMIN PANEL - CHYBAJUCE FUNKCIE

### D1. Dashboard analytica s grafmi
- Aktualne dashboard ukazuje len 4 cisla (dnes, celkovo, zamestnanci, sluzby)
- Pridat **recharts grafy**:
  - Tyzdenne/mesacne trzby (bar chart)
  - Obsadenost podla zamestnancov (stacked bar)
  - Top 5 sluzieb podla poctu rezervacii (pie chart)
  - Trend novych zakaznikov (line chart)

### D2. Export dat
- Export rezervacii do CSV/Excel
- Export zakaznikov do CSV
- Filtrovanie podla datumoveho rozsahu

### D3. Hromadne akcie na rezervaciach
- Oznacit viacero rezervacii a hromadne potvrdit/zrusit
- Filter podla zamestnanca v zozname rezervacii

### D4. Historia zmien (audit log)
- Zaznamenat kto a kedy zmenil status rezervacie
- Zobrazit v detaile rezervacie

### D5. Sprava kategorii a podkategorii
- Aktualne su kategorie (`damske`/`panske`) a podkategorie napevno
- Pridat UI na spravu kategorii v nastaveniach
- Moznost pridat vlastne kategorie (Detske, Svadobne, atd.)

### D6. Drag & drop presun v kalendari
- Admin moze pretiaahnut rezervaciu na iny cas/den priamo v kalendari
- react-big-calendar to podporuje cez `onEventDrop`

### D7. Sprava prístupov a pozvanok
- Pridat moznost pozvat noveho zamestnanca cez email
- Automaticky vytvorit membership s rolou "employee"
- Zmena roli existujucich clenov

---

## E. ZAKAZNICKA ZONA

### E1. Zakaznicke konto - prehlad rezervacii
- Po prihlaseni zakaznik vidi zoznam svojich aktivnych a minulych rezervacii
- Moznost zrusit buduce rezervacie
- Stranka `/my-bookings` alebo sekcia v `/admin`

### E2. Opakovana rezervacia
- Tlacidlo "Zarezervovat znova" pri minulej rezervacii
- Predvyplni rovnaku sluzbu a zamestnanca

### E3. Hodnotenie po navsteve
- Po dokonceni rezervacie poslat email s moznostou hodnotenia (1-5 hviezdicky)
- Zobrazit priemerne hodnotenie zamestnancov v booking flow

---

## F. TECHNICKY HARDENING

### F1. Error boundary a fallback UI
- Pridat React Error Boundary okolo hlavnych komponentov
- Zobrazit uzivatelsky privetive chybove hlasky namiesto bielej stranky

### F2. Loading skeleton states
- Nahradit prazdne miesta pocas nacitavania skeleton komponentmi
- Zlepsit vnimanou rychlost

### F3. Optimistic updates
- Ked admin zmeni status, okamzite aktualizovat UI a synchrónne odoslat na server
- Revert ak server vrati chybu

### F4. Realtime updates v admin kalendari
- Pouzit Supabase Realtime na `appointments` tabulku
- Ked iny admin alebo zakaznik vytvori/zmeni rezervaciu, kalendar sa automaticky aktualizuje

### F5. Rate limiting na frontende
- Debounce na submit tlacidla v booking flow (zabranit dvojitemu kliknutiu)
- Aktualne je len backend rate limiting

### F6. SEO a pristupnost
- Pridat `<title>`, `<meta description>` pre kazdu stranku
- Aria labels na interaktivne elementy
- Keyboard navigacia v booking flow

### F7. Testy
- Aktualne len 1 test (OAuthButtons)
- Pridat testy pre:
  - availability.ts (slot generation)
  - Booking flow (end-to-end s Playwright)
  - Edge functions (unit testy)
  - Admin CRUD operacie

---

## G. LANDING PAGE STRATEGIA

### G1. Aktualny stav
Momentalne `/` je LiquidPlayground s expanding cards (Brand, Hodiny, Cennik, Rezervacia, Kontakt). Toto je uz pekna landing page pre booking system.

### G2. Odporucana strategia
Kedze papihairdesign.sk je oficialny web salonu, booking.papihairdesign.sk by mal mat:

1. **Zjednodusenu landing** - rychle CTA "Rezervovat teraz" hned na vrchu
2. **Odkaz spat** na papihairdesign.sk v headeri
3. **Cennik** presunuty z landing page na samostatnu podstranku `/pricing` (alebo ponechat na landing)
4. **Google Maps embed** s lepsou kvalitou (pouzit Google Maps API namiesto OSM)
5. **Social proof** - pocet uspesnych rezervacii, hodnotenia
6. **Cookie consent banner** - uz existuje, overit GDPR compliance

### G3. Mobile-first redesign
- Expanding cards su na mobile mensie - zvazit jednoduchsi layout pre mobily
- "Rezervovat teraz" sticky tlacidlo na spodku obrazovky na mobile

---

## H. INFRASTRUKTURA A DEPLOY

### H1. Monitoring a alerting
- Pridat error tracking (napr. Sentry) pre frontend chyby
- Monitoring edge function failures

### H2. Backup strategy
- Pravidelne zalohy databazy
- Export zakaznikov a rezervacii

### H3. Staging environment
- Aktualne len production
- Zvazit staging na testovanie novych features

### H4. Performance monitoring
- Vercel Speed Insights uz existuje
- Pridat Web Vitals tracking
- Optimalizovat LCP na landing page

---

## PORADIE IMPLEMENTACIE (odporucane)

```text
Faza 1 - Kriticke (1-2 tyzdne)
  A1  Landing page prepojenie s papihairdesign.sk
  A2  Formalizacia employee_services tabulky
  A3  Overenie notification_logs a RPC funkcii
  A5  Dynamicky business_id namiesto hardcoded
  B1  Sumarny krok pred odoslanim rezervacie
  F1  Error boundary
  F5  Debounce na submit

Faza 2 - Zakaznicka skusenost (2-3 tyzdne)
  B2  Zrusenie rezervacie zakaznikom
  B3  Pripomienky pred terminom
  B4  Indikacia dostupnosti v kalendari
  B6  Moznost "Jedno kto" pri vybere zamestnanca
  C3  Email o zmene statusu
  E1  Zakaznicka zona s prehladom
  F2  Loading skeletons

Faza 3 - Admin vylepsenia (2-3 tyzdne)
  D1  Dashboard analytica s grafmi
  D2  Export dat
  D3  Hromadne akcie
  D6  Drag & drop v kalendari
  D7  Sprava pristupov
  F4  Realtime updates

Faza 4 - Nadstandard (priebezne)
  B5  Vyber viacerych sluzieb
  C1  SMS notifikacie
  C2  Push notifikacie
  D4  Audit log
  D5  Sprava kategorii
  E2  Opakovana rezervacia
  E3  Hodnotenie po navsteve
  F3  Optimistic updates
  F6  SEO a pristupnost
  F7  Kompletne testy
  G3  Mobile-first redesign landing
```

---

## Technicke poznamky

- Vsetky zmeny budu v React + TypeScript + Tailwind CSS + Supabase
- Databazove zmeny cez migration tool
- Edge functions pre backend logiku (notifikacie, CRON, atd.)
- Recharts pre grafy (uz je v dependencies)
- Framer Motion pre animacie (uz je v dependencies)
- Dodrzanie existujucich patterns: `useBusiness()` hook, `supabase` client import, sonner toasty
- Mobilny dizajn: calendar-first layout, bottom sheet interakcie (podla custom knowledge)
