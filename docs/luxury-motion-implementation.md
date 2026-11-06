# PAPI luxury motion: implementácia

Angular a samostatný React booking importujú zhodný `src/luxury-motion.css`.
Obsah súborov sa pri integračnom overení porovnáva bajtovo. Paleta a lokálne
fonty sa nemenia. Nepridávajú sa knižnice ani upravené fotografie.

## Pravidlá

- Soft tieň: `0 2px 8px rgb(32 24 10 / 4.5%)`, ovládanie a jemné oddelenie.
- Card tieň: `0 8px 24px rgb(32 24 10 / 7.5%)`, vybrané obsahové plochy.
- Floating tieň: `0 18px 48px rgb(32 24 10 / 12%)`, menu a dialógy.
- Trvania: 140/220/320 ms; easing `cubic-bezier(.2, .7, .2, 1)`.
- CTA hover je jednorazový 1px pohyb len pre presný pointer. Po skončení
  neponechá transform. Active používa opacity, klávesnica viditeľný obrys.
- Disabled/busy neanimuje. Reduced motion vypne dekoratívne CSS animácie,
  prechody a smooth scroll; booking ho rešpektuje aj v JavaScript helperi.
- Tiene sa neanimujú. Popper prepočty a funkčné umiestnenie overlayov sa
  nepovažujú za dekoratívny pohyb a nesmú sa plošne nulovať.

## Angular

Lookbook používa natívne tlačidlá, stabilné texty nad tmavým gradientom,
jemný pointer-only zoom samotnej fotografie a pôvodné fotografie bez watermarku.
Detail služby má krátky reveal, focus trap, Escape a obnovu fokusu.
SK/EN štýly sú presunuté z komponentu do spoločného súboru. Domov, servisné
karty, menu a dialógy používajú sémantické tiene. Pätička a ovládanie návratu
nahor majú pokojnejšie efekty; priebeh čítania nepretržite nebliká.

Odstránené duplicity: JS mousemove glow a jeho merania každej karty;
nepoužívané QueryList/lifecycle/importy po jeho odstránení; lokálne kópie
jazykových štýlov; staré modal zoom keyframes; nepoužívaný footer-logo filter
a scroll-to-top shine keyframes. Pôvodná regresia životného cyklu mousemove
bola nahradená regresiou bez globálneho listenera/layout meraní, so zachovanou
kontrolou znovuvytvorených aj zničených kariet a funkčného odkazu.

## Booking

Rovnaký jazykový prepínač, ovládacie stavy, výberové karty a tiene.
Odhalenie služby/pracovníka má jednu WAAPI animáciu čítajúcu CSS tokeny;
duplicitná CSS animácia je odstránená. Kalendár má 44px tlačidlá a na úzkom
viewporte využije dostupnú šírku. Vizuálne malé jazykové tlačidlá zachovajú
44px hit area. Kategórie a dátumy majú vyjadrený selected stav, šípky mesiaca
zrozumiteľné SK/EN názvy. Radix ponecháva vlastnú správu fokusu a Escape;
vstupný pohyb a centrovanie dialógu už nevyžadujú trvalý transform.

## Overovanie

Pred odovzdaním: izolovaný `pnpm run test:sandbox <presný Angular commit>`;
čistý export booking commitu, frozen install, typy, unit, build, cielený lint,
E2E s kontrolovanými read-only dátami. E2E používajú retries 0.
Regresie pokrývajú 320×568, 390×844, 844×390, 768×1024, 1440×900,
klávesnicu, reduced motion, 200 % text, koniec ponuky a stabilné transformy.
Integračné browser overenie musí skontrolovať aj zhodu SK/EN štýlov, jednu
iframe, zachovanie výberu a bezpečný spätný jazykový most.

Konkrétne testované commity, skutočné výsledky, snímky, prípadné neúspešné
behy a logy patria do odovzdania PR. Táto dokumentácia sama netvrdí PASS
budúceho behu. Produkcia, DNS, tajomstvá, billing ani GitHub Actions sa nemenia.
