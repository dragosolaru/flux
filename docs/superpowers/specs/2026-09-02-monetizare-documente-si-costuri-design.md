# Monetizare — documentele și costurile ca produs

**Data:** 2026-09-02
**Stare:** design aprobat, neimplementat
**Înlocuiește:** poziționarea implicită din `src/components/product/PricingSection.tsx`
(€4,99/lună, €3,25/lună anual) și ordinea porților din `src/lib/roadmap.ts`

---

## Premisa

Cinci analize independente au ajuns la aceeași concluzie: **fiecare direcție în
care Flux ar putea fi vândut ca aplicație-companion pentru Tesla pierde.**
Planificatorul concurează cu cel gratuit din mașină, comenzile cu aplicația
gratuită Tesla, logarea cu TeslaMate care e gratis și open-source, iar
supravegherea cu Tessie, care are ~400.000 de utilizatori și e mai ieftin per
funcție. Notele au fost, pe rând: construit 7 / apărabil 2, construit 5 /
apărabil 3, construit 5 / apărabil 2, construit 1 / apărabil 2.

Un singur lucru nu are concurent: **factura ta de curent, reconciliată cu mașina
ta, în RON, cu documentele tale românești lângă.** Tessie, TeslaFi și Teslascope
sunt americane și în engleză; niciunul nu atinge RCA, CASCO, ITP sau rovinieta.
Aplicația Tesla știe kilowații, dar nu îți știe factura.

Deci acolo se vinde. Iar dacă acela e produsul, atunci **corectitudinea lui nu e
o caracteristică, e condiția de existență** — și de asta secțiunea despre OCR și
procesare stă înaintea celei despre preț.

---

## 1. OCR și procesare — corectitudine, funcționare, date

Prima secțiune pentru că e prima condiție. Vindem un număr; dacă numărul se
naște greșit, restul planului e o discuție despre cum să încasăm bani pentru o
greșeală.

### 1.1 Ce știm azi, și ce doar presupunem

**Ingestia e construită și e bună.** `src/lib/ai/document-parser.ts` — vedere
Claude, blocuri PDF și imagine, validare Zod, marcaje de încredere per câmp,
prag `needs_review` la 0,7. Trei canale de intrare: încărcare directă, email
Cloudmailin cu adresare `+shortid` per mașină, WhatsApp prin Twilio cu validare
HMAC. Conversie valutară BNR cu rezervă de weekend. Prompturi românești care
cunosc RCA, CASCO, ITP, rovinieta, taxa auto și leasingul.

**Dar nimic din toate astea nu e verificat.** Nu există `src/lib/ai/__tests__/`.
Singurul test din zona costurilor este `src/lib/costs/__tests__/confidence.test.ts`,
care testează scorul de încredere — nu extragerea, nu schemele, nu maparea către
`ParsedDocument`, nu aritmetica. Trei commituri au atins vreodată `src/lib/costs`.

Asta înseamnă că afirmația „OCR-ul merge" se sprijină pe faptul că a mers pe
documentele proprii ale autorului. Este o presupunere, nu un fapt măsurat, și
este prima care trebuie transformată în fapt.

**Aritmetica are șapte defecte cunoscute.** C1–C5 din `docs/OPERATIONS.md` §6,
plus două găsite azi:

- Sesiunile derivate nu au `network`, iar `attribution.ts` citește
  `network IS NULL` ca „încărcat acasă" — deci o sesiune la Supercharger umflă
  partea din factura casei atribuită mașinii.
- `costs-client.tsx` calculează cipul de economie față de benzină din costul
  neatribuit, în timp ce cipurile de cost/km folosesc costul atribuit. Două
  cifre pe același ecran nu sunt de acord ce a costat mașina.

Și o consecință structurală care le înghite pe toate: derivarea cere două
instantanee consecutive cu încărcare pornită ca să emită o sesiune, iar cron-ul
rulează o dată pe zi. Pentru o mașină reală, `sessionCount` este în practică
zero — iar ramura „nicio sesiune" atribuie mașinii **toată factura casei**.

### 1.2 Corectitudinea extragerii

**Un corpus golden.** Zece până la cincisprezece documente reale, anonimizate,
comise în repo: două facturi Enel, două Hidroelectrica, o bonificație de la o
stație publică, un RCA, un CASCO, un ITP, o rovinietă, o factură de leasing,
plus două cazuri urâte — un scan strâmb și o poză făcută cu telefonul în mașină.
Pentru fiecare, rezultatul așteptat, scris de mână.

Testul rulează parserul peste corpus și compară câmp cu câmp. Nu cere potrivire
perfectă — cere ca fiecare câmp care contează (`cost_total`, `total_kwh`,
`period_start`, `period_end`, `valid_until`) să fie ori corect, ori marcat
`needs_review`. **Un câmp greșit cu încredere mare este singurul rezultat
inacceptabil**, pentru că e singurul pe care utilizatorul nu-l verifică.

Apelul către Claude se înregistrează o dată și se refolosește, ca testele să
ruleze fără rețea și fără cost.

**Ce mai testăm:** schemele Zod resping ce trebuie respins; `.catch(0)` de pe
marcajele de încredere nu transformă în tăcere un răspuns stricat într-unul cu
încredere zero care trece mai departe; maparea document-mașină nu pierde câmpuri;
fiecare cod de eroare de la Anthropic ajunge la un mesaj pe care un om îl
înțelege.

**Fluxul de revizuire.** Azi există pragul, dar nu și ecranul care îl folosește
cum trebuie. Un document sub prag trebuie să ceară confirmarea sumei înainte să
intre în calcule, nu după.

### 1.3 Corectitudinea aritmeticii

În ordine, și prima decide restul:

1. **Un singur înțeles pentru `energy_costs.cost_ron`.** Este costul total al
   facturii, sau partea atribuită mașinii? Azi codul crede ambele lucruri în
   locuri diferite, și de acolo vine înmulțirea dublă. Se decide, se scrie în
   comentariul coloanei și în migrație, apoi se repară restul. Rândurile deja
   salvate au nevoie de migrație.
2. **Split casă/public prin geofence** față de `profiles.home_lat`/`home_lng`,
   scris în `is_home_charge` la derivare, cu backfill. Închide și defectul de
   azi. Rază propusă: 150 m.
3. **Ramura fără sesiuni nu mai atribuie toată factura.** Când nu avem date,
   întrebăm utilizatorul ce parte e a mașinii, sau nu raportăm nimic — dar nu
   presupunem tot.
4. Înmulțirea dublă cu fracția de atribuire; ziua pierdută la marginea perioadei
   (`.lte` la miezul nopții UTC); cele două cipuri care nu sunt de acord;
   `costPerKmHome`, care împarte costul de acasă la kilometrii totali.
5. **Teste golden pe aritmetică.** O factură, un set de sesiuni, un rezultat
   așteptat, calculat de mână. Azi nu există niciunul.

### 1.4 Gestionarea datelor

O factură de utilități conține numele, adresa și codul de client al abonatului.
Un RCA conține numărul de înmatriculare și adesea CNP-ul. Astea sunt date
personale, ale unui om din UE, iar noi le trimitem la un model găzduit în
Statele Unite.

Ce trebuie să fie adevărat înainte ca un plătitor să încarce primul document:

- **DPA cu Anthropic** acceptat, și Anthropic listat ca sub-procesator în nota
  de confidențialitate, alături de Vercel, Supabase, Upstash, Stripe, Resend,
  Twilio și Hetzner.
- **Temeiul legal, scris.** Executarea contractului pentru serviciu; pentru
  locație, consimțământul este citirea mai sigură.
- **O politică de retenție.** Azi fișierele încărcate rămân la nesfârșit.
  Ștergerea contului le șterge (`/api/user/delete` curăță și storage-ul), deci
  Art. 17 e acoperit mecanic — dar „păstrăm cât ești client, plus X luni"
  trebuie decis și implementat, nu doar promis.
- **Ștergerea unui singur document** din interfață, nu doar a întregului cont.
- **Registrul de prelucrări (Art. 30)** — excepția sub 250 de angajați nu se
  aplică, pentru că prelucrarea e sistematică și include locație.
- **DPIA scurt (Art. 35)** — monitorizarea sistematică a poziției unui vehicul
  este pe listele obligatorii ale majorității autorităților. La scara asta, două
  pagini sunt proporționale.

### 1.5 Cum știm că am reușit

- Corpusul golden trece, iar niciun câmp nu e greșit cu încredere peste prag.
- Testele golden pe aritmetică trec, inclusiv pentru o lună fără nicio sesiune.
- `/debug` arată rata de eșec OCR ca **procent din încărcări** — o cheie
  Anthropic moartă arată identic cu un teanc de facturi ilizibile până nu împarți.
- Nota de confidențialitate listează fiecare sub-procesator care chiar primește
  date.

---

## 2. Ce vindem

**„Știi exact cât te costă mașina, lună de lună."**

Documentele și costurile sunt produsul. Mașina — comenzi, hartă, planificator,
stații — rămâne în Pro, dar în plan secund: e ce face produsul plăcut, nu ce îl
face cumpărat. Nu apare în titlu și nu apare în primul paragraf al paginii de
preț.

Consecința asupra a ceea ce construim în continuare: dacă o săptămână de muncă
poate merge ori la acuratețea costurilor, ori la o funcție de mașină,
**merge la costuri**, până când secțiunea 1 e închisă.

## 3. Granița free / Pro

Limita care contează nu e o funcție, ci **bugetul de citiri**, pentru că acolo
se duc banii către Tesla.

| | Free | Pro |
| --- | --- | --- |
| Mașini | 1 reală + 3 demo | nelimitat |
| Citiri automate / zi | **~30** | 200 |
| Comenzi | da, limitate | da |
| Hartă, planificator, stații | da | da |
| Documente / lună | 3 | nelimitat |
| Costuri | doar luna curentă | istoric complet, split casă/public, cost/km, economie |
| Export CSV | nu | da |

Tăierea bugetului de citiri pe free e schimbarea care face restul posibil: fără
ea, un utilizator gratuit care ține dashboardul deschis costă mai mult decât
aduce un abonat. `DAILY_READ_BUDGET` din `src/lib/tesla/budget.ts` a fost ales
împotriva limitei de rată a Tesla, niciodată împotriva facturii ei.

Documentele rămân limitate pe free pentru că fiecare costă un apel OCR real.

## 4. Prețul

**€6,99/lună. €69/an** (≈ €5,75/lună).

Planul anual actual, €3,25/lună, este **sub costul variabil al unui utilizator
tipic** și nu devine rentabil la niciun număr de utilizatori. Se retrage.

La €4,99, cu un utilizator tipic estimat la ~41 de citiri/zi, pragul de
rentabilitate era pe la ~45 de abonați și marja se oprea pe la ~22%. La €6,99
pragul vine mai devreme și marja se așază pe la ~40–45% peste o sută de abonați.
Marja nu crește mult mai mult niciodată: taxa Tesla per citire e un cost liniar
pe care scara nu îl diluează.

**Condiție înainte de a fixa cifra:** toată aritmetica de mai sus stă pe o
estimare a consumului. Numărul real există deja, în contoarele `teslaCalls` din
Redis, vizibile în `/debug`. Se citește întâi. Dacă utilizarea reală e sub
estimare, €4,99 redevine apărabil și rămâne acolo — decizia se ia pe cifra
măsurată, nu pe cea presupusă.

## 5. Ce scoatem din texte

În toate cele cinci limbi, pentru că nu sunt adevărate:

- **costul pe sesiune de încărcare** — nu poate fi produs la rezoluția la care
  citim mașina, și am ales explicit acuratețea lunară în locul lui;
- **disponibilitatea în timp real a prizelor** — e derivată din simulator, nu
  dintr-un flux de operator;
- **preconditionarea către chargere non-Tesla** — nicio comandă din Fleet API nu
  o poate porni, iar Tesla o face singură din software 2025.2.

Regula din care decurg toate trei: *o afirmație care își supraviețuiește
adevărului e mai rea decât nicio afirmație.*

## 6. Ce blochează încasarea

Nu e scopul acestei specificații, dar o condiționează. Ordonat după timpul de
așteptare:

1. **PFA** — 1–2 săptămâni, ~€100–200. Ca persoană fizică nu poți deschide Stripe
   live în România. Are cea mai lungă așteptare și nu depinde de cod.
2. **Proxy-ul releu deschis** (T10) — o jumătate de zi. Nu iei bani cât cheia ta
   privată răspunde străinilor.
3. **Termeni + Politică de confidențialitate** — 1–2 zile. Blochează și Stripe,
   și termenii de partener Tesla.
4. URL-ul de confidențialitate în aplicația Tesla developer — 10 minute.
5. **Vercel Pro + Supabase Pro** — +€40/lună. Vercel Hobby interzice explicit
   încasarea de bani.
6. DPA-uri click-through cu cei opt sub-procesori — 2 ore.
7. **Bifa de renunțare la dreptul de retragere de 14 zile**, la checkout.
8. Chei Stripe live + configurarea taxelor.

## 7. Ordinea

- **Azi:** se depune PFA-ul. Are cea mai lungă așteptare și nu depinde de nimic.
- **Săptămânile 1–2, cât se procesează:** corpusul golden și testele de
  extragere (§1.2); înțelesul unic al lui `cost_ron` și reparațiile de
  aritmetică (§1.3); se citește consumul real din `/debug`.
- **Săptămâna 3:** gestionarea datelor (§1.4), Termeni și Politică, DPA-uri.
- **Săptămâna 4:** granița free/Pro, prețul pe cifra măsurată, Stripe live.
- **În paralel, tot timpul:** aplicația la zece proprietari români de Tesla,
  gratis. Nu întârzie nimic, pentru că oricum se așteaptă PFA-ul.

## 8. Ce nu e în această specificație

- Modul de lansare și marketingul — specificație separată.
- Fleet Telemetry. Ar rezolva rezoluția sesiunilor, dar cere un receptor mTLS pe
  alt host și mutarea de pe Vercel, care **desperechează fiecare mașină deja
  conectată**. Rămâne poarta 3.
- Mașina de firmă și decontul. Analizate și respinse: în România se vând foi de
  parcurs conforme ANAF, cu hardware inclus, la €3,10–4,50 per vehicul.
- Orice funcție nouă de mașină până când secțiunea 1 e închisă.

## 9. Riscul pe care îl acceptăm conștient

Nimeni nu a fost întrebat dacă plătește. `docs/USER-RESEARCH-2026-06-11.md`
conține persoane simulate, scrise de un model — o spune chiar documentul.
Întreaga analiză din spatele acestei specificații este dovadă despre produsele
altora: că Tessie are 400.000 de utilizatori, că TeslaFi și-a crescut prețul
fără să se prăbușească, că EEVEE vinde reconcilierea la $9. Niciuna nu e dovadă
despre *acest* produs.

Cei zece utilizatori din §7 sunt singura linie din tot planul care produce o
astfel de dovadă. De asta rulează în paralel și nu la sfârșit.
