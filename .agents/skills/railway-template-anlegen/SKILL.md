---
name: railway-template-anlegen
description: >-
  Legt ein neues öffentliches Railway-Template-Repository nach dem Muster
  vergissberlin/railwayapp-* an: scaffoldet über die Hub-CLI alle Repo-Dateien inklusive
  generierter Header-Grafik, erstellt das GitHub-Repo, committet und pusht, registriert das
  Template im Hub-Meta-Repo und veröffentlicht es im Railway-Template-Marketplace. IMMER
  verwenden, wenn der Nutzer ein neues Railway-Template, ein neues railwayapp-Repo oder eine
  Railway-Vorlage für eine Software anlegen, scaffolden oder veröffentlichen will - auch wenn er
  "Template", "scaffolden" oder "publish" nicht wörtlich erwähnt und nur sagt, dass eine
  bestimmte Software "auf Railway laufen" oder "in den Marketplace" soll.
  Trigger-Beispiele: 'leg ein Railway-Template für Uptime Kuma an', 'ich will Vaultwarden als
  Railway-Template', 'neues railwayapp-Repo für Plausible', 'bau ein Template für Metabase und
  veröffentliche es', 'kann Minio in den Railway-Marketplace?'.
---

# Railway-Template anlegen und veröffentlichen

Dieser Skill bringt eine Software von "das will ich auf Railway haben" bis zum veröffentlichten
Marketplace-Eintrag. Gearbeitet wird immer aus dem Hub-Repo heraus (lokal meist
`~/railway`, in Remote-Sessions `/home/user/railway`) - dort liegen die Skripte, `.gitmodules`,
die Badge-Registry und der `RAILWAY_TOKEN`.

Lies zuerst `AGENTS.md` im Hub-Root, dann `docs/railway-template-metadata.md` und
`docs/railway-template-publish.md`. Diese drei Dateien sind die Quelle der Wahrheit für
Konventionen, Pflichtfelder und bekannte Publish-Fehler - widerspricht dieser Skill ihnen,
gewinnen sie.

**Sprache:** Die Abstimmung mit dem Nutzer läuft auf Deutsch, alles was in ein Repository wandert
ist Englisch - README, Kommentare, Commit-Messages, PR-Texte (`AGENTS.md`: "Write documentation in
English", "Use Conventional Commits in English").

Die Reihenfolge der Schritte ist keine Stilfrage: Die Publish-Skripte lesen
`railway-template.json` von der Platte unter `<hub>/railwayapp-<slug>/`, deshalb muss das
Submodule registriert und ausgecheckt sein, bevor Schritt 6 überhaupt etwas findet.

## Schritt 0: Kontext sammeln

Gefragt wird im Normalfall nur nach der Software - alles andere leitest du her oder nimmst den
Default:

- **Software** (vom Nutzer oder aus dem Gesprächsverlauf): Name und, falls mehrdeutig, die
  gemeinte Edition (z. B. "Grafana OSS", "GitLab CE").
- **Slug**: Software-Name klein, Wörter mit Bindestrich; daraus `railwayapp-<slug>` als Repo-Name.
  Nur nachfragen, wenn mehrere Schreibweisen gleich plausibel sind (`uptime-kuma` vs. `uptimekuma`).
- **Owner** `vergissberlin`, **Default-Branch** `main`, **Lizenz** MIT, **Banner** 1280x270-SVG als
  `template-header.svg` im Repo-Root. Das steht fest, frag nicht danach.
- **Upstream-Image und Tag**: aus Docker Hub bzw. dem Upstream-Repo recherchieren. Tag immer
  pinnen (`influxdb:2.9`, nie `latest`), sonst kann Renovate keine Update-PRs stellen.
- **Port, Healthcheck-Pfad, Datenverzeichnis**: aus der Upstream-Doku (z. B. `3000`,
  `/api/health`, `/var/lib/grafana`). Gibt es keinen echten Healthcheck-Endpoint, nimm `/` und sag
  das im Zwischenbericht.
- **Kurzbeschreibung**: schreibst du selbst, Englisch, **25-75 Zeichen nach Trim** - Railways
  `templatePublish` lehnt kürzere und längere Texte ab.
- **Logo**: gehört zu jedem Template. Bringt das Repo keins mit, wird das offizielle Logo im
  Internet gesucht und als `logo-<slug>.png` mitcommittet — maximal 256 px, quadratisch. Quellen und
  Prüfschritte stehen in `references/logo-beschaffung.md`, die Beschaffung selbst ist Schritt 3.
  `customIcon` aus `scripts/lib/template-banner.mjs` ist nur die Notlösung für Software ohne
  verteilbare Marke.
- **Badge**: Markenfarbe als 6-stelliger Hex-Wert plus [simple-icons](https://simpleicons.org)-Slug.

Frag nur nach, was wirklich fehlt - nicht nach Dingen, die schon feststehen, und nicht nach
Werten, die in der Upstream-Doku stehen. Triff die Annahme, notiere sie, und lass sie am Ende von
Schritt 3 gemeinsam bestätigen.

## Schritt 1: Namen und Marketplace-Kollision klären

`displayName` ist der reine Software-Titel ohne `railwayapp-`-Präfix, `publishedCode` der
Marketplace-Slug. Prüfe vorher, ob der Name schon belegt ist:

```bash
pnpm marketplace:search -- "<Software>"
```

Ist der Name vergeben, ist das eine Branding-Entscheidung - kläre sie mit dem Nutzer, statt selbst
eine Variante zu erfinden.

**Nicht verwechseln:** `publishedCode` (`influxdb`, `grafana`) ist nicht der Deploy-Code in der
Button-URL (`fwbafn`, `anURAt`). Den vergibt Railway erst beim Veröffentlichen, siehe Schritt 7.

## Schritt 2: Runtime-Strategie festlegen

Railway ignoriert `EXPOSE` und routet auf `$PORT`. Die Software muss also dazu gebracht werden,
auf `$PORT` zu lauschen. Es gibt drei Wege:

| Strategie | Wann | Beispiel |
|---|---|---|
| `none` | Software liest `$PORT` selbst | viele Node-Apps |
| `startCommand` | ein Env-Var umbiegen genügt | Grafana (`GF_SERVER_HTTP_PORT`) |
| `entrypoint` | der Upstream-Entrypoint macht Setup oder gibt Rechte ab | InfluxDB (`INFLUXD_HTTP_BIND_ADDRESS`) |

Bei `entrypoint` wird ein `railway-entrypoint.sh` erzeugt, das die Variable setzt und dann per
`exec` an den Upstream-Entrypoint übergibt - so bleiben PID-1-Semantik, automatisiertes Setup und
der Privilegien-Wechsel erhalten. Details und eine erweiterbare Lookup-Tabelle stehen in
`references/laufzeit-muster.md`. Lies die Datei, bevor du dich entscheidest.

## Schritt 3: Logo beschaffen und Repo scaffolden

Zuerst das Logo, denn `templates:create` bettet es direkt ins Banner ein - kommt es später, muss das
Banner neu gebaut werden. Hol das offizielle Logo aus dem Upstream-Repo (PWA- und Touch-Icons wie
`apple-touch-icon.png` sind meist quadratisch und schon klein genug):

```bash
curl -sSL -o /tmp/logo-<slug>.png \
  "https://raw.githubusercontent.com/<org>/<repo>/main/public/img/apple-touch-icon.png"
file /tmp/logo-<slug>.png
```

`references/logo-beschaffung.md` listet die Quellen in Reihenfolge, die Größenprüfung und die
rechtlichen Grenzen. Lies die Datei, bevor du auf `customIcon` ausweichst - ein Template ohne Logo
ist ein Befund, den du meldest, kein Default.

Dann die gesammelten Werte in eine Spec-Datei schreiben und erst den Dry-run laufen lassen - er
schreibt nichts:

```bash
pnpm templates:create -- --spec /tmp/<slug>.json
```

Prüfe die Dateiliste, dann anwenden und das Logo mitgeben:

```bash
pnpm templates:create -- --spec /tmp/<slug>.json --logo /tmp/logo-<slug>.png --apply
```

Die CLI kopiert die Datei als `logo-<slug>.png` ins Repo-Root und setzt `logoFile` - der Name ist
Konvention und wird vom Schema erzwungen, benenne ihn also nicht um. Ohne `--logo` warnt sie, dass
das Banner auf eine generische Marke zurückfällt.

`pnpm templates:create -- --help` listet alle Optionen. Die CLI validiert Slug-Form, Portbereich
und Beschreibungslänge vorab - ein früher Fehler ist besser als eine abgelehnte
`templatePublish`-Mutation mit undurchsichtiger `traceId`.

**Warum das Logo klein sein muss:** Das Banner bettet es base64 inline ein, damit es standalone von
`raw.githubusercontent.com` als Marketplace-Bild rendert. Grafanas 1024-px-PNG erzeugt ein 93 KB
großes SVG, influxdbs 170-px-Logo nur 4 KB. Die CLI warnt ab 20 KB.

Danach kontrollieren: README beginnt mit H1, Leerzeile, `![Template Header](./template-header.svg)`;
`.env.example` existiert und `.env` nicht; genau ein `<!-- footer -->`-Marker.

**Jetzt ein einziges Bestätigungs-Gate.** Zeig dem Nutzer kompakt Repo-Name, `displayName`,
`publishedCode`, Beschreibung mit Zeichenzahl, Image plus Tag, Port-Strategie, Healthcheck- und
Mount-Pfad. Das ist eine Review, kein Interview - danach entsteht öffentlich sichtbarer Kram.

## Schritt 4: GitHub-Repo anlegen und pushen

Lade die GitHub-Tools über `ToolSearch` (Suchbegriff `"github create repository"`) - die Tool-IDs
sind sessionabhängig, verlass dich nie auf einen fest eingetippten `mcp__…`-Namen. Ein `gh`-CLI
gibt es in dieser Umgebung nicht.

1. Repo `railwayapp-<slug>` **public** anlegen, ohne Auto-Init (das Scaffold bringt die README mit).
2. In Remote-Sessions ist ein frisch erzeugtes Repo noch nicht im Session-Scope: über `add_repo`
   mit Push-Zugriff registrieren, sonst schlägt `git push` fehl.
3. Committen und pushen:

```bash
cd <hub>/railwayapp-<slug>
git init -b main && git add -A
git commit -m "feat: add Railway template for <Software>"
git push -u origin main
```

Falls Push blockiert bleibt, ist `push_files` der Fallback - der überträgt aber nur Textdateien,
ein binäres Logo-PNG geht damit nicht. Ein SVG-Logo umgeht das Problem.

## Schritt 5: Im Hub registrieren

Ohne diesen Schritt findet die Publish-Automatik das Template nicht.

```bash
cd <hub>
git submodule add git@github.com:vergissberlin/railwayapp-<slug>.git railwayapp-<slug>
pnpm templates:headers -- --only railwayapp-<slug>   # Banner mit Logo neu bauen
pnpm templates:registry:sync:apply                   # Badge in die Registry cachen
pnpm templates:footers                               # footer.md + READMEs aktualisieren
```

`templates:footers` fasst nur ausgecheckte Submodule an und warnt über die übrigen - das ist
gewollt, nicht kaputt. Die Badge-Registry ist ein generierter Cache: nie mit der Hand editieren,
immer das `badge`-Feld im Template-Repo ändern und neu syncen.

**Root-`README.md` des Hubs von Hand nachziehen.** `templates:footers` aktualisiert nur `footer.md`
und die READMEs der einzelnen Template-Repos - die Liste unter "Included template submodules" in
`<hub>/README.md` ist keine generierte Datei und wird von keinem Skript angefasst. Neuen Eintrag
`` `railwayapp-<slug>` `` alphabetisch einsortieren, sonst driftet die Liste bei jedem neuen
Template weiter auseinander (das ist schon mehrfach passiert).

Danach im Hub committen (`chore: add railwayapp-<slug> submodule and badge`) und pushen. Läuft die
Arbeit auf einem `claude/*`-Branch, gehört ein Draft-PR dazu.

## Schritt 6: Railway-Projekt und Marketplace

Ein Template entsteht nur aus einem **existierenden Railway-Projekt** - `templateGenerate` leitet
den Template-Namen aus dem Projektnamen ab. Dieser eine Schritt bleibt manuell:

Im Dashboard "New Project" → "Deploy from GitHub repo" → `railwayapp-<slug>` wählen. Das Projekt
**exakt** wie `displayName` benennen, sonst heißt das Template später `railwayapp-…`.

Danach automatisch, mit `RAILWAY_TOKEN` in `<hub>/.env` (nie committen):

```bash
pnpm templates:sync:apply      # templateGenerate -> Draft
pnpm templates:publish:apply   # templatePublish  -> öffentlich
pnpm templates:verify          # Konsistenzprüfung
```

Fehlt der Token, brich hier nicht die ganze Aufgabe ab - melde Schritt 6 klar als offen und liefere
alles davor fertig ab.

## Schritt 7: Deploy-Code nachtragen

Erst jetzt existiert der Deploy-Code. Hol ihn aus der Marketplace-URL bzw. der `templatePublish`-
Antwort und ersetze im README-Deploy-Button `REPLACE_WITH_RAILWAY_TEMPLATE_CODE`. Dann
`docs: add Railway deploy button code` committen, pushen und im Hub den Submodule-Pointer
aktualisieren.

## Fehlerbehandlung

| Problem | Reaktion |
|---------|----------|
| `RAILWAY_TOKEN` fehlt | `.env` im Hub-Root anlegen, nie committen. Kein `railway`-CLI hier, also kein `railway login`. Schritte 0-5 laufen trotzdem, Schritt 6 als offen melden |
| "You have been blocked from publishing templates" | Fast immer fehlende `workspaceId`, nicht ein gesperrtes Konto. Workspace-ID prüfen, dann erneut |
| "Problem processing request" + `traceId` | Serverseitig. `traceId` mit `--verbose` sichern, Railway-Support kontaktieren, nicht blind wiederholen |
| `description must be between 25 and 75` | Beschreibung in `railway-template.json` korrigieren, nicht das Skript umgehen |
| Template heißt im Marketplace `railwayapp-…` | Railway leitet den Namen aus dem Projektnamen ab. Projekt umbenennen oder `railwayProjectName` setzen, dann `pnpm templates:display-names:apply` |
| Name oder `publishedCode` schon belegt | Mit dem Nutzer klären, nicht selbst eine Variante erfinden |
| `Missing badge data for …` | Dem Repo ein `badge`-Feld geben und `pnpm templates:registry:sync:apply` laufen lassen |
| `template-header.svg` deutlich über 20 KB | Logo zu groß, weil base64 inline. Kleineres Logo nehmen, `pnpm templates:headers` erneut |
| Kein Logo im Upstream-Repo zu finden | Quellen in `references/logo-beschaffung.md` abarbeiten. Erst danach `customIcon` setzen **und** die Lücke im Bericht nennen |
| `logoFile … breaks the naming convention` | Datei nach `logo-<slug>.png` umbenennen, `logoFile` mitziehen, `pnpm templates:headers` erneut |
| `CONNECT tunnel failed, response 403` beim Logo-Download | Proxy-Policy, nicht tote URL. Nur GitHub-Hosts sind erreichbar - Upstream-Repo statt Brand-Seite, TLS nie abschalten |
| Deployment antwortet "Application failed to respond" | `$PORT` nicht gemappt. Zurück zu Schritt 2 |
| Submodule nicht ausgecheckt | Nur ausgecheckte Submodule lassen sich in dieser Session ändern. Als manuellen Schritt vermerken statt es zu erzwingen |
| GitHub-Tool nicht gefunden | Über `ToolSearch` nachladen, Tool-IDs nie hartkodieren |

## Zum Schluss

Fass kurz zusammen, was existiert - Repo-URL, Marketplace-URL, offene PRs - und was noch manuell
aussteht. Nicht jede Datei einzeln erklären, der Nutzer kann sie öffnen. Wenn etwas offen bleibt
(typisch: fehlender Token, nicht ausgecheckte Submodule), sag genau das, statt es als fertig zu
verkaufen.

## Referenzen

- `references/laufzeit-muster.md` — die drei `$PORT`-Strategien im Vergleich plus Lookup-Tabelle
  Software → Bind-Variable / Healthcheck-Pfad / Datenverzeichnis. Lies das in Schritt 2.
- `references/logo-beschaffung.md` — woher das Logo kommt, wie es heißen muss, wie du Größe und
  Rechte prüfst. Lies das in Schritt 3.
- `docs/railway-template-metadata.md` (Hub) — Feldreferenz und Badge-Registry.
- `docs/railway-template-publish.md` (Hub) — Publish-Troubleshooting mit allen GraphQL-Details.
