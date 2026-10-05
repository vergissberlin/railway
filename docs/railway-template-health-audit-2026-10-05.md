# Railway template health audit — 2026-10-05

## Outcome

Audited the 27 repositories registered in `.gitmodules`. The workspace contains 26 matching published marketplace templates; Open WebUI has no matching published template. Applied and read back configuration improvements to 25 published templates, preserving their IDs, public codes and usage history. Airbyte remains an incomplete legacy server-only template.

The published `health` scores did **not** change during verification. Configuration repairs and successful smoke tests are not evidence of an immediate marketplace score increase. Deployments owned by template users are not accessible through this account; their failures cannot be inspected or fixed directly.

The authenticated Railway account exposes only Operately and an unrelated project. Operately's existing application and Postgres deployments report `SUCCESS`; its public `/health` endpoint returned HTTP 200. No customer deployment was recreated, wiped or reset.

## Applied configuration repairs

- Added missing persistent data volumes using each repository's `requiredMountPath`.
- Added missing generated HTTP domains for web services; MQTT receives a TCP proxy targeting 1883.
- Restored deployment healthchecks, startup commands, builders and `main` repository sources from the checked-out template repositories.
- Generated required initial passwords and stable encryption keys instead of leaving first boot without credentials.
- Removed Grafana's obsolete Angular plugin variable; retained its supported clock plugin and configured the public HTTPS URL.
- Configured n8n's proxy hop, public webhook/editor URLs and database readiness endpoint.
- Configured database passwords and private connection references, InfluxDB initialization defaults, Node-RED's stable credential secret and Django's signing key.
- Updated the published overviews for MQTT, Airflow, n8n, Flowise and OpenSearch.

The exact applied infrastructure patches and before/after score values are recorded in [the generated audit snapshot](./railway-template-health-changes-2026-10-05.json). This is historical evidence, not a replacement for per-repository `railway-template.json` metadata.

## Repository fixes

| Repository | Change | Verification |
| --- | --- | --- |
| MQTT | Broker-readable password file; atomic regeneration on restart; root-owned data-volume ownership; stdout logs; authenticated Docker healthcheck | Docker build and two integration tests passed, including anonymous rejection, retained message after restart and anonymous local mode |
| Airflow | Replace removed `SequentialExecutor` with `LocalExecutor` | Two executable entrypoint tests passed; full Docker build interrupted by local daemon failure; GitHub runtime workflow added |
| n8n | Use `/healthz/readiness` instead of the editor page | Docker build passed; fresh root-owned tmpfs, non-default port 8099 and HTTP 200 readiness response |
| Flowise | Use unauthenticated `/api/v1/ping`; generate stable credential encryption key in the template | Endpoint and authentication behavior checked against upstream source/docs; Docker runtime not verified |
| OpenSearch | Remove the incompatible unauthenticated HTTP probe and document the missing TLS setup | TOML checked; template password and data-volume configuration read back; full runtime remains unverified |

Grafana and InfluxDB also built and booted successfully with fresh data mounts and non-default ports. Grafana `/api/health` returned HTTP 200 with `database: ok`; InfluxDB `/health` returned HTTP 200 with `status: pass` after first-run initialization.

The Hub suite passed **207/207 tests** with `TMPDIR=/tmp pnpm test`. The first run exposed an existing path-wrapping assertion under macOS's long temporary directory; no test or CLI implementation was changed to mask it. Shell syntax and relevant Git diffs were checked.

## Observed marketplace scores

| Template | Before | After |
| --- | ---: | ---: |
| n8n | 0 | 0 |
| GitLab CE | 0 | 0 |
| Node-RED | 12 | 12 |
| Airbyte | 40 | 40 |
| Mosquitto MQTT | 43 | 43 |
| Grafana | 48 | 48 |
| Apache Airflow | 50 | 50 |
| Home Assistant | 60 | 60 |
| InfluxDB | 71 | 71 |
| MySQL | 83 | 83 |
| Email | 100 | 100 |

Other matching templates return `null` for `health`; this is not proof of healthy or unhealthy runtime.

## Remaining limitations

- **Airbyte:** The template contains only `airbyte/server:0.63.19`, without its PostgreSQL, Temporal, worker or webapp dependencies. Real connector execution also expects a Docker socket unavailable on Railway. The existing evaluation-only warning remains. A complete production Airbyte stack cannot be delivered by repairing this single-container template. See [upstream Docker Compose deprecation](https://github.com/airbytehq/airbyte/discussions/40599).
- **OpenSearch:** `DISABLE_INSTALL_DEMO_CONFIG=true` retains the security plugin but supplies no node certificates or complete security configuration. A generated admin password and volume do not solve that bootstrap gap. Authenticated HTTPS cannot be probed by Railway's unauthenticated HTTP healthchecker. Security was not disabled to obtain a green status. See [OpenSearch Docker installation](https://docs.opensearch.org/latest/install-and-configure/install-opensearch/docker/) and [TLS configuration](https://docs.opensearch.org/latest/security/configuration/tls/).
- **Existing template users:** Infrastructure changes apply to new deployments or deliberately accepted template updates. Existing ephemeral data cannot be recovered by attaching a new volume. Existing installations should retain their encryption keys and credentials when reviewing updates. See [Railway template updates](https://docs.railway.com/templates/updates).
- **GitHub checks:** [MQTT runtime checks](https://github.com/vergissberlin/railwayapp-mqtt/actions/runs/37367354459) passed, including Docker build, authentication, healthcheck, persistence and restart. [Hub Coverage Check](https://github.com/vergissberlin/railway/actions/runs/37368257131) also passed for `bb6350f`. [Airflow runtime checks](https://github.com/vergissberlin/railwayapp-airflow/actions/runs/37367359075) and [Hub template publishing](https://github.com/vergissberlin/railway/actions/runs/37368257129) failed before execution because GitHub could not assign a hosted runner. Airflow was retried; its result remains unverified until the retry finishes. Published configuration changes were applied and read back directly as described above.
- **Local Docker:** The daemon became unavailable during the larger OpenSearch/Airflow builds. The shared APFS volume had about 100 MiB available. No unrelated files or Docker resources were deleted. The daemon was restarted successfully. Audit containers/images and their explicitly identified, unshared build-cache records were removed (6.579 GB of cache reclaimed).

For Airflow's executor migration, see the [official Airflow release notes](https://airflow.apache.org/docs/apache-airflow/stable/release_notes.html). Railway's deployment healthchecks run before routing a deployment; they are not continuous monitoring ([documentation](https://docs.railway.com/deployments/healthchecks)).
