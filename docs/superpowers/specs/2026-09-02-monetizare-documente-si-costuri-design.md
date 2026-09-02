# Monetizare — două abonamente, și niciunul nu depinde de mașină

**Data:** 2026-09-02
**Stare:** design aprobat, neimplementat
**Înlocuiește:** poziționarea din `src/components/product/PricingSection.tsx`
(€4,99/lună, €3,25/lună anual) și ordinea porților din `src/lib/roadmap.ts`

---

## Premisa

Cinci analize independente au ajuns la aceeași concluzie: **fiecare direcție în
care Flux ar fi vândut ca aplicație-companion pentru Tesla pierde.**
Planificatorul concurează cu cel gratuit din mașină, comenzile cu aplicația
gratuită Tesla, logarea cu TeslaMate care e gratis, supravegherea cu Tessie, care
are ~400.000 de utilizatori. Notele au fost, pe rând: construit 7 / apărabil 2,
5 / 3, 5 / 2, 1 / 2.

Concluzia acestei specificații e mai radicală decât alegerea unei direcții:
**produsul plătit nu atinge deloc mașina.** Se vând documentele și costurile.
Conexiunea la mașină rămâne în aplicație, dar iese din drumul comercial până când
va merita reluată.

### De ce, în cifre

Tarifele Tesla, derivate din studiile de caz de pe pagina lor de facturare și
verificate pe toate cele trei totaluri publicate (`docs/SCALING-AND-COSTS.md`):
**$0,002 o citire, $0,001 o comandă, $0,02 o trezire, $10 credit lunar** per cont
de partener.

| Ce facem | Cost lunar / utilizator |
| --- | --- |
| Interogări în PostGIS-ul nostru (hartă, stații, rutare) | **~0** |
| OCR, ~20 de documente | **~$0,30** |
| Dashboard live, poll la 30 s, o oră pe zi | **$7,20** |

Un singur rând e periculos, și e cel al mașinii — adică exact suprafața pe care
analizele au găsit-o cel mai puțin apărabilă. Scoțând-o din produsul plătit,
costul marginal devine **aproape plat**, iar marja crește cu fiecare utilizator
în loc să rămână blocată la ~22%.

---

## 1. OCR și procesare — corectitudine, funcționare, date

Prima secțiune pentru că e prima condiție, și cu atât mai mult acum: cu produsul
plătit construit exclusiv pe documente, **pipeline-ul de OCR nu mai e o componentă
a produsului, este produsul.** Dacă extragerea greșește, nu avem nimic de vândut.

### 1.1 Ce știm azi, și ce doar presupunem

**Ingestia e construită și e bună.** `src/lib/ai/document-parser.ts` — vedere
Claude, blocuri PDF și imagine, validare Zod, marcaje de încredere per câmp, prag
`needs_review` la 0,7. Trei canale de intrare: încărcare directă, email
Cloudmailin cu adresare `+shortid` per mașină, WhatsApp prin Twilio cu validare
HMAC. Conversie valutară BNR cu rezervă de weekend. Prompturi românești care
cunosc RCA, CASCO, ITP, rovinieta, taxa auto și leasingul.

**Dar nimic din toate astea nu e verificat.** Nu există `src/lib/ai/__tests__/`.
Singurul test din zona costurilor este `src/lib/costs/__tests__/confidence.test.ts`,
care testează scorul de încredere — nu extragerea, nu schemele, nu maparea către
`ParsedDocument`, nu aritmetica. Trei commituri au atins vreodată `src/lib/costs`.

Afirmația „OCR-ul merge" se sprijină pe faptul că a mers pe documentele proprii
ale autorului. E o presupunere, nu o măsurătoare.

### 1.2 Corectitudinea extragerii

**Un corpus golden.** Zece până la cincisprezece documente reale, anonimizate,
comise în repo: două facturi de energie de la furnizori diferiți, o bonificație de
la o stație publică, un RCA, un CASCO, un ITP, o rovinietă, o factură de leasing,
o factură de service, plus două cazuri urâte — un scan strâmb și o poză făcută cu
telefonul.

Plus, odată cu §1.3, **două poze de ecran de mașină** — una cu kilometrajul, una
cu ecranul de consum — fotografiate cum le face un om: din scaunul șoferului, cu
reflexii și în unghi, nu drept și curat.

Pentru fiecare, rezultatul așteptat, scris de mână. Testul compară câmp cu câmp și
cere ca fiecare câmp care contează să fie **ori corect, ori marcat
`needs_review`**. Un câmp greșit cu încredere mare este singurul rezultat
inacceptabil, pentru că e singurul pe care omul nu-l verifică.

Apelul către Claude se înregistrează o dată și se refolosește, ca testele să ruleze
fără rețea și fără cost.

**Ce mai testăm:** schemele Zod resping ce trebuie respins; `.catch(0)` de pe
marcajele de încredere nu transformă în tăcere un răspuns stricat într-unul cu
încredere zero care trece mai departe; maparea document-mașină nu pierde câmpuri;
fiecare cod de eroare de la Anthropic ajunge la un mesaj pe care un om îl înțelege.

**Fluxul de revizuire.** Pragul există, ecranul care îl folosește cum trebuie nu.
Un document sub prag trebuie să ceară confirmarea sumei **înainte** să intre în
calcule.

### 1.3 Kilometrii și consumul, fără să atingem mașina

Azi nu există niciun câmp de rulaj nicăieri — nici în `AddVehicleModal`, nici în
`ParsedDocument`, nici în prompturi.

**Patru surse, un singur tabel.** `odometer_readings` — `vehicle_id`, `km`,
`recorded_at`, `source`, `confidence`:

1. **La adăugarea mașinii**, în `AddVehicleModal`, care există deja și e locul
   firesc. Opțional, cu motivul scris lângă câmp. Obligatoriu la înscriere ar
   însemna fricțiune înainte ca omul să fi văzut vreo valoare.
2. **Introducere manuală, oricând** — un câmp la îndemână în ecranul de costuri,
   pentru când nu ai poza la tine. E cea mai simplă cale și trebuie să fie la fel
   de vizibilă ca poza, nu ascunsă ca alternativă de rezervă.
3. **Din documente**, automat — ITP-ul consemnează rulajul, facturile de service
   aproape întotdeauna. Zero efort, dar ritm anual.
4. **Din poza ecranului mașinii** — tip nou de document, aceeași conductă de OCR.

Distanța dintre două citiri dă kilometrii; kilometrii dau **cost/km și economia
față de benzină**.

**Tabel separat, nu `vehicle_snapshots`.** Tentația e să scriem în tabelul care
există. Dar ar amesteca citiri manuale cu telemetrie într-un tabel fără marcaj de
sursă — exact ambiguitatea din care s-au născut C1–C5.

**Al doilea tip de poză: ecranul de consum.** Ecranul de energie al Tesla arată,
într-o singură imagine, distanța, energia consumată și Wh/km — de pildă
*181,3 Wh/km, 488,0 kWh, 2.692 km*. Eficiență reală, măsurată de mașină, fără
niciun apel de API.

**Validarea, care e partea nouă.** O eroare de OCR cu un ordin de mărime —
79.449 citit ca 7.944 — nu e o imprecizie, ci strică toate cifrele de cost/km în
tăcere, și arată plauzibil. Conducta actuală nu are cum să o prindă. Odometrul
însă are două proprietăți pe care o factură nu le are:

- **crește întotdeauna** — o citire sub cea precedentă se respinge;
- **crește într-un ritm plauzibil** — peste ~1.000 km/zi de la ultima citire e
  aproape sigur o greșeală de citire, nu un drum.

Cele două prind practic orice eroare de o cifră, **și se aplică identic
introducerii manuale**, unde o cifră în plus la tastat e la fel de probabilă.

Efort: **~3–4 zile** pentru cele patru surse, tabel, validare și teste.

### 1.4 Corectitudinea aritmeticii

Șapte defecte cunoscute. Patru dintre ele sunt despre atribuirea facturii casei
către sesiuni de încărcare — care nu mai există în produsul plătit — deci ies din
drumul critic:

| Defect | Stare |
| --- | --- |
| Înțelesul unic al lui `energy_costs.cost_ron` | **De reparat** |
| Ziua pierdută la marginea perioadei (`.lte` la miezul nopții UTC) | **De reparat** |
| Cipul de economie și cipurile de cost/km folosesc baze diferite | **De reparat** |
| `costPerKmHome` împarte costul de acasă la kilometrii totali | **De reparat** |
| `attribution.ts` citește `network IS NULL` ca „încărcat acasă" | Amânat cu mașina |
| Ramura fără sesiuni atribuie mașinii toată factura casei | Amânat cu mașina |
| Înmulțirea dublă cu fracția de atribuire | Amânat cu mașina |

Prima rămâne prima: până nu se decide dacă `cost_ron` e costul total al facturii
sau partea atribuită mașinii, orice reparație e un petic peste aceeași
ambiguitate. Rândurile deja salvate au nevoie de migrație.

Cele trei amânate **nu se șterg** — rămân în `docs/OPERATIONS.md` §6, pentru că
codul lor rulează în continuare pentru mașinile deja conectate. Doar nu mai
blochează lansarea.

**Teste golden pe aritmetică.** O factură, un set de documente, un rezultat
așteptat, calculat de mână. Azi nu există niciunul.

### 1.5 Gestionarea datelor

O factură de utilități conține numele, adresa și codul de client. Un RCA conține
numărul de înmatriculare și adesea CNP-ul. Sunt date personale ale unui om din UE,
trimise către un model găzduit în Statele Unite.

Înainte ca un plătitor să încarce primul document:

- **DPA cu Anthropic** acceptat, și Anthropic listat ca sub-procesator în nota de
  confidențialitate, alături de Vercel, Supabase, Upstash, Stripe, Resend și
  Twilio.
- **Temeiul legal, scris.** Executarea contractului pentru serviciu.
- **O politică de retenție.** Azi fișierele rămân la nesfârșit. Ștergerea contului
  le șterge (`/api/user/delete` curăță și storage-ul), deci Art. 17 e acoperit
  mecanic. Propunerea: **cât timp contul e activ, plus 12 luni** — suficient cât
  să acopere un an fiscal după plecare. Implementat ca job de curățare, nu doar
  promis în text.
- **Ștergerea unui singur document** din interfață, nu doar a contului întreg.
- **Registrul de prelucrări (Art. 30)**.
- **Fără DPIA.** Era necesar pentru monitorizarea poziției vehiculului; fără
  mașină în produs, nu se declanșează. Revine odată cu ea.

### 1.6 Cum știm că am reușit

- Corpusul golden trece, și niciun câmp nu e greșit cu încredere peste prag.
- Testele golden pe aritmetică trec, inclusiv pentru o lună fără niciun document.
- `/debug` arată rata de eșec OCR ca **procent din încărcări** — o cheie Anthropic
  moartă arată identic cu un teanc de facturi ilizibile până nu împarți.
- Nota de confidențialitate listează fiecare sub-procesator care chiar primește date.

---

## 2. Cele două abonamente

### Free — „vezi unde încarci"

Hartă, planificator, stații, o mașină, plus **3 documente pe lună, de orice tip** —
un singur contor, nu cele două de azi (5 energie + 10 auto). Un contor unic e mai
ușor de înțeles decât două plafoane care se epuizează separat.

Cost marginal **zero**: sunt interogări în PostGIS-ul nostru. Poate rămâne gratis
la nesfârșit, și e singurul canal de achiziție pe care îl avem.

### Pro — €4,99 — „toate costurile mașinii tale, din hârtiile tale"

Până la **două mașini**, **50 de documente pe lună**, clasificare, termene cu
memento (RCA, ITP, rovinietă, taxă), total lunar și anual, defalcare pe categorii,
mai multe valute cu curs BNR, cost/km din odometru, economie față de benzină,
consumul din ecranul mașinii, export CSV.

**Cincizeci, nu „nelimitat".** Un utilizator normal încarcă două-cinci pe lună,
deci cincizeci e generos până la invizibil. Dar „nelimitat" nu acoperă niciodată un
cost — la $0,015 documentul, un plafon declarat ține cel mai rău caz la $0,75, iar
un plafon nedeclarat nu ține nimic. E aceeași regulă pe care am aplicat-o
citirilor Tesla.

**Economia, la €4,99:**

| | |
| --- | --- |
| OCR, în cel mai rău caz (50 documente) | $0,75 |
| Stripe | €0,36 |
| Infrastructură fixă (Vercel Pro + Supabase Pro), la 100 de abonați | €0,42 |
| **Total, cel mai rău caz** | **~€1,45** |
| **Marjă** | **~70%**, și crește cu fiecare abonat |

Pragul de rentabilitate e pe la **zece abonați** — nu pentru că prețul e mare, ci
pentru că nu mai există un cost per cerere care să crească odată cu ei.

### Ce nu se vinde: mașina

Conexiunea Tesla rămâne în aplicație pentru cine o are deja. Nu e promisă, nu e
vândută și nu apare în pagina de preț.

Dar rămâne costisitoare, iar asta cere o măsură: **`DAILY_READ_BUDGET` scade de la
200 la 40.** Fără venit în spate, un dashboard lăsat deschis o oră costă $0,24 din
buzunarul nostru; plafonul nou ține cel mai rău caz la ~$2,40 pe lună și pe mașină.
Cronul zilnic rămâne — costă $0,06 pe lună și ține istoricul continuu.

Motivul deciziei, scris ca să nu se piardă: integrarea nu e la un nivel care să
justifice un preț, iar analizele au arătat că nici la un nivel bun nu ar fi
apărabilă. Se reia când avem un motiv, nu un calendar.

### Diferențierea de mai târziu

Axa naturală, când va fi nevoie, e **numărul de mașini** pentru care ținem
costurile — o gospodărie cu două mașini, un om cu trei. Nu are nicio legătură cu
Tesla, costul ei scalează cu documentele, și nu cere nimic din ce am amânat aici.
Nu se construiește acum.

## 3. Ce scoatem din texte

În toate cele cinci limbi, pentru că nu sunt adevărate:

- **costul pe sesiune de încărcare** — nu poate fi produs la rezoluția la care
  citim mașina;
- **disponibilitatea în timp real a prizelor** — e derivată din simulator, nu
  dintr-un flux de operator;
- **preconditionarea către chargere non-Tesla** — nicio comandă din Fleet API nu o
  poate porni, iar Tesla o face singură din software 2025.2;
- **split casă/public** — cere sesiuni de încărcare, deci pleacă odată cu mașina;
- **orice promisiune despre mașină din pagina de preț.**

Iar consumul se descrie cu sursa lui: **„consumul tău, din ecranul mașinii tale"**,
niciodată „consum real, automat". Diferența nu e cosmetică — una e adevărată când
sosește poza, cealaltă promite ceva ce nu facem.

Regula din care decurg toate: *o afirmație care își supraviețuiește adevărului e
mai rea decât nicio afirmație.*

## 4. Ce blochează încasarea

Scoaterea mașinii din produs scoate și patru blocaje din drum: proxy-ul releu,
metoda de plată și limita de facturare la Tesla, URL-ul de confidențialitate în
aplicația developer, și DPIA. Toate revin odată cu mașina.

Rămân:

1. **PFA** — 1–2 săptămâni, ~€100–200. Ca persoană fizică nu poți deschide Stripe
   live în România. Cea mai lungă așteptare, nu depinde de cod.
2. **Termeni + Politică de confidențialitate** — 1–2 zile.
3. **Vercel Pro + Supabase Pro** — +€40/lună. Vercel Hobby interzice explicit
   încasarea de bani.
4. DPA-uri click-through cu sub-procesorii — 2 ore.
5. **Bifa de renunțare la dreptul de retragere de 14 zile**, la checkout.
6. Chei Stripe live + configurarea taxelor.
7. **Cheia CARTO** — altfel fiecare hartă din Free are filigran `API KEY REQUIRED`.

## 5. Ordinea

- **Azi:** se depune PFA-ul.
- **Săptămânile 1–2, cât se procesează:** corpusul golden și testele de extragere
  (§1.2); kilometrii și consumul din cele patru surse (§1.3); înțelesul unic al lui
  `cost_ron` și cele patru reparații rămase (§1.4).
- **Săptămâna 3:** gestionarea datelor (§1.5), Termeni și Politică, DPA-uri, cheia
  CARTO, tăierea bugetului de citiri la 40.
- **Săptămâna 4:** cele două abonamente în Stripe, granițele în `subscription.ts`,
  chei live. **Vandabil aici.**
- **În paralel, tot timpul:** aplicația la zece proprietari, gratis. Nu întârzie
  nimic, pentru că oricum se așteaptă PFA-ul. Și acum pot fi proprietari de orice
  marcă — produsul plătit nu mai cere Tesla.

Secțiunea 1 e **~11–12 zile de lucru**. Peste ea vin legalul și împachetarea —
zile puține, calendar mult, pentru că PFA-ul se așteaptă.

## 6. Ce nu e în această specificație

- Modul de lansare și marketingul — specificație separată.
- **Tot ce ține de mașină ca produs plătit.** Dashboard live, comenzi, notificări,
  sesiuni de încărcare, split casă/public. Codul rămâne, promisiunea nu.
- Fleet Telemetry. Rămâne poarta 3, și acum e o poartă fără dată.
- Mașina de firmă și decontul. Analizate și respinse: în România se vând foi de
  parcurs conforme ANAF, cu hardware inclus, la €3,10–4,50 per vehicul.
- Tierul pe număr de mașini. Descris în §2 ca direcție, nu construit.

## 7. Riscul pe care îl acceptăm conștient

Nimeni nu a fost întrebat dacă plătește. `docs/USER-RESEARCH-2026-06-11.md`
conține persoane simulate, scrise de un model — o spune chiar documentul. Toată
analiza din spatele acestei specificații este dovadă despre produsele altora.
Niciuna nu e dovadă despre *acest* produs.

Cei zece utilizatori din §5 sunt singura linie din tot planul care produce o astfel
de dovadă. De asta rulează în paralel și nu la sfârșit.
