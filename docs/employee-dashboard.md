# Zamestnanecký dashboard PAPI

Existujúci React booking má samostatný pracovný priestor zamestnanca na `/admin` (Dnes), `/admin/my` (Môj kalendár) a `/admin/appointments` (Rezervácie). Vzhľad adaptuje vybrané vzory z TailAdmin 1.3.0, archívny zdroj `959484be7431e16641e14296bac0a8bb7539dbc3`; MIT oznámenie je v `docs/third-party/TailAdmin-MIT.txt`. Angular runtime ani demo kalendár šablóny sa nepoužívajú.

## Prístup a dátový kontrakt

Prihlásenie zostáva Supabase Auth. Zamestnanec musí mať členstvo prevádzky a presne jeden aktívny záznam `employees` pre vlastné `profile_id`. Chýbajúce alebo nejednoznačné prepojenie nevyberá demo prevádzku ani prvého kolegu. Majiteľ a administrátor majú pôvodné správcovské obrazovky. Zákazník nemá prístup do pracovného priestoru; skryté menu nenahrádza route guard ani RLS.

Typovaná employee dátová vrstva zdieľa existujúce `appointments`, `employees`, `customers` a `services`; nevytvára druhú databázu. Každé čítanie a zamestnanecký zápis obsahuje prevádzku aj pracovníka. Vyhľadávanie je serverové podľa klienta alebo služby, zoznam je stránkovaný po 25, denný/týždenný prehľad načíta celý zvolený rozsah. Časy, deň a zmeny letného času sa vyhodnocujú v Europe/Bratislava aj pri inom pásme zariadenia. Preklady rozhrania SK/EN zdieľajú nastavenie verejného bookingu; názov služby zostáva katalógový, keďže existujúca DB schéma nemá `services.name_en`.

Zamestnanec môže `pending → confirmed/cancelled` a `confirmed → completed/cancelled`. Storno vyžaduje potvrdenie. Terminálne stavy sa neotvárajú; termín, klient, služba a pracovník sa nemenia. Zápis kontroluje pôvodný stav aj `updated_at`; nulový počet zmenených riadkov je konflikt, nie úspech. Nové emailové/SMS notifikácie nepridávame.

## Súkromie a service worker

Privátne REST/auth odpovede majú NetworkOnly/no-store, query keys obsahujú identitu a dáta sa neukladajú do trvalého offline úložiska. Pri výmene účtu a odhlásení sa dáta zrušia/odstránia. Nový worker vymaže iba starý `supabase-api-cache`. Verziovací handshake zabráni načítaniu osobných dát pod pôvodným cachujúcim workerom a bezpečne aktivuje jeho náhradu; pri probléme sa zobrazí chyba s opakovaním. Offline sa osobné rezervácie nezobrazujú.

## Reprodukovateľné overenie

Booking používa Node 22 (podporovaný aj 24) a **pnpm 10.11.0**, nie pnpm verziu samostatného Angular webu.

```sh
pnpm run test:sandbox <presný-commit-SHA>
```

Runner vytvorí nový archive export commitu, bez pôvodných `.env` alebo `node_modules`, nastaví výhradne testovacie API a spustí frozen inštaláciu, oba TypeScript projekty, celý ESLint, Vitest, produkčný build, produkčný aj plný dependency audit, lokálny SQL/RLS test a verejné aj prihlásené E2E. GitHub Actions nespúšťa. Browser retries sú explicitne 0. Výstup `result.json` obsahuje SHA, exit kódy a cesty k logom; pôvodné zlyhania sa zachovávajú. Voliteľné `PAPI_PNPM_CLI` určuje cestu k pnpm.cjs a `PAPI_SANDBOX_ROOT` koreň dôkazov, `PLAYWRIGHT_CHROME_BIN` podporovaný lokálny Chrome.

RLS runner používa vlastný dočasný PostgreSQL 18 kontajner bez siete, bez vystavených portov, s dátami v tmpfs. Auth claim primitíva sú simulované, tabuľky a relevantné auth/RLS migrácie sú skutočné SQL z repozitára. Toto je overenie DB pravidiel; nejde o úplný reset všetkých historických migrácií ani dôkaz nasadenia na živom Supabase. E2E naproti tomu používa kontrolované auth/API fixtures a povoľuje zápisy len do ich pamäťového stavu.

## Produkčný release

Používateľ dodatočne autorizoval po zelených kontrolách a merge aj produkčný Vercel release. Overený cieľ: projekt `nimble-agenda` (`prj_RzEAla7pjIJ4x46eCvKMIxEhyLVT`), tím `team_ABU61vBGuToYfLqgvPbt1zlk`, alias `nimble-agenda-swart.vercel.app`. Samostatný Angular web sa týmto releasom nenasadzuje.

1. Presný finálny commit musí prejsť sandboxom; PR smeruje do `loveable`, nikdy priamy push do cieľovej vetvy.
2. Databázová migrácia `employee_dashboard_status_guard` musí byť overená a samostatne autorizovaná pre skutočný Supabase projekt `eudwjgdijylsgcnncxeg`. Obmedzuje pracovníka na povolené stavové zmeny a zachováva owner/admin a trusted maintenance. Frontend build migrácie nespúšťa.
3. Vytvoriť staged produkčný Vercel deployment presného zlúčeného zdroja bez pridelenia produkčných aliasov, skontrolovať build, autentifikačné presmerovanie a verejný booking bez skutočných rezervácií; potom propagovať rovnaký build.
4. Overiť produkčný alias, source commit, dostupnosť súborov, worker a konzolu. Prihlásený živý test vyžaduje autorizovaný testovací účet; fixture PASS ho nenahrádza.
5. Pri probléme vrátiť zaznamenaný predchádzajúci Vercel deployment. DB guard automaticky neodstraňovať: je spätne kompatibilný s povolenými zamestnaneckými stavovými zmenami; jeho rollback vyžaduje samostatnú kontrolu oprávnení.

Východiskový produkčný deployment: `dpl_CzSpyHjQTAwGZh7Pdb2dXdJcZ3oP`, zdroj `3e9a5887a4becb17cf298a65b2c93a1039dbd9f3`. Pripojený Supabase konektor v čase prípravy nesprístupňoval booking projekt a CLI nebolo prihlásené. Bez overenia tejto závislosti nemožno tvrdiť, že databázová migrácia je nasadená. DNS, tajomstvá a billing sa nemenia.
