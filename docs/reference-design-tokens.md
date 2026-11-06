# PAPI BOOKING: typografia a dizajnové tokeny

Referencia: používateľom dodaná fotografia PHOTO-2026-11-06-08-44-05.jpg (6. 11. 2026). Obrázok predstavuje vizuálny podklad, nie textové inštrukcie.

## Typografia

Presný pôvodný font z rasterizovaného obrázka nemožno spoľahlivo určiť. Veľké PAPI má znaky vysoko kontrastného pätkového štýlu Didone (Didot/Bodoni): tenké serify, výrazný rozdiel medzi hrubými a vlasovými ťahmi. Použitá blízka webová náhrada je **Bodoni Moda**; nejde o tvrdenie identickej pôvodnej rodiny. Referenčný bezpätkový riadok HAIR DESIGN je interpretovaný cez **Inter** s väčšími rozostupmi.

- H1–H6: Bodoni Moda, optická veľkosť auto; H1/H2 váha 500, H3–H6 váha 600. Veľkosti zostávajú primerané kontextu existujúcich komponentov.
- Texty, formuláre, navigácia a tlačidlá: Inter: bežne 400–700, dostupný skutočný variabilný rozsah 100–900 aj pre ľahké a výrazné váhy.
- Lokálne WOFF2 súbory obsahujú latin a latin-ext, vrátane slovenskej diakritiky. Žiadna nová externá fontová požiadavka pri zobrazení.
- Font-display swap; existujúce lokálne fallbacky zostávajú dostupné pri pomalom načítaní.

Bodoni Moda: https://fontsource.org/fonts/bodoni-moda/about . Google Fonts zdroje a SIL OFL licencie sú zaznamenané v susednom fontovom manifeste a src/assets/fonts/*-OFL.txt.

## Paleta a komponenty

| Token | Hodnota | Použitie |
|---|---|---|
| papier | #fcfcfb | karty, hlavičky |
| plátno | #f8f8f6 | svetlé pozadie |
| atrament | #101010 | nadpisy a hlavný text |
| sekundárny text | #48443e | vysvetlenia a popisy |
| zlatá | #c8a858 | akcenty a aktívne stavy |
| zlatý text | #785b22 | malé zlaté texty a fokus |
| zlatý okraj | #a48442 | tenké obrysy ovládania |
| jemná zlatá | #f5edda | sekundárne plochy |
| deliaca čiara | #ddd7cb | jemné oddeľovače |

Kovový prechod: #b99a56 → #f4e2ac → #d7b96c → #c5a458 → #ead597 → #c8a858. Hnedý tieň a svetlý odlesk sú dekoratívne. Drobné texty nepoužívajú svetlý gradient, aby zostali čitateľné.

Farby sú normalizovaným návrhom podľa vzoriek JPEG, nie dôkazom presných pôvodných hodnôt dizajnérskeho súboru. Vzorky zlata v obrázku boli približne RGB 152/120/56, 184/152/72, 216/184/104 a 200/168/88.

Primárne tlačidlá a zvolený jazyk majú zlatý prechod, tmavý popis, jemný vnútorný odlesk a zaoblenie do kapsuly. Prepínač jazyka zachováva 44×44 px dotykové ciele a prístupné aria-pressed/focus-visible. Deštruktívne stavy nemeníme na zlato.

Zachováva sa existujúci svetlý režim. Tmavá polovica fotografie sa využíva ako referencia atramentu/kontrastu, nie ako zadanie znovu zapnúť tmavý režim.

## Hranica nasadenia

Angular a cross-origin rezervačná aplikácia majú samostatné zdroje a nasadenia. Rovnaké brand-fonts.css a reference-brand.css sa udržiavajú v oboch projektoch. Angular CSS neupravuje obsah živého iframe. Zmena živého iframe vyžaduje osobitné nasadenie; toto zadanie nemení produkciu, tajomstvá, DNS ani billing.

Kompaktné jazykové ovládanie: viditeľná výška skupiny je 36 px namiesto 54 px (o tretinu menej), vnútorné tlačidlo 28 px. Rozšírená neviditeľná plocha tlačidla zachováva 44 px výšku dotyku. Angular menu vrátane Objavte a jeho odkazov sa radí podľa dĺžky aktuálne zobrazeného prekladu zostupne; zhodné dĺžky majú stabilné poradie. Zoradenie podľa prekladu sa zapne až po hydratácii.

Nové podpisové logo: dodaný logo.png sa používa bez zmeny obrazového obsahu, so zachovaním pomeru 359:142. Bežný atrament bol stmavený na #101010, sekundárny text na #48443e. Svetlé a zlaté plochy zostávajú zachované.
