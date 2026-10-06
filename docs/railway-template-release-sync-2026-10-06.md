# Template release synchronization — 2026-10-06

## Verified repository state

All 27 repositories registered in `.gitmodules` were fetched from GitHub, including tags. The five health-repair commits are present on their remote `main` branches and already referenced by the Hub. Open WebUI was the only stale Hub gitlink: `b8f6eec` was advanced to `cc03e72`, which includes its merged Release Please `0.2.0` release. No runtime files changed in that update.

Release Please is configured in 25 repositories. Flask and Django currently have no release workflow. There are 23 open generated release PRs; these are pending releases, not published versions. Their branches are not used as submodule targets.

## Health-repair release processing

n8n has a successful Release Please run and its generated PR includes the readiness fix. The Airflow, MQTT, OpenSearch and Flowise runs failed before execution because GitHub could not assign a hosted runner. All four were retried on 2026-10-06 and completed successfully. Readback of all five generated PR bodies confirms that each now includes its respective health-repair commit. The release PRs remain open; no new release has been published for these fixes.

- [airflow Release Please run](https://github.com/vergissberlin/railwayapp-airflow/actions/runs/37367359051): successful retry (attempt 2).
- [mqtt Release Please run](https://github.com/vergissberlin/railwayapp-mqtt/actions/runs/37367354674): successful retry (attempt 2).
- [opensearch Release Please run](https://github.com/vergissberlin/railwayapp-opensearch/actions/runs/37367506642): successful retry (attempt 2).
- [flowise Release Please run](https://github.com/vergissberlin/railwayapp-flowise/actions/runs/37367728287): successful retry (attempt 2).

| Repository | Remote main | Latest published release | Open release PR |
| --- | --- | --- | --- |
| railwayapp-airbyte | `9d2842a2` | [railwayapp-airbyte-v0.2.0](https://github.com/vergissberlin/railwayapp-airbyte/releases/tag/railwayapp-airbyte-v0.2.0) | [#12](https://github.com/vergissberlin/railwayapp-airbyte/pull/12) |
| railwayapp-airflow | `acefaaf3` | [railwayapp-airflow-v0.2.0](https://github.com/vergissberlin/railwayapp-airflow/releases/tag/railwayapp-airflow-v0.2.0) | [#11](https://github.com/vergissberlin/railwayapp-airflow/pull/11) |
| railwayapp-codimd | `46d6afb2` | [v0.1.0](https://github.com/vergissberlin/railwayapp-codimd/releases/tag/v0.1.0) | None |
| railwayapp-email | `fdbd7d40` | [v0.1.0](https://github.com/vergissberlin/railwayapp-email/releases/tag/v0.1.0) | [#10](https://github.com/vergissberlin/railwayapp-email/pull/10) |
| railwayapp-gitlab | `45a3e56a` | None | [#6](https://github.com/vergissberlin/railwayapp-gitlab/pull/6) |
| railwayapp-grafana | `7b68b640` | [v0.2.0](https://github.com/vergissberlin/railwayapp-grafana/releases/tag/v0.2.0) | [#14](https://github.com/vergissberlin/railwayapp-grafana/pull/14) |
| railwayapp-homeassistant | `e5a0e7c0` | None | [#3](https://github.com/vergissberlin/railwayapp-homeassistant/pull/3) |
| railwayapp-influxdb | `da4234e5` | [v0.2.0](https://github.com/vergissberlin/railwayapp-influxdb/releases/tag/v0.2.0) | [#14](https://github.com/vergissberlin/railwayapp-influxdb/pull/14) |
| railwayapp-mqtt | `bf6ba0f0` | [v0.2.0](https://github.com/vergissberlin/railwayapp-mqtt/releases/tag/v0.2.0) | [#11](https://github.com/vergissberlin/railwayapp-mqtt/pull/11) |
| railwayapp-nodered | `b7a20eb7` | [railwayapp-nodered-v0.2.5](https://github.com/vergissberlin/railwayapp-nodered/releases/tag/railwayapp-nodered-v0.2.5) | [#30](https://github.com/vergissberlin/railwayapp-nodered/pull/30) |
| railwayapp-opensearch | `93a02145` | [railwayapp-opensearch-v0.2.0](https://github.com/vergissberlin/railwayapp-opensearch/releases/tag/railwayapp-opensearch-v0.2.0) | [#12](https://github.com/vergissberlin/railwayapp-opensearch/pull/12) |
| railwayapp-typo3 | `e3705fd6` | [v0.2.0](https://github.com/vergissberlin/railwayapp-typo3/releases/tag/v0.2.0) | [#11](https://github.com/vergissberlin/railwayapp-typo3/pull/11) |
| railwayapp-postgresql | `244b6b5f` | [v0.1.1](https://github.com/vergissberlin/railwayapp-postgresql/releases/tag/v0.1.1) | [#10](https://github.com/vergissberlin/railwayapp-postgresql/pull/10) |
| railwayapp-mysql | `10fda35b` | [v0.1.1](https://github.com/vergissberlin/railwayapp-mysql/releases/tag/v0.1.1) | [#14](https://github.com/vergissberlin/railwayapp-mysql/pull/14) |
| railwayapp-mongodb | `a15485d8` | [v0.2.0](https://github.com/vergissberlin/railwayapp-mongodb/releases/tag/v0.2.0) | [#13](https://github.com/vergissberlin/railwayapp-mongodb/pull/13) |
| railwayapp-n8n | `7a7c0629` | [v0.1.1](https://github.com/vergissberlin/railwayapp-n8n/releases/tag/v0.1.1) | [#10](https://github.com/vergissberlin/railwayapp-n8n/pull/10) |
| railwayapp-nodejs | `d4849fce` | [v0.1.1](https://github.com/vergissberlin/railwayapp-nodejs/releases/tag/v0.1.1) | [#12](https://github.com/vergissberlin/railwayapp-nodejs/pull/12) |
| railwayapp-redis | `f65c0732` | [v0.1.1](https://github.com/vergissberlin/railwayapp-redis/releases/tag/v0.1.1) | [#9](https://github.com/vergissberlin/railwayapp-redis/pull/9) |
| railwayapp-flask | `5ce2fe09` | None | None |
| railwayapp-django | `9a18f6be` | None | None |
| railwayapp-fastapi | `aab32b4f` | [v0.1.1](https://github.com/vergissberlin/railwayapp-fastapi/releases/tag/v0.1.1) | [#16](https://github.com/vergissberlin/railwayapp-fastapi/pull/16) |
| railwayapp-flowise | `8c31329b` | [v0.1.1](https://github.com/vergissberlin/railwayapp-flowise/releases/tag/v0.1.1) | [#9](https://github.com/vergissberlin/railwayapp-flowise/pull/9) |
| railwayapp-mjml | `6a83270c` | [railwayapp-mjml-v1.1.2](https://github.com/vergissberlin/railwayapp-mjml/releases/tag/railwayapp-mjml-v1.1.2) | [#21](https://github.com/vergissberlin/railwayapp-mjml/pull/21) |
| railwayapp-openwebui | `cc03e721` | [railwayapp-openwebui-v0.2.0](https://github.com/vergissberlin/railwayapp-openwebui/releases/tag/railwayapp-openwebui-v0.2.0) | None |
| railwayapp-outerbase-studio | `55a50710` | [railwayapp-outerbase-studio-v0.2.0](https://github.com/vergissberlin/railwayapp-outerbase-studio/releases/tag/railwayapp-outerbase-studio-v0.2.0) | [#4](https://github.com/vergissberlin/railwayapp-outerbase-studio/pull/4) |
| railwayapp-cloudbeaver-ce | `31ec265a` | [railwayapp-cloudbeaver-ce-v0.2.0](https://github.com/vergissberlin/railwayapp-cloudbeaver-ce/releases/tag/railwayapp-cloudbeaver-ce-v0.2.0) | [#4](https://github.com/vergissberlin/railwayapp-cloudbeaver-ce/pull/4) |
| railwayapp-operately | `56cc5c71` | [railwayapp-operately-v0.2.0](https://github.com/vergissberlin/railwayapp-operately/releases/tag/railwayapp-operately-v0.2.0) | [#6](https://github.com/vergissberlin/railwayapp-operately/pull/6) |

Verification: each updated gitlink resolves to a fetched remote commit; all submodule working trees were clean before synchronization. Release versions and tags were not created manually. `TMPDIR=/tmp pnpm run test:coverage:check` passed all 207 tests with 100% line/function coverage and 94.22% branch coverage; `git diff --check` passed.
