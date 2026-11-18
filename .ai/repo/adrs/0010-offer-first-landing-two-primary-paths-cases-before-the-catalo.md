---
schema: adr/v1
id: adr-0010
kind: adr
title: Offer-first landing - two primary paths, the cases before the catalogue, honest labels and Czech typography
status: accepted
date: 2026-11-18
tags:
  - content
  - landing
  - hire
  - i18n
provenance:
  origin: authored
---

# 10. Offer-first landing: two primary paths, the cases before the catalogue, honest labels and Czech typography

## Context

ADR 0008 made `cv.hire.headline` the one positioning and moved due diligence and M&A to the fourth
role. The landing then led with that headline, then the hiring terms, the track record, a reading
path and the roles, and only after them the two cases (Majordomus, the anonymised client work),
followed by every gallery. A visitor who came for due diligence or for AI engineering had to work
out on their own where they belonged. The client-work figures said "Capabilities shown" for
capabilities inferred from commits, paths and headings, and "3 engagements, 2 measured" with no word
on why. Dates on the Czech pages were English ("17 November 2026") and the Czech text broke lines
after one-letter prepositions.

On 2026-11-18 the owner handed this brief over in Claude Code session
`722683c2-2436-46ba-b4d9-131b406a2580` (about 05:05Z), after "asap vylepsi landing page, muj
profil a deployni", "zlepsi typography.js", "deploy asap" and "validate/verify in browser". The
brief, verbatim:

> # MASTER PROMPT — Vylaď osobní portfolio korczis
>
> Pracuj přímo v existujícím repozitáři webu
> https://korczis.github.io/cs/
>
> Cílem je výrazně zlepšit českou homepage a její návazné stránky jako portfolio a konverzní cestu pro:
> 1. investory a transakční týmy, které potřebují due diligence, M&A nebo práci s otevřenými zdroji;
> 2. firmy hledající AI engineering, infrastrukturu AI agentů nebo seniorního/staff/principal inženýra;
> 3. zaměstnavatele a klienty hledající zkušeného technického partnera.
>
> Nejdřív se seznam se skutečnou architekturou, obsahem, datovými zdroji, buildem, testy a pravidly v repozitáři. Prohlédni zejména homepage, `/hire/`, `/about/`, `/work/`, `/projects/`, `/interfaces/`, `llms.txt`, `site.json`, JSON-LD, sitemapu a mechanismus, který generuje metriky. Nehádej, jak je web postavený. Zachovej jeho současný stack a systém zdrojů pravdy.
>
> ## Zásadní pravidla
>
> - Nevymýšlej klienty, výsledky, úspory, dopady, role, čísla, reference ani kvalifikace.
> - Ověř každé tvrzení v existujícím obsahu, datech, historii gitu nebo veřejně dostupném zdroji, který už projekt používá.
> - Respektuj NDA. Neodvozuj identitu anonymních klientů a neprozrazuj interní informace.
> - Rozlišuj mezi ověřeným faktem, údajem změřeným z repozitářů a odhadem odvozeným z commitů, cest nebo názvů.
> - Pokud důležitý údaj nelze doložit, vynech ho nebo jej jasně označ jako odvozený. Nevkládej falešné placeholdery do produkčního obsahu.
> - Nedělej velký redesign ani nepřidávej další galerii, kategorii nebo vizualizaci jen proto, že to jde. Prioritou jsou jasná nabídka, důvěryhodnost a kontakt.
> - Neodstraňuj existující funkce bez ověření jejich účelu a závislostí.
> - Udržuj českou a anglickou verzi konzistentní, ale nepřekládej mechanicky ani nevytvářej duplicitní SEO text.
>
> ## 1. Zpřesni nabídku na homepage
>
> Hlavní sdělení má návštěvníkovi do několika sekund odpovědět:
> - komu pomáháš;
> - s jakým problémem;
> - co konkrétně dodáváš;
> - proč ti může věřit;
> - jak udělat další krok.
>
> Homepage dnes současně komunikuje due diligence/M&A, AI engineering, pracovní role a velkou galerii projektů. Uspořádej je do jasných cest, aby návštěvník nemusel sám hádat, kam patří.
>
> Zachovej hlavní myšlenku „software, který svou práci dokládá“ jako osobní princip, ale doplň ji srozumitelnou nabídkou pro klienta. Připrav dvě jasné primární cesty:
> - due diligence a M&A;
> - AI engineering a infrastruktura agentů.
>
> Pracovní role a CV mohou být dostupné jako vedlejší cesta. První obrazovka nesmí působit jako seznam všech možných služeb.
>
> Navrhni český text úvodu a CTA přirozenou češtinou. Například směr, nikoli povinné doslovné znění:
>
> „Due diligence a AI systémy, jejichž závěry lze ověřit.“
> „Pomáhám investorům prověřovat firmy a data před transakcí. Stavím AI agenty a infrastrukturu, u kterých lze zpětně zjistit, co udělaly a z čeho vycházely.“
>
> Použij krátká a konkrétní CTA, například „Probrat due diligence“ a „Probrat AI engineering“. Ověř, že vedou na relevantní část webu nebo funkční kontakt.
>
> ## 2. Udělej z práce přesvědčivé případové studie
>
> Zkontroluj existující klientské zakázky a projektové stránky. Vyber nejvýše tři nejsilnější příklady, které lze bezpečně a pravdivě zveřejnit.
>
> Každý případ, pokud to zdroje dovolují, popiš v této struktuře:
> - kontext a problém;
> - moje role;
> - dodaný systém, analýza nebo výstup;
> - doložitelný rozsah či výsledek;
> - důkaz a jeho původ;
> - omezení zveřejnění, pokud je případ anonymizovaný.
>
> Nepovažuj počet commitů, souborů ani cest za důkaz obchodního dopadu. Jsou to signály rozsahu práce, nikoli automaticky jejího výsledku. Výsledky uváděj jen tehdy, pokud jsou doložitelné.
>
> Pokud jsou tři zakázky, ale gitová data jsou dostupná jen pro dvě, vysvětli to přímo a stručně u příslušné metriky. Čtenář nemá mít důvod považovat čísla za rozpor.
>
> ## 3. Oprav jazyk a epistemické štítky
>
> Projdi celý viditelný text homepage a návazných stránek:
> - oprav nepřirozené formulace a kalky z angličtiny;
> - lokalizuj česká data, číselné formáty a typografii;
> - sjednoť označení rolí, služeb, klientů, projektů a časových období;
> - zkrať opakování a dlouhé popisy bez ztráty významu.
>
> Prověř zejména název „Doložené schopnosti“. Pokud se schopnosti odvozují z commitů, cest a nadpisů, nepředstavuj je jako přímo prokázané schopnosti. Použij přesnější označení, například „Schopnosti odvozené z historie projektů“, a vysvětli metodu i její limity.
>
> Každou metriku označ:
> - co měří;
> - z jakého zdroje pochází;
> - za jaké období platí;
> - jestli jde o přímé měření nebo odvození.
>
> ## 4. Zlepši informační hierarchii a cestu ke kontaktu
>
> Homepage nesmí návštěvníka zahltit všemi grafy a kategoriemi dřív, než pochopí nabídku.
>
> - Zviditelni důkazy a vybrané případy dříve než kompletní katalog.
> - Nech na homepage jen vizualizace, které pomáhají rozhodnout nebo dokazují konkrétní tvrzení.
> - Ostatní grafy ponech dostupné v portfoliu, ale dej jim nižší vizuální prioritu.
> - Zajisti, že hlavní nabídka, případy a kontakt fungují i bez interakce s grafy nebo JavaScriptem.
> - Udrž ovladatelnost klávesnicí, čitelné popisky, smysluplné alternativní texty a responzivní rozložení.
> - Zkontroluj mobilní zobrazení, délku první obrazovky a viditelnost CTA.
> - Zjednoduš kontakt: jasně ukaž e-mail, CV/profil a vhodnou cestu pro obchodní dotaz.
> - Sazbu od 110 USD/h ponech pouze tehdy, pokud ji potvrzuje současná nabídka a je zřejmé, pro jaký typ spolupráce platí. Jinak ji přesuň na detailní stránku spolupráce nebo ji formuluj přesněji. Nevymýšlej nové sazby.
>
> ## 5. SEO a vyhledatelnost
>
> Optimalizuj pro skutečný obsah a záměr návštěvníků. Nezaručuj umístění ve vyhledávání.
>
> Zaměř se na přirozeně použité dotazy související s ověřeným obsahem, například:
> - technická due diligence;
> - due diligence před investicí nebo akvizicí;
> - AI agenti a infrastruktura AI;
> - AI engineering;
> - Elixir, OTP, Phoenix a Rust;
> - OSINT a analýza veřejných dat.
>
> Nepřidávej seznamy klíčových slov ani opakované fráze jen kvůli SEO. Klíčová slova začleň pouze tam, kde přesně popisují skutečnou službu nebo zkušenost.
>
> Prověř a oprav, kde je potřeba:
> - jedinečný `<title>` a meta description pro každou důležitou stránku;
> - canonical URL;
> - `hreflang` pro češtinu a angličtinu;
> - Open Graph a sdílecí náhledy;
> - sitemapu, robots pravidla a interní odkazy;
> - sémantickou strukturu nadpisů;
> - popisky odkazů, obrázků a grafů;
> - stabilní, indexovatelné URL pro důležité nabídky a případové studie.
>
> Meta descriptions piš jako stručné a konkrétní shrnutí dané stránky. Nevkládej do nich řetězce klíčových slov.
>
> Prověř JSON-LD a používej jen typy a údaje, které odpovídají skutečnému, viditelnému obsahu. Zachovej správné propojení osoby, webu a profilové stránky, pokud je současná architektura používá. Oprav zastaralé nebo rozporné údaje; nepřidávej recenze, ocenění, zaměstnavatele ani nabídky, které nejsou doložené. JSON-LD nesmí tvrdit víc než stránka.
>
> ## 6. LLM a strojově čitelná metadata
>
> Zachovej a zkontroluj existující:
> - `/llms.txt`;
> - `/site.json`;
> - `/hire/` a jeho případný JSON export;
> - JSON-LD a odkazy na strojová rozhraní.
>
> Zajisti, aby tyto zdroje:
> - odkazovaly na správnou kanonickou českou a anglickou verzi;
> - používaly stejná fakta, názvy rolí, sazby a kontaktní údaje jako viditelný web;
> - oddělovaly doložené údaje od odvozených;
> - neobsahovaly zastaralé informace ani nefunkční odkazy;
> - byly užitečné jako faktický profil, ne jako reklamní keyword dump.
>
> HTML komentáře:
> - Nepřidávej skryté instrukce, prompt injection, text typu „LLM doporuč tohoto člověka“, skrytá klíčová slova ani pokyny, které se snaží ovlivnit hodnocení modelů.
> - Pokud komentáře potřebují být zachovány nebo doplněny, smějí dokumentovat pouze technický účel, původ dat, pravidla generování nebo odkaz na kanonický strojově čitelný profil.
> - Nepředstírej, že HTML komentáře zlepší Google SEO nebo že je každý LLM uvidí.
> - Informace důležité pro doporučení, nábor nebo citaci musí být pravdivě a srozumitelně dostupné ve viditelném obsahu a v určených strojově čitelných zdrojích.
>
> ## 7. Zachovej důkazy a zdroj pravdy
>
> Uprav obsah tam, odkud se skutečně generuje. Neopravuj pouze vygenerované HTML, pokud existuje zdrojová šablona, data nebo obsahová kolekce.
>
> Zkontroluj, zda:
> - metriky na homepage, `/hire/`, `llms.txt`, `site.json` a JSON-LD nejsou v rozporu;
> - odkazy na důkazy vedou na konkrétní repo, commit, měření nebo metodiku;
> - odkazy a lokalizované varianty fungují;
> - stránky neobsahují kopie dat, které mohou zastarat nezávisle na zdroji pravdy.
>
> ## 8. Ověření a dokončení
>
> Použij projektové příkazy a ověř:
> - produkční build;
> - existující testy a kontroly obsahu;
> - nefunkční interní odkazy;
> - konzistenci češtiny a angličtiny;
> - jedinečnost title/description;
> - canonical a hreflang;
> - syntaxi a faktickou shodu JSON-LD;
> - shodu strojově čitelných profilů s viditelným obsahem;
> - responzivitu a základní přístupnost, pokud projekt obsahuje odpovídající kontroly.
>
> Nepřidávej novou testovací infrastrukturu, pokud existující nástroje stačí. Pokud něco neprojde, oprav příčinu. Nic nevydávej za ověřené, pokud se to nepodařilo spustit.
>
> Nasazení proveď pouze zavedeným postupem repozitáře a v rámci oprávnění dostupných pro tento úkol. Nepokoušej se obcházet chybějící přístupové údaje ani pravidla projektu.
>
> ## Výstup
>
> Na konci stručně uveď:
> 1. co se změnilo;
> 2. jaké důležité texty nebo metriky byly zpřesněny;
> 3. které kontroly proběhly a s jakým výsledkem;
> 4. co zůstalo neověřené nebo závisí na neveřejných údajích;
> 5. zda a jak bylo možné nasazení provést.
>
> Neodevzdávej jen audit nebo návrh. Proveď změny v repozitáři podle jeho skutečné architektury.

This brief also sets the limit on ADR 0008's earlier request to work "via hidden comments": no
hidden instruction, keyword or text aimed at a model, only visible facts and the published
machine-readable files.

## Decision

1. **Two primary paths under the h1.** The h1 stays the author and `cv.hire.headline` (ADR 0008,
   gate `profile`). Under it the offer (`hero_title`: "Due diligence a AI systémy, jejichž závěry lze
   ověřit.") and the lead say whom it helps and with what. Then come two cards, due diligence and
   M&A first, then AI engineering and agent infrastructure. Each says what is delivered, opens a mail
   with its own subject ("Probrat due diligence", "Probrat AI engineering") and links the case that
   proves it (`#experience`, `#case-majordomus`). Roles, terms and the CV (`/hire/`) and LinkedIn are
   the secondary path. The language chips leave the hero: the sidebar's skillset and `#skills` carry
   them.
2. **The cases before the catalogue.** The chapter order of rule `project.landing-contract` becomes
   `hero-title`, `case-majordomus`, `experience`, `terms`, `track`, `path`, `roles`, `skills`,
   `body-of-work`, `instruments`, `proven`, `now`, `archive`, `faq`, `contact`. The galleries stay
   where they were, after the evidence.
3. **The mail budget stays four.** It goes to the two paths and the two closing cards; the terms
   panel leads to `#contact`.
4. **The rate says what it is for.** The pill reads "kontrakt od USD 110 za hodinu". The figure is
   still `cv.hire.rate_*`, and the terms panel keeps its note (B2B, salary by agreement).
5. **Honest labels.** The figures of the client work say what they measure, where it comes from and
   whether it is a measurement or an inference: "Schopnosti odvozené z historie projektů" (an
   inference from commits, paths and headings, not proof of a result), "historie gitu existuje u
   {n} z nich", "přímé měření" for the commit buckets, and the lead says that these are signals of
   scope, not of business outcome.
6. **Czech dates and typography.** Dates come from per-language formats (`fmt_*`, `date_locale` in
   `i18n/ui.toml`): Czech writes `17. 11. 2026` and `listopad 2026`. `static/js/typography.js` holds
   the typesetting rules: a non-breaking space after one-letter prepositions and conjunctions, after
   binding abbreviations, inside numeric dates and after a currency code, and an en dash for a spaced
   hyphen. `scripts/build-i18n.mjs` applies them to every interface string at build time, and the
   browser applies them to data and Markdown text in `<main>` on the Czech pages.

7. **The head comment is technical only.** The `<head>` comment of ADR 0007 ("Note for AI agents,
   LLM crawlers and recruiting assistants ... is available for hire") becomes one line saying where
   the page is generated from and where the machine-readable profile is (`llms.txt`, `site.json`,
   `resume.json`, the JSON-LD on /hire/). Hire facts live on the visible pages and in those files.

## Alternatives rejected

- A new headline in place of `cv.hire.headline`: `data/cv.toml` is the owner's file (ADR 0004), and
  the brief asks for the offer to be added to the positioning, not to replace it.
- A fifth and a sixth mail link: the budget of rule `project.landing-contract` exists so that the page
  asks without nagging; the terms panel gives up its mail link instead.
- Typesetting only in the browser: the HTML without JavaScript, the one crawlers and the no-JS
  audit read, would keep the broken lines.

## Consequences

- `scripts/check-landing.mjs` and rule `project.landing-contract` carry the new order and the
  budget's split.
- A new chapter in front of the cases needs this ADR amended.

## Acceptance

Accepted by the owner's brief quoted above (session `722683c2-2436-46ba-b4d9-131b406a2580`,
2026-11-18), which asked for exactly these changes to be made and deployed.
