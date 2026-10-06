# Green release PR merges — 2026-10-06

Merged 17 generated Release Please PRs whose current-head checks completed successfully. Read back each merged PR and the automatically published GitHub release. Updated the Hub gitlinks to the corresponding fetched remote `main` commits. No manual version bumps or releases were created.

| Repository | Merged PR | Published release | Hub commit |
| --- | --- | --- | --- |
| railwayapp-airbyte | [#12](https://github.com/vergissberlin/railwayapp-airbyte/pull/12) | [railwayapp-airbyte-v0.2.1](https://github.com/vergissberlin/railwayapp-airbyte/releases/tag/railwayapp-airbyte-v0.2.1) | `ebbe909a` |
| railwayapp-email | [#10](https://github.com/vergissberlin/railwayapp-email/pull/10) | [v0.2.0](https://github.com/vergissberlin/railwayapp-email/releases/tag/v0.2.0) | `20dccbc3` |
| railwayapp-gitlab | [#6](https://github.com/vergissberlin/railwayapp-gitlab/pull/6) | [railwayapp-gitlab-v0.2.0](https://github.com/vergissberlin/railwayapp-gitlab/releases/tag/railwayapp-gitlab-v0.2.0) | `2a7c14a8` |
| railwayapp-grafana | [#14](https://github.com/vergissberlin/railwayapp-grafana/pull/14) | [v0.2.1](https://github.com/vergissberlin/railwayapp-grafana/releases/tag/v0.2.1) | `69b10f3a` |
| railwayapp-homeassistant | [#3](https://github.com/vergissberlin/railwayapp-homeassistant/pull/3) | [railwayapp-homeassistant-v0.2.0](https://github.com/vergissberlin/railwayapp-homeassistant/releases/tag/railwayapp-homeassistant-v0.2.0) | `53ba4503` |
| railwayapp-influxdb | [#14](https://github.com/vergissberlin/railwayapp-influxdb/pull/14) | [v0.2.1](https://github.com/vergissberlin/railwayapp-influxdb/releases/tag/v0.2.1) | `8e770147` |
| railwayapp-mqtt | [#11](https://github.com/vergissberlin/railwayapp-mqtt/pull/11) | [v0.2.1](https://github.com/vergissberlin/railwayapp-mqtt/releases/tag/v0.2.1) | `fbae8be1` |
| railwayapp-nodered | [#30](https://github.com/vergissberlin/railwayapp-nodered/pull/30) | [railwayapp-nodered-v0.2.6](https://github.com/vergissberlin/railwayapp-nodered/releases/tag/railwayapp-nodered-v0.2.6) | `ab848328` |
| railwayapp-opensearch | [#12](https://github.com/vergissberlin/railwayapp-opensearch/pull/12) | [railwayapp-opensearch-v0.2.1](https://github.com/vergissberlin/railwayapp-opensearch/releases/tag/railwayapp-opensearch-v0.2.1) | `3853400e` |
| railwayapp-mongodb | [#13](https://github.com/vergissberlin/railwayapp-mongodb/pull/13) | [v0.2.1](https://github.com/vergissberlin/railwayapp-mongodb/releases/tag/v0.2.1) | `53770ff6` |
| railwayapp-n8n | [#10](https://github.com/vergissberlin/railwayapp-n8n/pull/10) | [v0.1.2](https://github.com/vergissberlin/railwayapp-n8n/releases/tag/v0.1.2) | `2298dd71` |
| railwayapp-fastapi | [#16](https://github.com/vergissberlin/railwayapp-fastapi/pull/16) | [v0.1.2](https://github.com/vergissberlin/railwayapp-fastapi/releases/tag/v0.1.2) | `5cf8e20d` |
| railwayapp-flowise | [#9](https://github.com/vergissberlin/railwayapp-flowise/pull/9) | [v0.1.2](https://github.com/vergissberlin/railwayapp-flowise/releases/tag/v0.1.2) | `b4469a4f` |
| railwayapp-mjml | [#21](https://github.com/vergissberlin/railwayapp-mjml/pull/21) | [railwayapp-mjml-v1.1.3](https://github.com/vergissberlin/railwayapp-mjml/releases/tag/railwayapp-mjml-v1.1.3) | `8bd6cb7a` |
| railwayapp-cloudbeaver-ce | [#4](https://github.com/vergissberlin/railwayapp-cloudbeaver-ce/pull/4) | [railwayapp-cloudbeaver-ce-v0.2.1](https://github.com/vergissberlin/railwayapp-cloudbeaver-ce/releases/tag/railwayapp-cloudbeaver-ce-v0.2.1) | `a62d9df6` |
| railwayapp-operately | [#6](https://github.com/vergissberlin/railwayapp-operately/pull/6) | [railwayapp-operately-v0.2.1](https://github.com/vergissberlin/railwayapp-operately/releases/tag/railwayapp-operately-v0.2.1) | `d86f2911` |

| railwayapp-airflow | [#11](https://github.com/vergissberlin/railwayapp-airflow/pull/11) | [railwayapp-airflow-v0.2.1](https://github.com/vergissberlin/railwayapp-airflow/releases/tag/railwayapp-airflow-v0.2.1) | `b1efa05` |

## PRs retained open

The following Approval Agent checks remain `NEUTRAL`, rather than successful, despite rerequesting the checks. They were not merged under the instruction to merge green PRs:

- [railwayapp-typo3 #11](https://github.com/vergissberlin/railwayapp-typo3/pull/11)
- [railwayapp-postgresql #10](https://github.com/vergissberlin/railwayapp-postgresql/pull/10)
- [railwayapp-mysql #14](https://github.com/vergissberlin/railwayapp-mysql/pull/14)
- [railwayapp-nodejs #12](https://github.com/vergissberlin/railwayapp-nodejs/pull/12)
- [railwayapp-redis #9](https://github.com/vergissberlin/railwayapp-redis/pull/9)
- [railwayapp-outerbase-studio #4](https://github.com/vergissberlin/railwayapp-outerbase-studio/pull/4)

Airflow runtime checks passed on retry: Docker build, entrypoint configuration, first boot and restart on a root-owned volume. Its release PR #11 was subsequently merged.

Hub validation: `TMPDIR=/tmp pnpm run test:coverage:check` passed 207/207 tests with 100% line/function coverage and 94.22% branch coverage. `git diff --check` passed.
