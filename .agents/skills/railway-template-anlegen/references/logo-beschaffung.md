# Logo beschaffen: Quellen, Prüfung, Grenzen

Jedes Template trägt das Logo der Software, die es deployt. Das ist keine Kosmetik: Aus
`logo-<slug>.png` baut `pnpm templates:headers` das Banner `template-header.svg`, und dieses Banner
ist gleichzeitig das Marketplace-Bild. Ein Template mit Initialen-Fallback sieht neben dem
restlichen Katalog unfertig aus.

Fehlt das Logo im Repo, wird es **im Internet gesucht** und mitcommittet. `customIcon` ist die
Ausnahme für Software ohne verteilbare Marke — keine Abkürzung, um die Suche zu überspringen.

## Konvention

| Punkt | Regel |
|---|---|
| Dateiname | `logo-<slug>.png` im Repo-Root, gleicher Slug wie `railwayapp-<slug>` |
| Format | PNG bevorzugt, `.svg` erlaubt und deutlich kleiner nach dem Inlining |
| Größe | maximal 256 px Kantenlänge — das Banner bettet die Datei base64 ein |
| Form | quadratisch, transparenter Hintergrund, Symbol statt Wortmarke |
| Metadaten | `logoFile` in `railway-template.json` setzen, `customIcon` entfernen |

Das Schema (`docs/railway-template.schema.json`) erzwingt den Namen, und
`buildBannerForRepo` warnt bei abweichendem Namen sowie bei Templates, die weder `logoFile` noch
`customIcon` deklarieren.

**Warum quadratisch und kein Wortmarken-Logo:** Das Banner rendert die Datei in ein 112×112-Feld.
Ein breites Wortmarken-PNG wird darin unlesbar klein, ein quadratisches Symbol nicht.

## Quellen, in dieser Reihenfolge

### 1. Das Upstream-Repository auf GitHub

Fast jedes OSS-Projekt hat sein Icon im eigenen Repo — typisch unter `public/img/`, `assets/`,
`static/`, `docs/` oder `.github/`. Über `raw.githubusercontent.com` lässt es sich direkt laden:

```bash
curl -sSL -o /tmp/logo-<slug>.png \
  "https://raw.githubusercontent.com/<org>/<repo>/main/public/img/apple-touch-icon.png"
```

**PWA- und Touch-Icons sind der beste Treffer:** `apple-touch-icon.png`, `icon-192.png`,
`android-chrome-192x192.png` sind quadratisch, transparent und schon in der richtigen Größenordnung
(180–512 px). Ein `favicon`-32-px-Icon ist dagegen zu klein und wird im Banner matschig.

Den Pfad nicht raten — mit den GitHub-Tools (`search_code`, `get_file_contents`) im Upstream-Repo
nachsehen. Tool-IDs über `ToolSearch` laden, nie hartkodieren.

### 2. simple-icons

```bash
curl -sSL -o /tmp/logo-<slug>.svg \
  "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/<slug>.svg"
```

Der Slug ist derselbe wie im `badge.logo`-Feld. Achtung: simple-icons sind **einfarbig schwarz**.
Auf dem dunklen Banner-Gradienten ist das praktisch unsichtbar, das SVG müsste also erst umgefärbt
werden. Deshalb nur greifen, wenn Quelle 1 nichts hergibt — und lieber vorher fragen, ob eine
umgefärbte Marke akzeptabel ist.

### 3. Die offizielle Brand- oder Press-Seite

Qualitativ die beste Quelle, in Remote-Sessions aber meist nicht erreichbar: Der Agent-Proxy ist auf
GitHub-Hosts beschränkt. `curl: (56) CONNECT tunnel failed, response 403` heißt Proxy-Policy, nicht
tote URL — nicht mit `-k` oder ohne `HTTPS_PROXY` umgehen. Ist das Logo nur dort zu holen, sag dem
Nutzer die URL und lass ihn die Datei ablegen, statt den Schritt still zu überspringen.

## Vor dem Commit prüfen

```bash
file /tmp/logo-<slug>.png    # wirklich ein Bild? 403-Seiten landen sonst als "PNG" im Repo
node -e 'const b=require("fs").readFileSync("/tmp/logo-<slug>.png");
         console.log(b.readUInt32BE(16) + "x" + b.readUInt32BE(20))'   # IHDR: Breite x Höhe
```

Ist die Kantenlänge über 256 px, ist das kein Abbruchgrund, aber ein Befund: In dieser Umgebung gibt
es kein ImageMagick und kein Pillow, also nicht selbst skalieren. Such lieber eine kleinere Variante
im Upstream-Repo oder nimm das SVG — und wenn beides fehlt, notiere die Abweichung im
Zwischenbericht, statt sie zu verschweigen.

Danach:

```bash
pnpm templates:headers -- --only railwayapp-<slug>
ls -l <hub>/railwayapp-<slug>/template-header.svg
```

Über 20 KB warnt die CLI — dann war das Logo zu groß. Ein 170-px-PNG landet bei etwa 4 KB, ein
1024-px-PNG bei etwa 93 KB.

## Rechte

Das Produktlogo für ein Template zu verwenden, das genau dieses Produkt deployt, ist benennender
Gebrauch und üblich. Zwei Grenzen gelten trotzdem:

- Marken nicht verzerren, neu einfärben oder mit eigenen Elementen kombinieren, wenn die
  Brand-Guideline das untersagt.
- Nichts verwenden, was Unterstützung durch den Hersteller suggeriert.

Verbietet die Lizenz die Weitergabe ausdrücklich, ist `customIcon` die richtige Antwort — die
gültigen Namen stehen in `scripts/lib/template-banner.mjs`.
