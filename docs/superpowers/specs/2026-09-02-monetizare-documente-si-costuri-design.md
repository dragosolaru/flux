# Monetizare — trei pachete, iar cel plătit nu depinde de Tesla

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

Structura de pachete de mai jos rezolvă asta altfel decât prin alegerea unei
direcții: **aliniază prețul cu costul marginal.** Fiecare tier costă exact atât
cât consumă, iar tierul care aduce banii nu consumă aproape nimic.

### Costurile care dictează structura

Tarifele Tesla, derivate din studiile de caz de pe pagina lor de facturare și
verificate pe toate cele trei totaluri publicate (`docs/SCALING-AND-COSTS.md`):
**$0,002 o citire, $0,001 o comandă, $0,02 o trezire, $10 credit lunar** per cont
de partener.

| Ce facem | Cost lunar / utilizator |
| --- | --- |
| Interogări în PostGIS-ul nostru (hartă, stații, rutare) | **~0** |
| OCR, ~20 de documente | **~$0,30** |
| O citire Tesla pe zi | **$0,06** |
| Dashboard live, poll la 30 s, o oră pe zi | **$7,20** |
| Plafonul de 200 citiri/zi | **$12,00** |

Un singur rând din tabel e periculos, și e cel al mașinii în timp real — adică
exact suprafața pe care analizele au găsit-o cel mai puțin apărabilă. Restul e
neglijabil.

---

## 1. OCR și procesare — corectitudine, funcționare, date

Prima secțiune pentru că e prima condiție, și cu atât mai mult acum: cu Pro
construit exclusiv pe documente, **pipeline-ul de OCR nu mai e o componentă a
produsului, este produsul.** Dacă extragerea greșește, nu avem nimic de vândut.

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
comise în repo: două facturi de energie de la furnizori diferiți, o bonificație
de la o stație publică, un RCA, un CASCO, un ITP, o rovinietă, o factură de
leasing, o factură de service, plus două cazuri urâte — un scan strâmb și o poză
făcută cu telefonul.

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

### 1.3 Odometrul din documente

Nou, și e ce salvează promisiunea originală fără nicio interogare Tesla.

Rulajul apare pe hârtii: ITP-ul îl consemnează, facturile de service aproape
întotdeauna. Azi nu îl extragem — nu există niciun câmp de rulaj în prompturi sau
în `ParsedDocument`.

Se adaugă: câmp în prompturile de documente auto, în schema Zod și în
`ParsedDocument`; stocare cu data documentului; și introducere manuală, pentru
lunile fără nicio hârtie. Două citiri de odometru la distanță în timp dau
kilometrii, iar kilometrii dau **cost/km și economia față de benzină** — cele două
cifre pe care le credeam pierdute odată cu deconectarea mașinii.

Ce **nu** dau: split casă/public și consum real. Alea rămân în Live.

### 1.4 Corectitudinea aritmeticii

Șapte defecte cunoscute. Structura de pachete le împarte, și patru pleacă din
drumul critic:

| Defect | Tier |
| --- | --- |
| Înțelesul unic al lui `energy_costs.cost_ron` | **Pro** (mai simplu fără atribuire) |
| Ziua pierdută la marginea perioadei (`.lte` la miezul nopții UTC) | **Pro** |
| Cipul de economie și cipurile de cost/km folosesc baze diferite | **Pro** |
| `costPerKmHome` împarte costul de acasă la kilometrii totali | **Pro** |
| `attribution.ts` citește `network IS NULL` ca „încărcat acasă" | **Live** |
| Ramura fără sesiuni atribuie mașinii toată factura casei | **Live** |
| Înmulțirea dublă cu fracția de atribuire | **Live** |

Prima rămâne prima: până nu se decide dacă `cost_ron` e costul total al facturii
sau partea atribuită mașinii, orice reparație e un petic peste aceeași
ambiguitate. Rândurile deja salvate au nevoie de migrație.

**Teste golden pe aritmetică.** O factură, un set de documente, un rezultat
așteptat, calculat de mână. Azi nu există niciunul.

### 1.5 Gestionarea datelor

O factură de utilități conține numele, adresa și codul de client. Un RCA conține
numărul de înmatriculare și adesea CNP-ul. Sunt date personale ale unui om din UE,
trimise către un model găzduit în Statele Unite.

Înainte ca un plătitor să încarce primul document:

- **DPA cu Anthropic** acceptat, și Anthropic listat ca sub-procesator în nota de
  confidențialitate, alături de Vercel, Supabase, Upstash, Stripe, Resend, Twilio
  și Hetzner.
- **Temeiul legal, scris.** Executarea contractului pentru serviciu.
- **O politică de retenție.** Azi fișierele rămân la nesfârșit. Ștergerea contului
  le șterge (`/api/user/delete` curăță și storage-ul), deci Art. 17 e acoperit
  mecanic. Propunerea: **cât timp contul e activ, plus 12 luni** — suficient cât
  să acopere un an fiscal după plecare, și scris în nota de confidențialitate.
  Implementat ca job de curățare, nu doar promis în text.
- **Ștergerea unui singur document** din interfață, nu doar a contului întreg.
- **Registrul de prelucrări (Art. 30)** — excepția sub 250 de angajați nu se
  aplică, prelucrarea fiind sistematică.
- **DPIA** — devine necesar doar odată cu Live, care introduce monitorizarea
  poziției vehiculului. Pro, fără date de locație, nu îl declanșează.

### 1.6 Cum știm că am reușit

- Corpusul golden trece, și niciun câmp nu e greșit cu încredere peste prag.
- Testele golden pe aritmetică trec, inclusiv pentru o lună fără niciun document.
- `/debug` arată rata de eșec OCR ca **procent din încărcări** — o cheie Anthropic
  moartă arată identic cu un teanc de facturi ilizibile până nu împarți.
- Nota de confidențialitate listează fiecare sub-procesator care chiar primește date.

---

## 2. Pachetele

### Free — „vezi unde încarci"

Hartă, planificator, stații, plus **3 documente pe lună, de orice tip** — un
singur contor, nu cele două de azi (5 energie + 10 auto). Un contor unic e mai
ușor de înțeles și de comunicat decât două plafoane care se epuizează separat.

Cost marginal **zero**: sunt interogări în PostGIS-ul nostru. Poate rămâne gratis
la nesfârșit, și e singurul canal de achiziție pe care îl avem.

### Pro — €4,99 — „toate costurile mașinii tale, din hârtiile tale"

Documente nelimitate, clasificare, termene cu memento (RCA, ITP, rovinietă, taxă),
total lunar și anual, defalcare pe categorii, mai multe valute cu curs BNR,
cost/km din odometrul citit de pe documente, economie față de benzină, export CSV.

**Zero interogări Tesla.** Cost marginal ~$0,30, marjă peste 90%.

Consecința strategică, și e cea mai importantă din tot documentul: **tierul care
aduce banii nu depinde de Tesla.** Fără cont de partener, fără facturare per
cerere, fără riscul ca limita de facturare să dezactiveze aplicația, fără
împerecherea cheii virtuale. Și **funcționează pentru orice marcă** — RCA, ITP și
rovinieta sunt ale oricui, nu doar ale celor ~12.000 de Tesla din România. Piața nu
mai e limitată la parcul Tesla.

### Live — €14,99 — „vezi și comanzi mașina"

Conectezi Tesla și costurile se completează singure: sesiuni de încărcare, split
casă/public, consum real. Plus dashboard în timp real, comenzi, notificări.

Plafon **200 citiri/zi**, adică **$12/lună** în cel mai rău caz. Prețul stă
deasupra plafonului **prin construcție**, nu prin speranță — „nelimitat" nu acoperă
niciodată costurile; un plafon plus un preț peste el, da.

**Poziție asumată:** pe Live concurăm frontal cu Tessie, la $6,99, cu 400.000 de
utilizatori, și **vom pierde comparația de preț.** Live nu există ca să câștige
piața. Există ca să-și acopere costul și ca cine chiar vrea liveness să-l poată
cumpăra fără să fie subvenționat din Pro.

### Upsell-ul

**Pro îți spune cât ai cheltuit dacă îi dai hârtiile. Live îi spune singur.**

## 3. Ce scoatem din texte

În toate cele cinci limbi, pentru că nu sunt adevărate — sau nu sunt adevărate în
tierul unde apar:

- **costul pe sesiune de încărcare** — nu poate fi produs la rezoluția la care
  citim mașina, nici în Live;
- **disponibilitatea în timp real a prizelor** — e derivată din simulator, nu
  dintr-un flux de operator;
- **preconditionarea către chargere non-Tesla** — nicio comandă din Fleet API nu o
  poate porni, iar Tesla o face singură din software 2025.2;
- **split casă/public și consum real** dispar din orice text care descrie Pro.

Regula din care decurg toate: *o afirmație care își supraviețuiește adevărului e
mai rea decât nicio afirmație.*

## 4. Ce blochează încasarea

Structura de pachete schimbă și asta: **Pro poate fi lansat fără să atingem
integrarea Tesla.**

**Pentru Free și Pro:**

1. **PFA** — 1–2 săptămâni, ~€100–200. Ca persoană fizică nu poți deschide Stripe
   live în România. Cea mai lungă așteptare, nu depinde de cod.
2. **Termeni + Politică de confidențialitate** — 1–2 zile.
3. **Vercel Pro + Supabase Pro** — +€40/lună. Vercel Hobby interzice explicit
   încasarea de bani.
4. DPA-uri click-through cu sub-procesorii — 2 ore.
5. **Bifa de renunțare la dreptul de retragere de 14 zile**, la checkout.
6. Chei Stripe live + configurarea taxelor.
7. **Cheia CARTO** — altfel fiecare hartă din Free are filigran `API KEY REQUIRED`.

**În plus, doar pentru Live:**

8. **Proxy-ul releu deschis (T10)** — o jumătate de zi. Nu conectăm mașina nimănui
   cât cheia noastră privată semnează pentru străini.
9. **Metodă de plată și limită de facturare la Tesla.** Limita pornește de la 0, iar
   o aplicație peste limită — sau fără card configurat — este **dezactivată**, nu
   încetinită. Singurul avertisment e un email la 80%.
10. URL-ul de confidențialitate în aplicația Tesla developer.
11. **DPIA**, pentru monitorizarea poziției vehiculului.

## 5. Ordinea

- **Azi:** se depune PFA-ul.
- **Săptămânile 1–2, cât se procesează:** corpusul golden și testele de extragere
  (§1.2); odometrul din documente (§1.3); înțelesul unic al lui `cost_ron` și cele
  patru reparații de Pro (§1.4).
- **Săptămâna 3:** gestionarea datelor (§1.5), Termeni și Politică, DPA-uri, cheia
  CARTO.
- **Săptămâna 4:** cele trei pachete în Stripe, granițele în `subscription.ts`,
  chei live. **Free și Pro sunt vandabile aici.**
- **După:** T10, limita de facturare Tesla, DPIA, cele trei reparații de atribuire
  — și abia atunci Live.
- **În paralel, tot timpul:** aplicația la zece proprietari, gratis. Nu întârzie
  nimic, pentru că oricum se așteaptă PFA-ul. Și acum pot fi proprietari de orice
  marcă, nu doar de Tesla.

Cifra de **~8–9 zile de lucru** se referă la secțiunea 1 — corpusul golden,
odometrul și cele patru reparații de Pro. Era ~14 înainte; patru dintre cele șapte
defecte de aritmetică au plecat pe Live. Peste ea vin legalul și împachetarea, care
sunt zile puține dar calendar mult, pentru că PFA-ul se așteaptă.

## 6. Ce nu e în această specificație

- Modul de lansare și marketingul — specificație separată.
- Fleet Telemetry. Ar rezolva rezoluția sesiunilor pentru Live, dar cere un
  receptor mTLS pe alt host și mutarea de pe Vercel, care **desperechează fiecare
  mașină deja conectată**. În plus, depășirea limitei de facturare Tesla **șterge
  definitiv configurațiile de streaming**, iar Tesla nu le restaurează. Rămâne
  poarta 3.
- Mașina de firmă și decontul. Analizate și respinse: în România se vând foi de
  parcurs conforme ANAF, cu hardware inclus, la €3,10–4,50 per vehicul.
- Suport pentru alte mărci în Free și Live. Pro funcționează deja pentru orice
  marcă pentru că nu atinge mașina; harta și comenzile sunt altă discuție.

## 7. Riscul pe care îl acceptăm conștient

Nimeni nu a fost întrebat dacă plătește. `docs/USER-RESEARCH-2026-06-11.md`
conține persoane simulate, scrise de un model — o spune chiar documentul. Toată
analiza din spatele acestei specificații este dovadă despre produsele altora: că
Tessie are 400.000 de utilizatori, că TeslaFi și-a crescut prețul fără să se
prăbușească, că EEVEE vinde reconcilierea la $9. Niciuna nu e dovadă despre *acest*
produs.

Cei zece utilizatori din §5 sunt singura linie din tot planul care produce o astfel
de dovadă. De asta rulează în paralel și nu la sfârșit.
