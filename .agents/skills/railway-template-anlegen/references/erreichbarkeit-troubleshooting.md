# Erreichbarkeit-Troubleshooting: "Template ist deployt, aber nicht erreichbar"

Diese Datei ist für den zweiten Einstiegspunkt in den Skill: nicht Neuanlage, sondern Reparatur
eines bereits gescaffoldeten, schon deployten Templates, das der Nutzer als "nicht erreichbar",
"gibt einen Fehler" oder "lässt sich nicht öffnen" meldet. Arbeite die Abschnitte in dieser
Reihenfolge ab — jede Stufe setzt voraus, dass die vorherige schon ausgeschlossen ist, sonst
jagt man einem Code-Bug nach, wo eigentlich nur eine Domain fehlt.

## 1. Bevor du am Code schraubst

Eine fehlende Domain oder ein fehlendes Volume sieht von außen identisch aus wie ein echter Bug
("nicht erreichbar", "falscher Fehler") — kostet aber nichts, es zuerst auszuschließen:

- **Wurde je deployt?** `list_deployments` — 0 Einträge ist ein echter, häufiger Ausgangszustand
  (Projekt angelegt, nie fertig eingerichtet), kein Zufall und kein Anzeichen für einen Bug.
- **Existiert eine öffentliche Domain?** Ohne `generate_domain` bleibt der Service unerreichbar,
  ganz unabhängig davon, ob die Software selbst funktioniert.
- **Ist ein Volume am richtigen Pfad angehängt?** Der Pfad muss exakt der sein, in den die
  Software schreibt (siehe `laufzeit-muster.md`, Abschnitt "Volume nicht vergessen").
- **Läuft wirklich der aktuelle Commit?** Ein Service, der per API/MCP statt über das Dashboard
  erzeugt wurde, hat möglicherweise nie einen GitHub-Webhook für Auto-Deploy-on-Push bekommen —
  siehe Abschnitt 6. Symptom: der Fix scheint "nicht zu greifen", tatsächlich läuft ein alter
  Commit weiter.

Erst wenn diese vier Punkte bestätigt sind, lohnt es sich, den Code der Software selbst zu
verdächtigen.

## 2. Reverse-Proxy- und Host-Vertrauen

Software hinter Railways Edge-Proxy leitet oft eine Sicherheitsprüfung (Allowed-Hosts,
CSRF-Origin, Trusted-Proxy-Liste) aus einem Wert ab, der **exakt** dem entsprechen muss, was eine
echte öffentliche Anfrage aussieht — nicht dem, was der Container intern sieht. Öffentlicher
Traffic kommt immer als `https://<domain>` ohne Port im Host-Header an, weil TLS am Railway-Edge
terminiert und erst danach auf `$PORT` weitergeleitet wird.

**Fall A — Host/Origin-Wert enthält fälschlich Port oder Scheme.** GitLab CEs Entrypoint setzte
`external_url 'http://${HOST}:${PORT}'` — GitLab leitet daraus seine Allowed-Hosts-Prüfung ab, und
der eingebackene interne Port ließ jede echte Anfrage mit "Blocked hosts" scheitern, obwohl die
Domain selbst korrekt war. Der Fix:

```bash
# Falsch: interner $PORT landet im öffentlichen external_url
external_url 'http://${HOST}:${PORT}'

# Richtig: Scheme+Host wie eine echte Anfrage aussieht, kein Port
external_url 'https://${HOST}'
# nginx lauscht weiterhin separat auf $PORT, das ist ein eigener Config-Wert
```

Regel: jeder Wert, der so etwas wie "erlaubter Host" oder "öffentliche URL" heißt, kommt aus
`RAILWAY_PUBLIC_DOMAIN`, Scheme+Host, **nie** mit `$PORT` oder einer Portzahl verknüpft.

**Fall B — selbst eingebauter Proxy-Hop verändert die Peer-Adresse.** Home Assistants Entrypoint
leitet `$PORT` per `socat` auf den internen Port 8123 weiter — dadurch sieht Home Assistant die
Verbindung als von `127.0.0.1` kommend und muss diese Adresse in `trusted_proxies` haben, sonst
wird der echte, von Railways Edge gesetzte `X-Forwarded-For`-Header als "von einem nicht
vertrauten Proxy" verworfen. Wenn das trotz korrekt gesetzter Trust-Liste weiter fehlschlägt: die
Verbindung kann als IPv4-mapped-IPv6-Adresse (`::ffff:127.0.0.1`) ankommen, die nicht gegen einen
bloßen `127.0.0.1`-Eintrag matched. `socat -4` erzwingt IPv4 und normalisiert die Adressfamilie.

**Am lebenden Boot verifizieren, nicht der Datei vertrauen.** Bei Home Assistant stand der
korrekte `trusted_proxies`-Wert nachweislich in der Config-Datei und der Fehler trat trotzdem
weiter auf — das eigentliche Problem lag eine Ebene tiefer (siehe Abschnitt 3). Ein Debug-Print
des tatsächlich geladenen Configs am Containerstart deckt solche Fälle auf; sich auf "die Datei
sieht richtig aus" zu verlassen, kostet einen unnötigen Redeploy-Zyklus.

## 3. Versions-Pinning gegen Breaking-Onboarding-Changes

Ein `:latest`/`:stable`-Tag ist für zustandslose Software unproblematisch, aber unvereinbar mit
einem headless One-Click-Template, sobald Upstream einen Erstkonfigurationsschritt einführt, der
eine menschliche Bestätigung innerhalb eines Zeitfensters braucht. Home Assistant 2026.8 verschob
die HTTP-Integration von YAML auf die Web-UI — ein importierter YAML-`http:`-Block muss von einem
Administrator innerhalb von 5 Minuten nach dem ersten Neustart über die UI bestätigt werden, sonst
wird er automatisch verworfen. Auf einem headless Erstdeploy ohne abgeschlossenes Onboarding gibt
es diesen Administrator nie — klassisches Henne-Ei-Problem, das jede YAML-Konfiguration dauerhaft
wirkungslos macht, ganz unabhängig davon, wie korrekt sie ist.

Vor `:latest`/`:stable` kurz die Release Notes/Changelog auf genau diese Art von Änderung prüfen
(Config-Migration mit Bestätigungspflicht, Setup-Wizard mit Sperrfrist — siehe auch
`laufzeit-muster.md`, Abschnitt "Erstkonfiguration ohne Wizard"). Ist eine solche Änderung
absehbar oder schon aufgetreten: auf die letzte Version **vor** der Umstellung pinnen und das im
Dockerfile-Kommentar begründen, nicht nur im Confirmation-Gate erwähnen.

## 4. Volume-Idempotenz

Entrypoint-Logik, die einen Konfigurationsblock in eine Datei auf dem Railway-Volume schreibt,
muss idempotent **gegen ihre eigene vorherige Ausgabe** sein — nicht nur gegen "existiert
irgendein Marker". Ein Muster wie

```bash
grep -q "MARKER" "$FILE" || cat >> "$FILE" <<'EOF'
...
EOF
```

verhindert nur Duplikate. Es aktualisiert nie den Inhalt, sobald der Marker einmal geschrieben
wurde — ändert sich die Entrypoint-Logik in einem späteren Commit, läuft jeder Redeploy auf einem
bereits gebooteten Volume für immer mit der alten Config weiter, ohne dass das irgendwo auffällt.
Richtig:

```bash
if grep -q "MARKER_START" "$FILE"; then
  sed -i '/MARKER_START/,/MARKER_END/d' "$FILE"
fi
cat >> "$FILE" <<'EOF'
...
EOF
```

## 5. Shell-Wipe-Fallstricke

Zwei kleine, aber teure Fehler, die in derselben Session zweimal in Folge auftraten:

- **`rm -rf "$DIR"/*` überspringt Dotfiles.** Ein Zustandsverzeichnis wie `.storage/` überlebt
  einen so gemeinten "kompletten Wipe" unbemerkt — bei Home Assistant führte das dazu, dass eine
  neuere, inkompatible Storage-Schema-Version eine gezielt gepinnte ältere Version mit
  `UnsupportedStorageVersionError` zum Absturz brachte, obwohl der Wipe scheinbar gelaufen war.
- **Der Mountpoint selbst kann nicht `rm -rf` + neu angelegt werden.** Ist `$DIR` ein aktiver
  Bind-Mount (z. B. das Railway-Volume selbst), scheitert `rm -rf "$DIR"` mit "Resource busy" —
  der Ordner muss bestehen bleiben, nur sein Inhalt darf weg.

Richtig, für beide Fälle zugleich:

```bash
mkdir -p "$DIR"
find "$DIR" -mindepth 1 -exec rm -rf {} +
```

Ein solcher Wipe ist ohnehin nur als **einmaliger, klar kommentierter Übergangsschritt** im
Entrypoint zulässig (z. B. beim Versions-Downgrade aus Abschnitt 3) — danach wieder entfernen,
sonst zerstört jeder künftige Redeploy alle echten Nutzerdaten. Gleiches Muster wie schon beim
CloudBeaver-Template: temporären Wipe-Block einbauen, einmal erfolgreich deployen, Block wieder
entfernen und die Stabilität ohne ihn bestätigen.

## 6. Webhook-Lücke bei API/MCP-erzeugten Services

Der Dashboard-Weg ("New Project" → "Deploy from GitHub repo") verdrahtet automatisch den
GitHub-Webhook, der einen Redeploy bei jedem Push auslöst. Ein Service, der stattdessen direkt
über die Railway-API bzw. MCP-Tools erzeugt wurde (`create_service` mit `source_repo`), bekommt
diesen Webhook möglicherweise nie — es gibt dafür keine Fehlermeldung, der Deploy sieht einfach
aus, als "würde er nicht greifen".

**Diagnose:** den tatsächlich deployten Commit-SHA (`list_deployments`) gegen den echten
`HEAD` des Repos vergleichen.

**Fix:** einen Deploy des tatsächlich aktuellen Commits erzwingen, statt auf den Webhook zu
warten — z. B. über die GraphQL-Mutation `serviceInstanceDeploy(serviceId, environmentId,
latestCommit: true)`. Vorsicht mit `deploymentRedeploy` auf eine bestehende Deployment-ID: das
kann in manchen Fällen den Builder auf Railpack statt Dockerfile umschalten und einen unnötigen
zusätzlichen Fehlschlag erzeugen — `serviceInstanceDeploy` mit `latestCommit: true` ist der
zuverlässigere Weg.
