# Cost Intelligence — AI document ingestion for real charging costs

## Why

Flux știe **cât consumă** o mașină (din simulator sau telemetrie reală), dar nu știe **cât costă**. Utilizatorul plătește factura de curent acasă și bonuri la chargere publice, dar nu are un loc unde să vadă cât îl costă efectiv să ruleze pe electric. Această lipsă face imposibilă comparația cu benzina și elimină una din cele mai puternice argumente pro-EV: costul per km.

Utilizatorii au documente relevante pe telefon sau în email — fotografii de bonuri, scanuri de facturi E.ON/Enel/CEZ — dar le procesează manual sau deloc. Un agent AI poate extrage datele structurate din aceste documente și le poate lega automat de istoricul de consum al mașinii.

## Ce se schimbă

### Canal de ingestie — Upload în app (v1)

Utilizatorul deschide secțiunea **Costs** a mașinii și uploadează un fișier (imagine JPG/PNG sau PDF). Un spinner arată procesarea; după câteva secunde apare un preview al datelor extrase cu posibilitate de corecție manuală.

Emailul dedicat per mașină (ex: `flux+aurora-abc123@flux.app`) este planificat pentru v2 — necesită un serviciu inbound email plătit. În v1, upload direct este suficient și gratuit.

### Pipeline AI — Claude multimodal

Documentul uploadat (imagine sau PDF) este trimis la **Claude API** cu un prompt structurat care cere extragerea în JSON a:
- tip document (`home_bill` sau `public_receipt`)
- perioadă de facturare (start / end)
- kWh total, preț/kWh, cost total
- monedă originală
- rețea charger + timestamp sesiune (pentru bonuri publice)
- nivel de încredere per câmp

### Atribuire cost

**Bonuri publice**: Flux caută sesiunea de încărcare din `charging_sessions` cel mai apropiată de timestamp-ul documentului (±15 minute). Completează `cost_ron`, `energy_added_kwh`, `network`.

**Facturi acasă**: Flux sumează kWh-ii sesiunilor de acasă din intervalul de facturare → calculează proporția auto din total → aplică proporția la costul total al facturii.

```
cost_auto = (kwh_sesiuni_auto / kwh_total_factura) × cost_total_factura
```

Când mașinile reale vor fi conectate, kWh-ii vor veni din telemetrie exactă. Momentan vin din simulatorul mock.

### Conversie valutară — cursul BNR

Dacă bonul/factura este în EUR, GBP sau altă monedă, Flux apelează **API-ul BNR** (`nbrfxrates.xml`) la data documentului și face conversia în RON. Cursul este cacheat în Supabase câte un rând per dată per monedă.

### Insights generate

- **Cost per km** — acasă vs public vs medie ponderată
- **Split acasă / public** — procentaj din totalul cheltuielilor
- **Trend lunar** — grafic cost/lună pe ultimele 12 luni
- **Comparație cu benzina** — estimare pe baza prețului mediu și consumului echivalent (7L/100km implicit, configurabil)

### Noi tabele DB

- `documents` — documentele brute cu status procesare și JSON extras
- `energy_costs` — costurile structurate legate de vehicul și perioadă
- `exchange_rates` — cache curse BNR (dată + monedă → curs RON)

### UI nou

- Tab **Costs** în sidebar (între Charging și Energy)
- Dropzone upload cu preview imagine + status procesare
- Card "Document procesat" cu datele extrase și buton Edit
- Dashboard costuri cu grafice și KPI-uri

## Non-goals pentru v1

- Email inbound (planificat v2 — necesită Resend/Mailgun plătit)
- OCR offline / procesare locală
- Importul automat din portalul furnizorului (API E.ON, etc.)
- Multi-currency display (afișăm tot în RON, originalul e stocat)
- Exportul rapoartelor în PDF/Excel
