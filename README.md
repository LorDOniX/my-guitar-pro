# My Guitar Pro

Lokální čtečka a přehrávač Guitar Pro souborů. Vite + TypeScript, bez UI frameworku a bez backendu.

## Spuštění

Vyžaduje Node.js 22.12+ (nebo novější podporovanou LTS verzi).

```sh
npm install
npm run dev
```

Otevři adresu vypsanou Vite v terminálu, obvykle http://127.0.0.1:5173.

```sh
npm run typecheck  # kontrola TypeScriptu
npm run build      # kontrola typů a produkční sestavení do dist/
npm run preview    # lokální náhled produkčního sestavení
```

## První verze

- Otevření jednoho souboru tlačítkem nebo přetažením do okna.
- Formáty `.gp3`, `.gp4`, `.gp5`, `.gpx`, `.gp` přes [alphaTab](https://alphatab.net/docs/introduction/).
- Zobrazení tabulatury, výběr zobrazené stopy a kurzor přehrávání.
- Přehrát / pozastavit / zastavit, čas a rychlost 50–150 %.
- Mezerník v tabulatuře přepíná přehrávání a pauzu. Oblast aktivuješ kliknutím nebo klávesou Tab; podržení mezerníku přehrávání opakovaně nepřepíná.
- Vestavěná ukázka: vlastní čtyřtaktový riff v `public/examples/prvni-riff.gp`.
- Chybové zprávy pro neplatné a prázdné soubory.

Soubory se zpracovávají pouze v prohlížeči a po obnovení stránky se neuchovávají. Výběr stopy mění zobrazenou tabulaturu; přehrává se doprovod všech stop. Zvuk je syntetizovaný přes SoundFont, nejde o původní Guitar Pro RSE zvuk. Některé pokročilé efekty se mohou od Guitar Pro lišit.

## Synchronizace videa podle tabulatury

**Zdrojem času je vždy tabulatura.** Přehrávání od začátku spustí TAB na 0:00; video se řídí její pozicí. Kliknutí na tón, pauza, stop a tempo se ovládají přes tabulaturu, včetně mezerníku. Video nikdy neposouvá kurzor TAB a jeho čekání, buffering, chyba nebo konec nezastavují tabulaturu.

Platí `čas videa = čas TAB + offset` (čas TAB je hudební čas skladby, nezávislý na rychlosti přehrávání).

- **−2 s:** TAB běží od 0:00; video stojí na nule a začne od začátku při TAB 0:02.
- **−3,5 s:** celé intro TAB se přehraje; video začne při TAB 0:03,5.
- **+2 s:** při TAB 0:00 začne video na 0:02.
- Pauza pozastaví obě přehrávání. Stop vrátí TAB na nulu a video na pozici podle offsetu, pozastavené.
- Kliknutí na tón posune video podle času tónu; pokud video ještě nemá začít, zůstane na nule.
- Změna tempa mění rychlost obou přehrávačů; offset zůstává v sekundách skladby.

Otevři GP soubor a zvol lokální video tlačítkem **Načíst video ze souboru**, nebo **Použít Killing In The Name z repozitáře**. Vlastní soubor se otevře přes blob URL bez odesílání na server. Přidaný MP4 se zahrne i do produkčního sestavení (přibližně 29 MB). Alternativně zadej YouTube URL a klikni na **Načíst video a použít jeho zvuk**; parametry playlistu se ignorují. V režimu videa je syntetický zvuk TAB ztlumený. Zpět jej zapneš volbou **Zvuk tabulatury**.

Video se průběžně srovnává s TAB, včetně opravy výraznějšího rozcházení času. Ovládání přímo na videu nemění TAB: přehrávač se vrátí k času a tempu tabulatury. Při blokovaném autoplay TAB pokračuje; přehrávání videa lze zkusit znovu přes ovládání TAB. Dostupné rychlosti YouTube určuje konkrétní video. Lokální kodek musí podporovat prohlížeč.

Offset můžeš napsat s tečkou nebo čárkou (např. `-3.5`), případně ladit o ±0,1 s. Tlačítko zarovnání nastaví offset mezi aktuálním časem videa a TAB. JSON v textarea se aktualizuje při změnách; zkopíruj jej pro příště. Při obnovení otevři stejný GP soubor, vlož JSON a klikni **Použít vložené nastavení**. Nastavení se automaticky neukládá. Vlastní video musíš znovu vybrat; video z repozitáře se načte automaticky.

Nový JSON používá `version: 4` a `source: "local"` s `mediaFile`, nebo `source: "youtube"` s `videoId`. Starší verze 1 a 2 zachovají číselný offset; verze 3 se převede s opačným znaménkem, aby zachovala časové zarovnání.

Výchozí YouTube video `bWXazVhlyxQ` při ověření vrátilo zákaz vložení (101/150). Pro něj můžeš použít přidaný MP4. Výchozí nahrávka je původní RATM, testovací GP5 je Leo Moracchioli cover; jediný offset neřeší odlišné tempo či aranž. Nastavení více synchronizačních bodů zatím není součástí aplikace.

`npm test` ověřuje převod času, čekání videa, pauzu, posuny zpět, stop, změnu rychlosti, opravu driftu, odmítnuté přehrávání a migraci JSON. Zahrnuje import testovacího GP5 v kořeni repozitáře. alphaTab používá vlastní syntezátor jako nezávislé hodiny; v režimu videa má nulovou hlasitost. Video je pouze následovník těchto hodin.

## Struktura

- `src/main.ts` — načítání souborů, alphaTab a obsluha UI.
- `src/style.css` — responzivní vzhled a kurzory přehrávání.
- `index.html` — přístupná HTML kostra v češtině.
- `vite.config.ts` — oficiální alphaTab plugin pro workers a audio worklet.
- `scripts/create-example.mjs` — znovuvytvoření vlastní ukázky: `node scripts/create-example.mjs`.

Plugin kopíruje font Bravura a SoundFont do `public/font/` a `public/soundfont/` při spuštění nebo sestavení. Tyto generované složky nejsou verzované; produkční `dist/` je obsahuje, včetně jejich licencí. Dokumentace: [Vite integrace](https://alphatab.net/docs/getting-started/installation-vite/), [přehrávač](https://alphatab.net/docs/tutorial-web/player/). alphaTab je pod licencí MPL-2.0.

UI používá Google Fonts s lokálními systémovými fallbacky. Žádný obsah otevřeného souboru se do Google Fonts neposílá.

## Ruční kontrola

1. Klikni na ukázkový riff nebo otevři `public/examples/prvni-riff.gp` přes výběr souboru.
2. Počkej na vykreslení a načtení zvuků, spusť přehrávání; ověř kurzor a ubíhající čas.
3. Ověř pauzu, pokračování, stop a změnu tempa.
4. Přetáhni vlastní Guitar Pro soubor do okna; u souboru s více nástroji přepni zobrazenou stopu.
5. Zkus prázdný nebo poškozený soubor a poté znovu platný soubor.

Základ neobsahuje editor, ukládání úprav ani knihovnu skladeb.

## Ověření při založení

Prošel `npm run build` včetně kontroly TypeScriptu. V prohlížeči byl ověřen import ukázkového `.gp`, vykreslení, běžící přehrávání, pauza, zastavení a změna rychlosti. Parser také úspěšně načetl lokální `.gp5` s pěti stopami a 162 takty; u dvou bendů použil obecnou interpretaci. Automatické ověření systémového dialogu výběru souboru narazilo na timeout nástroje, drag & drop zbývá ověřit ručně.

