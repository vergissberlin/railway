# Laufzeit-Muster: `$PORT`, Healthcheck, Volume

Railway ignoriert `EXPOSE` im Dockerfile und routet öffentlichen Verkehr an den Port, der in
`$PORT` steht. Lauscht die Software auf einem festen Port, antwortet das Deployment mit
"Application failed to respond". Diese Datei sammelt die drei Wege, das zu lösen, und die Werte,
die sich pro Software immer wieder unterscheiden.

## Die drei Strategien

### `none` — die Software liest `$PORT` selbst

Viele Node- und Python-Apps lesen `process.env.PORT` bzw. `os.environ["PORT"]` von sich aus. Dann
ist nichts zu tun: kein `startCommand`, kein Wrapper.

Test vor der Entscheidung: findet sich `PORT` in der Upstream-Doku oder im Startcode als
unterstützte Variable? Wenn ja, nimm `none`. Rate nicht — ein falsches `none` fällt erst beim
Deployment auf.

### `startCommand` — ein Env-Var umbiegen genügt

Wenn die Software ihren Port aus einer eigenen Variable liest und beim Start nichts weiter passiert,
reicht eine Zeile in `railway.toml`:

```toml
startCommand = "sh -c 'export GF_SERVER_HTTP_PORT=${PORT:-3000}; /run.sh'"
```

Vorteil: kein zusätzliches Skript im Repo. Nachteil: der Start-Command ersetzt den
Image-Entrypoint. Alles, was der Entrypoint sonst getan hätte, fällt weg.

### `entrypoint` — der Upstream-Entrypoint muss erhalten bleiben

Sobald der Upstream-Entrypoint Arbeit erledigt — automatisiertes Setup, Migrationen, Rechte per
`gosu` abgeben — darf er nicht ersetzt werden. Dann kommt ein Wrapper ins Repo, der die Variable
setzt und per `exec` übergibt:

```bash
#!/bin/bash
set -euo pipefail

readonly UPSTREAM_ENTRYPOINT='/entrypoint.sh'
port="${PORT:-8086}"

if ! [[ "${port}" =~ ^[0-9]+$ ]] || ((port < 1 || port > 65535)); then
	echo "railway-entrypoint: PORT='${port}' is not a valid port number (1-65535)" >&2
	exit 1
fi

# An explicitly configured value always wins over the derived one.
export INFLUXD_HTTP_BIND_ADDRESS="${INFLUXD_HTTP_BIND_ADDRESS:-:${port}}"

exec "${UPSTREAM_ENTRYPOINT}" "$@"
```

Drei Dinge daran sind wichtig und nicht Deko:

- **`exec`** ersetzt den Prozess, statt einen Kindprozess zu starten. Nur so bleibt PID 1 beim
  eigentlichen Dienst und Signale (SIGTERM beim Redeploy) kommen an.
- **Die Portprüfung** fängt einen kaputten `$PORT` mit einer lesbaren Meldung ab, statt die Software
  mit einer unsinnigen Bind-Adresse starten zu lassen.
- **`${VAR:-...}`** lässt eine explizit gesetzte Variable gewinnen. Wer die Bind-Adresse selbst
  konfiguriert, wird nicht überschrieben.

Achtung bei der Wertform: manche Software will einen reinen Port (`GF_SERVER_HTTP_PORT=3000`),
andere eine vollständige Bind-Adresse (`INFLUXD_HTTP_BIND_ADDRESS=:8086`). Die CLI setzt
`${PORT}` ein; braucht die Software einen Doppelpunkt davor, muss das nachgetragen werden.

## Lookup-Tabelle

Erweitere die Tabelle, wenn du ein neues Template anlegst — sie ist der Grund, warum der nächste
Lauf schneller geht.

| Software | Strategie | Port-Variable | Port | Healthcheck | Datenverzeichnis |
|---|---|---|---|---|---|
| Grafana | `startCommand` | `GF_SERVER_HTTP_PORT` | 3000 | `/api/health` | `/var/lib/grafana` |
| InfluxDB | `entrypoint` | `INFLUXD_HTTP_BIND_ADDRESS` (`:PORT`) | 8086 | `/health` | `/var/lib/influxdb2` |
| n8n | `startCommand` | `N8N_PORT` | 5678 | `/healthz` | `/home/node/.n8n` |
| Node-RED | `none` | `PORT` | 1880 | `/` | `/data` |
| Uptime Kuma | `startCommand` | `UPTIME_KUMA_PORT` | 3001 | `/` | `/app/data` |

## Werte, die immer gleich bleiben

`railway.toml` bekommt unabhängig von der Software:

```toml
[build]
builder = "DOCKERFILE"

[deploy]
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

Kein `railway.json` — das wäre eine zweite Quelle für dieselben Deploy-Einstellungen und driftet
irgendwann von `railway.toml` ab.

## Healthcheck ohne echten Endpoint

Hat die Software keinen Health-Endpoint, nimm `/` und sag es dem Nutzer. Ein Healthcheck auf `/`
prüft nur, dass überhaupt ein HTTP-Server antwortet — besser als keiner, aber er erkennt keine
kaputte Datenbankverbindung. Das ist eine bewusste Einschränkung, keine Lösung.

## Volume nicht vergessen

`requiredMountPath` zwingt Railway, beim Deploy nach einem Volume zu fragen. Ohne Volume sind alle
Daten nach jedem Redeploy weg — bei einer Datenbank oder einem Monitoring-Tool ist das der
Unterschied zwischen Template und Datenverlust. Der Pfad muss genau der sein, in den die Software
schreibt; ein falscher Pfad legt ein leeres Volume an und wirkt dabei wie ein funktionierendes
Setup.
