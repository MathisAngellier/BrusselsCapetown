# Galerijmigratie: eerst een geïsoleerde lokale proef

Deze voorbereiding verandert niets aan Cloud86, de live database, `main` of
`admin-gallery`. Er is geen commit gemaakt. De GitHub-branch
`gallery-migration-prep` is aangemaakt op het bestaande admin-startpunt.
De nieuwe/samengevoegde tekstbestanden staan in het bijgeleverde ZIP-bestand.
Foto's en video's worden niet in die ZIP gedupliceerd: Git haalt ze uit `main`.

## Wat is gecombineerd?

- Admin-startpunt: `3f2f5771fc3ec505969e28b31a14707cf7e8bfd3`.
- Main-startpunt: `d150f45383ad17cf7e797400c2f864b1884ae117`.
- Gemeenschappelijke basis: `71dd7b7c4f37d5868e42a1cac9ede364b4b8e391`.
- Een driewegvergelijking combineert de bronbestanden. De conflicten in
  `.gitignore` en `gallery.css` zijn opgelost met behoud van beide wijzigingen.
- Behouden: adminbeheer, databasegalerij en fallback, lege-beschrijving-spacing,
  iPhone-video's met `#t=0.001`, compact mobiel videolabel en de homepagewijziging.
- De statische gegevens komen uit de genoemde main-versie: Brussel (24 foto's,
  2 video's) en Maubeuge (16 foto's). Alle 42 mediapaden bestaan in de Git-boom.
  De echte mediabytes zijn hier niet gedownload/geïmporteerd; de lokale dry-run
  controleert die bestanden inhoudelijk.

## 1. Een aparte kopie in Laragon maken

Gebruik een **nieuwe map**, niet je huidige werkmap met bestaande uploads/config.
Voer vanuit `laragon/www` uit (of een andere lokale ontwikkelmap):

```sh
git clone --branch gallery-migration-prep https://github.com/MathisAngellier/BrusselsCapetown.git BrusselsCapetown-migration-test
cd BrusselsCapetown-migration-test
git status --short
git rev-parse HEAD
```

De status moet leeg zijn en HEAD moet het admin-startpunt hierboven tonen.
Bij een afwijkende SHA of eigen wijzigingen: stop en vergelijk eerst; overschrijf
geen nieuw werk met deze voorbereidingsbestanden.

Haal de gecontroleerde main-versie erbij, **zonder commit**:

```sh
git merge --no-ff --no-commit d150f45383ad17cf7e797400c2f864b1884ae117
```

Verwachte conflicten zijn `.gitignore` en `httpdocs/src/assets/css/gallery.css`.
De melding dat de merge nog niet voltooid is, is hier normaal. Bij andere
conflicten eerst stoppen en controleren. De merge neemt ook de echte nieuwe
foto's/video's mee; alleen tekstbestanden kopiëren is dus niet voldoende.

Pak nu de voorbereidings-ZIP uit **in deze nieuwe projectroot**, naast `httpdocs`.
Laat uitsluitend de vijf meegeleverde bestaande tekstbestanden vervangen:
`.gitignore`, `gallery.css`, `gallery.js`, `galleryData.js` en `src/index.html`.
De overige bestanden (`scripts`, twee nieuwe tests en deze handleiding) zijn nieuw.
De ZIP bevat geen database, wachtwoorden, uploads, `node_modules` of build-output.

Markeer de twee opgeloste conflicten:

```sh
git add -- .gitignore httpdocs/src/assets/css/gallery.css
git diff --name-only --diff-filter=U
```

Het laatste commando moet niets tonen. De merge blijft ongecommit; dat is
verwacht. Commit/push pas na controle en wanneer je dat zelf wilt. Alleen de
remote voorbereidingsbranch openen/downloaden levert de nieuwe scripts nog niet
op, want zonder commit staan die uitsluitend in de ZIP/werkmap.

## 2. Een lege migratiedatabase maken

Maak in je **lokale** phpMyAdmin een nieuwe database:

```text
brusselscapetown_migration_test
```

Exporteer uit `brusselscapetown_local` alleen de **structuur** van
`gallery_locations` en `gallery_media` en importeer die in de nieuwe database.
Laat CREATE DATABASE/USE voor de oude database uit het exportbestand weg.
Beide galerijtabellen moeten leeg zijn. De InnoDB-engine en foreign key
`gallery_media.location_id -> gallery_locations.location_id ON DELETE CASCADE`
moeten behouden blijven. Niets uit je bestaande databases verwijderen.

Voor admin-login in de nieuwe projectkopie kun je daarnaast de structuur en
gegevens van je lokale `admins`-tabel overnemen. Kopieer geen testlocaties/media.

Maak een map `private` naast `httpdocs` in deze **nieuwe kopie**. Kopieer
`scripts/gallery-import.config.example.php` naar `private/gallery-import.config.php`.
Vul je lokale DB-gebruiker en wachtwoord in. Laat de databasenaam op
`brusselscapetown_migration_test` staan. Deze config is gitignored; deel hem niet.

Het importsysteem leest nooit automatisch `private/config.php`, gebruikt geen
DeepL en verandert geen configuratiebestanden. Het accepteert alleen loopback
hosts (`localhost`, `127.0.0.1`, `::1`) en namen die eindigen op `_migration_test`.
Het kan in deze versie dus niet rechtstreeks naar `brusselscapetown` of
`brusselscapetown_local` importeren. Gebruik geen port-forward/tunnel naar een
productiedatabase; dit is een lokale proef, geen productie-import.

## 3. Exporteren en dry-run uitvoeren

Gebruik Node 22+ en PHP 8.1+ vanuit Laragon Terminal, met `pdo_mysql` en `fileinfo`
ingeschakeld voor de **CLI**. Voer de commando's uit vanuit de projectroot:

```sh
node scripts/export-gallery.mjs
php scripts/import-gallery.php --expect-database=brusselscapetown_migration_test --dry-run
```

De export schrijft alleen `private/gallery-import.manifest.json`. Een bestaand
manifest wordt niet overschreven. Een vernieuwde export vraagt dat je eerst het
oude manifest controleert en naar een andere naam verplaatst.

De dry-run schrijft **niets**: geen SQL-wijzigingen, uploads, mappen of journal.
Hij controleert onder andere:

- De manifestversie en of `galleryData.js` sinds de export is gewijzigd.
- Beide talen, optionele beschrijvingen, datums, coördinaten, afstand en volgorde.
- Dubbele locaties/media; dubbele oude locatie-ID's worden gemeld en genegeerd.
- Elk bronbestand: bestaan, veilige paden, geen symlinks, MIME-type,
  afbeeldingherkenning, bestandsgrootte en SHA-256.
- De expliciet bevestigde database, lege galerijtabellen, InnoDB, schema/FK en
  afwezigheid van triggers; schrijfrechten en beschikbare ruimte voor kopieën.

Verwacht in deze snapshot 2 locaties en 42 media. Bewaar de getoonde
`Plan SHA-256`. Controleer ook de locaties en aantallen, niet alleen "passed".
De controle kan even duren doordat video's volledig worden gehasht, maar ze
worden niet volledig in het PHP-geheugen geladen.

Een dry-run kan niet vooraf garanderen welke AUTO_INCREMENT-ID's worden
uitgedeeld of dat een latere schijf/databasebewerking zal slagen. Het script
controleert daarom opnieuw bij de echte import en rolt terug bij fouten.

## 4. Pas na een goede dry-run lokaal importeren

Vervang `SHA256_UIT_DE_DRY_RUN` door de volledige getoonde 64-tekens-code:

```sh
php scripts/import-gallery.php --expect-database=brusselscapetown_migration_test --apply --expect-plan=SHA256_UIT_DE_DRY_RUN
```

Zonder `--apply` blijft het een dry-run. Een gewijzigde importplanning wordt
geweigerd wanneer de controlecode niet meer overeenkomt.

Het script:

1. Legt een privéhersteljournal aan en start één databasetransactie.
2. Controleert onder InnoDB-locks opnieuw dat beide galerijtabellen leeg zijn.
3. Maakt nieuwe `location_id`-waarden; `journey_order` volgt de arrayvolgorde.
4. Kopieert media naar nieuwe, niet-bestaande `uploads/gallery/{location_id}`-mappen
   met willekeurige bestandsnamen. Originelen blijven staan; checksums worden
   gecontroleerd. Er worden geen thumbnails of geconverteerde video's gemaakt.
5. Slaat grootte, gedetecteerd MIME-type en de mediavolgorde automatisch op.
6. Leest de opgeslagen velden terug om onverwachte afkapping/afronding te detecteren
   en commit pas daarna de database. Dit is een DB-transactie, geen Git-commit.

Er is geen UPDATE, DELETE of TRUNCATE van bestaande records. Een tweede import
weigert een niet-lege database of een bestaand journal. Oude ID's (hier tweemaal
`1`) worden niet hergebruikt; ook een AUTO_INCREMENT boven `1` werkt.
De huidige database heeft geen losse alt-tekstkolommen: het manifest bewaart de
oude alt-teksten, maar de publieke API blijft gelokaliseerde alt-teksten genereren.

Deze CLI-import is geen HTTP-upload en valt niet onder `max_file_uploads=20` of
de requestlimiet. De bestaande limieten van het admin-uploadformulier veranderen
niet. MIME-herkenning bewijst geen browsercompatibiliteit: speel video's zelf af,
vooral op iPhone. HEIC wordt geweigerd; MOV wordt niet getranscodeerd.

## 5. De nieuwe lokale kopie bekijken

Maak alleen in deze geïsoleerde projectkopie een `private/config.php` met dezelfde
migratie-DB-gegevens en je gebruikelijke lokale admin/DeepL-instellingen. Bewaar
de configuratie van je normale project ongewijzigd. Login gebruikt de `admins`-tabel.
Voor deze import zelf is geen DeepL-sleutel nodig.

Start de PHP-server volgens je bestaande lokale setup, bijvoorbeeld vanuit root:

```sh
php -S localhost:8000 -t httpdocs
```

Gebruik niet tegelijk een andere PHP-server op die poort: Vite moet naar deze
nieuwe projectkopie verbinden. Start daarna in een tweede terminal:

```sh
cd httpdocs
npm ci
npm run dev
```

Controleer:

- `/api/gallery/locations.php` via de PHP-server geeft 2 echte locaties en 42 media.
- `/gallery` via Vite gebruikt die API en toont geen fallbackmelding/testlocaties.
- Brussel staat eerst (vertrek), Maubeuge daarna; de afstand is 97 km na Maubeuge.
- Beide talen, kaartmarkers, vorige/volgende, lightbox en mediavolgorde kloppen.
- Een lege beschrijving behoudt ruimte boven de foto's; iPhone-video's en hun
  labels werken zoals op main. Een desktopvenster smal maken is geen iPhone-test.
- Admin-login en het tonen/bewerken van de geïmporteerde records werken. Doe
  eventuele destructieve tests uitsluitend in deze wegwerp-migratiedatabase.

Er is geen automatische samenvoeging van statische en databasegegevens. Een
succesvol lege database geeft een lege galerij, geen statische fallback. Alleen
een mislukte/ongeldige API-aanvraag gebruikt de statische gegevens.

## Fouten en herstel: niet blind opnieuw uitvoeren

`private/gallery-import-run.jsonl` registreert de database, planhash, nieuwe
locatie-ID's en de exacte bron-/doelpaden plus checksums voordat bestanden worden
gekopieerd. Het journal blijft ook na succes staan en is gitignored.

- Bij bevestigde rollback verwijdert het script alleen de nieuwe, ongewijzigde
  kopieën en daarna lege, zelfgemaakte locatiemappen. Het raakt bronmedia niet aan.
- Onvolledige of vervangen kopieën, een onzekere commit/rollback of een crash
  kunnen bestanden achterlaten. Bij onzekerheid blijven bestanden behouden.
- Databasetransacties maken bestandssysteembewerkingen niet crash-atomair.
  Verwijder geen journal of uploadmappen totdat de geregistreerde IDs/paden met
  de database zijn vergeleken. Een oude kopie in een bestaande ID-map wordt nooit
  overschreven; dat levert een fout op.
- Een fout in de laatste journalregel na een bevestigde commit geeft een
  waarschuwing, geen uitnodiging om opnieuw te importeren.

Bij een mislukte lokale proef is een nieuwe geïsoleerde kopie + nieuwe lege
`*_migration_test`-database vaak het eenvoudigst. Laat de mislukte kopie bestaan
totdat de oorzaak/herstelstatus duidelijk is. Dit script verwijdert geen database.

## Geautomatiseerde tests en beperkingen

```sh
node --test tests/gallery-import-export.test.mjs
```

De PHP-integratietests gebruiken de testtooling uit `ADMIN_MEDIA_MANAGEMENT.md`:
`@php-wasm/cli@3.1.52` in een aparte tijdelijke map, buiten het project. Stel
`BCT_PHP_WASM_MODULES` in op de `node_modules`-map daarvan en voer uit:

```sh
node --test tests/gallery-import.test.mjs
```

De tests draaien echte PHP en bestanden in een geïsoleerd virtueel bestandssysteem
met SQLite. Ze controleren import, rollback/onzekere commits, IDs, types/paden,
checksums, behoud van originelen, herhaalde runs en het weigeren van productietargets.
De InnoDB-locks, `information_schema`-controles en de volledige CLI-dry-run tegen
MySQL/MariaDB zijn hier niet live uitgevoerd en moeten lokaal worden bevestigd.
Een Vite-build alleen bewijst niet dat de PHP-server, uploads of iPhone werken.

## Nog niet live zetten

Deze versie is uitsluitend de lokale voorbereiding. Voor productie volgen apart:
back-up van database + bestanden/config, controle van echte Cloud86-gegevens en
schrijfrechten, een expliciet goedgekeurde productie-import, frontendbuild en
plaatsing van PHP/admin/API-bestanden met een terugvalplan. Git bevat niet je
genegeerde uploads/database/privateconfig; alleen pushen is geen migratie/deploy.
De lokale-targetbeveiliging in dit script niet omzeilen om alvast live te testen.
