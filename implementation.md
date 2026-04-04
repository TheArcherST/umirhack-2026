# Implementation Proposal

This document translates `whitepaper.md` into a concrete implementation plan.

The main conclusion is that the current codebase models the wrong thing. It is centered on `agent -> check -> check_task`, while the whitepaper is centered on `project -> environment -> host -> telemetry -> metrics -> graph`.

Because there are no external dependents, the implementation should prefer a clean domain reset over compatibility with the current APIs, table names, package names, or agent protocol.

## 1. Core decisions

### 1.1 Replace the current domain model

Do not evolve `Check`, `CheckTask`, `Resource`, SSH keypair management, or the current push-style agent execution flow. Those concepts do not match the whitepaper and will distort the implementation if retained.

### 1.2 Host is the primary infrastructure entity

Per clause 5, host identity is environment-scoped agent identity. In practice:

- `Agent` is the runtime/process identity that authenticates with the backend.
- `Host` is the environment-local domain entity exposed to users and used in graphs.
- The same agent may produce multiple hosts if it is attached to multiple environments.
- The stable semantic key is `(environment_id, agent_id)`.
- Use a surrogate `host.id` for joins and APIs, but enforce uniqueness on `(environment_id, agent_id)`.

This matches the current frontend registration flow, where the user first creates an agent identity and assigns it to one or more environments, and the installed runtime later binds to that identity.

### 1.3 Environment scope must be explicit everywhere

Per clauses 3, 4, 6, and 7, almost all execution and telemetry is environment-scoped.

That means:

- `TaskTemplate` may be reusable, but `TaskRun` is always bound to exactly one environment.
- `TelemetryRecord` is always bound to exactly one environment and one host.
- Metrics are computed per `(environment, host, metric kind)`.
- Graph edges are materialized per environment, not globally.

Do not hide environment scope behind implicit joins or “current project” assumptions.

### 1.4 Raw telemetry is immutable; graph and metrics are projections

This is the single most important architectural choice.

Store task output as immutable raw telemetry records. Build derived views on top:

- host metadata projection
- metric snapshots
- graph edge snapshots

Do not treat the graph as the source of truth. The graph is a read model derived from telemetry.

This directly matches clauses 7, 8, 9, and 10.

### 1.5 Use a pull-based agent protocol

Per clause 4, the host agent pulls tasks from the backend.

This means the current backend flow that SSH-connects into the agent and POSTs `/check` is the wrong model and should be deleted.

Replace it with:

- agent registration
- heartbeat / capability sync
- task polling with leases
- result upload
- failure / cancellation reporting

### 1.6 Keep the backend a modular monolith

The meaningful change is the domain model, not microservice decomposition.

Keep one Python backend codebase and one Postgres database. Split code by domain modules, not by prematurely separate services.

The recommended runtime is:

- `api`: FastAPI service for UI and agent APIs
- `worker`: background process for schedule expansion, stale lease recovery, metric recomputation, graph materialization
- `react`: frontend
- `agent-rs`: Rust daemon

### 1.7 Remove Redis from the critical path

For this system, Postgres is enough for:

- task queue state
- leases
- CRON schedule expansion
- materialization bookkeeping

Using Postgres with `FOR UPDATE SKIP LOCKED` is simpler and makes task lifecycle transactional with the rest of the domain state.

Redis can be reintroduced later if a real bottleneck appears. It is not a meaningful architectural requirement for the whitepaper.

### 1.8 Preserve the current product shape where it matches intent

The current frontend already encodes several valid product intentions that should be preserved in the rewrite:

- project-scoped workspace
- environment grouping and selection
- project members and per-environment access
- token/script-based agent onboarding
- agent list and online/offline status
- operator-facing task history
- task result and log inspection

The whitepaper should refine those flows, not replace them with a graph-only product. The graph is the primary environment overview, but not the only operational interface.

## 2. Target domain model (may be changed during implementation process if changes are makes sense)

### 2.1 Projects and environments

`project`
- `id`
- `name`
- `created_at`

`environment`
- `id`
- `project_id`
- `name`
- `created_at`

`project_member`
- `project_id`
- `user_id`
- `role` (`admin`, `member`)
- `invite_status` (`pending`, `accepted`)
- `invited_at`

`environment_member`
- `environment_id`
- `user_id`
- `role` (`operator`, `observer`)
- `assigned_at`

The current product understanding expects both project-level membership and environment-level role assignment. Keep both concepts explicit in the backend instead of collapsing access control into one table.

### 2.2 Agents and hosts

`agent`
- `id`
- `project_id`
- `name`
- `registration_token_hash`
- `declared_os`
- `status` (`online`, `offline`, `stale`)
- `last_seen_at`
- `agent_version`
- `capabilities_json`
- `created_at`

`agent_bootstrap_token`
- `id`
- `agent_id`
- `token_hash`
- `expires_at nullable`
- `revoked_at nullable`
- `created_at`

`host`
- `id`
- `environment_id`
- `agent_id`
- `kind`
- `internal_identifier`
- `descriptive_fields_json`
- `os_name nullable`
- `hostname nullable`
- `primary_ipv4 nullable`
- `primary_ipv6 nullable`
- `metadata_last_refreshed_at nullable`
- `created_at`

Notes:

- Enforce a unique constraint on `(environment_id, agent_id)`.
- `kind`, `internal_identifier`, and `descriptive_fields_json` implement clause 1 directly.
- `os_name`, `hostname`, and addressing fields are projections from bootstrap telemetry per clause 8.
- `descriptive_fields_json` should remain flexible JSONB. Do not over-normalize early.
- If the same agent belongs to two environments, that yields two host rows with independent telemetry histories.
- The current frontend flow that creates an agent first and then copies an install script should map to `agent` plus one or more active `agent_bootstrap_token` records.

### 2.3 Task definitions and runs

`task_template`
- `id`
- `project_id`
- `kind`
- `schema_version`
- `name`
- `payload_json`
- `metric_policy_json`
- `created_at`

`schedule_rule`
- `id`
- `environment_id`
- `task_template_id`
- `cron_expr`
- `target_selector_json`
- `is_enabled`
- `created_at`

`task_run`
- `id`
- `environment_id`
- `host_id`
- `agent_id`
- `task_template_id`
- `schedule_rule_id nullable`
- `status` (`queued`, `leased`, `running`, `succeeded`, `failed`, `cancelled`, `expired`)
- `lease_token nullable`
- `leased_until nullable`
- `attempt_no`
- `queued_at`
- `started_at nullable`
- `finished_at nullable`
- `failure_reason nullable`

`task_run_result`
- `task_run_id unique`
- `exit_code nullable`
- `stdout_text nullable`
- `stderr_text nullable`
- `summary_json nullable`
- `created_at`

Important rules:

- `TaskTemplate` describes what to collect.
- `ScheduleRule` describes when and where to run it.
- `TaskRun` is the actual execution unit.
- Keep `target_selector_json` simple in v1: explicit host IDs or “all hosts in environment”.
- Store both `host_id` and `agent_id`. `host_id` expresses the analysis entity, while `agent_id` is the runtime executor.
- Not every task kind must produce telemetry. Some tasks produce execution output and logs only.
- Keep manual task creation as a first-class flow in addition to scheduled execution, because the current frontend and the original task statement both expect operator-triggered runs.

Do not build a generic arbitrary targeting language yet.

### 2.4 Telemetry

`telemetry_record`
- `id`
- `task_run_id unique`
- `environment_id`
- `host_id`
- `kind`
- `schema_version`
- `collected_at`
- `payload_json`
- `payload_hash`
- `size_bytes`
- `created_at`

This table is the raw fact log.

Rules:

- Immutable after insertion.
- One task run produces zero or one telemetry records in v1.
- Use JSONB plus typed validators at the application layer.
- Version every payload schema from day one.
- Command-style diagnostic tasks may produce only `task_run_result` and no `telemetry_record`.

### 2.5 Metrics

`metric_definition`
- `id`
- `kind`
- `input_telemetry_kind`
- `schema_version`
- `config_json`

`metric_snapshot`
- `id`
- `environment_id`
- `host_id`
- `metric_kind`
- `computed_at`
- `window_start nullable`
- `window_end nullable`
- `value_json`

This is enough for the whitepaper intent. If time-series volume becomes large later, move snapshots to a dedicated time-series extension, but not now.

To stay aligned with the current whitepaper, v1 metrics remain host-scoped. However, the computation pipeline should not assume that all future metrics are host-local. Connectivity-derived summaries may later justify a separate edge-scoped snapshot model.

### 2.6 Graph projections

`graph_edge_snapshot`
- `id`
- `environment_id`
- `source_host_id`
- `target_type` (`host`, `endpoint`)
- `target_host_id nullable`
- `target_endpoint nullable`
- `edge_kind`
- `derived_from_telemetry_id`
- `fresh_at`
- `stale_at nullable`
- `value_json`

This is the environment graph read model.

Important rule: create graph edges only from telemetry types that explicitly define graph semantics. Do not let arbitrary telemetry automatically become edges.

## 3. Telemetry taxonomy

The whitepaper needs typed telemetry, not generic command output blobs. At the same time, the current frontend and original task brief both expect bounded diagnostic command execution, so the protocol should support both structured collectors and a restricted command task type.

Create a new protocol package with explicit task kinds and result schemas.

Recommended initial telemetry kinds:

- `host.system_profile`
  - OS name
  - hostname
  - kernel / platform version
- `host.ip_interfaces`
  - IPv4 / IPv6 addresses
  - interface names
  - MAC addresses if available
- `host.interface_stats`
  - counters and errors snapshot
- `network.endpoint_connectivity`
  - source host
  - target endpoint
  - protocol
  - latency
  - DNS resolution result
  - TCP connect result
  - TLS details if HTTPS
  - HTTP status if HTTP/S

Recommended initial template set, aligned with the current frontend patch:

- `ping`
- `system_info`
- `network_interfaces`
- `port_scan`
- `disk_usage`
- `memory_cpu`
- `service_status`
- `system_logs`

Recommended non-telemetry task kind:

- `diagnostic.command`
  - executes only predefined, backend-approved commands
  - stores `stdout`, `stderr`, and `exit_code` in `task_run_result`
  - may optionally emit structured telemetry if a parser is configured for that template

Do not reuse the current “checks” naming. Rename the whole protocol around telemetry collection.

## 4. Agent architecture

The whitepaper explicitly requires a Rust daemon. That should be implemented as a new top-level workspace, not by evolving the current Python agent.

### 4.1 Agent responsibilities

The Rust agent should:

- register itself with the backend using a bootstrap token
- persist assigned identity locally
- heartbeat on a fixed interval
- pull due tasks with long-polling
- execute one or more tasks concurrently with bounded worker count
- upload results
- report failures and partial execution metadata

### 4.2 Agent execution model

Use:

- `tokio` for async runtime
- `reqwest` for HTTPS backend communication
- `serde` for protocol types
- trait-based collectors per task kind

Collector trait:

```rust
trait Collector {
    fn kind(&self) -> &'static str;
    async fn collect(&self, payload: serde_json::Value) -> anyhow::Result<serde_json::Value>;
}
```

In implementation, hide raw `serde_json::Value` behind typed payload structs at collector boundaries.

### 4.3 Bootstrap tasks

Per clause 8, automatically assign one-shot bootstrap tasks when a new agent comes online:

- collect system profile
- collect IP interface configuration

Those tasks populate host metadata projection fields:

- `os_name`
- `hostname`
- `primary_ipv4`
- `primary_ipv6`

This metadata is not user-entered truth. It is discovered truth derived from telemetry.

Because host identity is environment-scoped, bootstrap tasks should be materialized per host, not just per agent. If one agent belongs to three environments, each environment-local host should receive its own bootstrap task runs and metadata projection updates.

Even if the initial product behavior keeps these inspections one-shot, the projection code should remain idempotent so the same bootstrap task kinds can be rerun later without schema changes.

## 5. Backend runtime architecture

### 5.1 API surface split

Split the backend into two logical API surfaces:

- control plane API for frontend
- agent plane API for Rust agents

Possible endpoints:

Control plane:

- `POST /auth/login`
- `POST /auth/register`
- `POST /projects`
- `GET /projects`
- `POST /projects/{id}/members/invite`
- `PUT /projects/{id}/members/{user_id}/role`
- `POST /environments`
- `POST /environments/{id}/members/{user_id}/role`
- `POST /agents/bootstrap-tokens`
- `GET /agents`
- `PUT /agents/{id}`
- `DELETE /agents/{id}`
- `GET /agents/{id}/install-script`
- `GET /agents/{id}/task-runs`
- `GET /environments/{id}/hosts`
- `GET /environments/{id}/graph`
- `GET /hosts/{id}`
- `GET /hosts/{id}/telemetry`
- `GET /hosts/{id}/metrics`
- `POST /task-templates`
- `POST /schedule-rules`
- `POST /task-runs`
- `GET /task-runs/{id}`
- `GET /task-runs/{id}/result`

Agent plane:

- `POST /agent/register`
- `POST /agent/heartbeat`
- `POST /agent/pull-tasks`
- `POST /agent/task-runs/{id}/start`
- `POST /agent/task-runs/{id}/complete`
- `POST /agent/task-runs/{id}/fail`

### 5.2 Worker responsibilities

One worker process is enough in v1. It should handle:

- schedule expansion: CRON -> task runs
- stale lease recovery
- metric recomputation
- graph edge materialization
- bootstrap task enqueueing after new agent registration or first heartbeat
- real-time fanout hooks for task/agent status updates if WebSocket or SSE is added

Do not keep separate `bindingd`, `tasksd`, and `heartbeatd`. Those are artifacts of the wrong execution model.

### 5.3 Queueing and leases

The clean model is:

1. Worker inserts `task_run(status='queued')`.
2. Agent polls for work in its environments.
3. Backend atomically leases matching rows and returns them.
4. Agent reports start, completion, or failure.
5. Worker requeues expired leases.

Use short leases and idempotent completion handlers.

## 6. Graph implementation

Clause 9 says the environment is represented as a graph. That should be implemented as a projection, not as a hand-edited graph editor.

### 6.1 Vertices

Vertices are environment-scoped hosts:

- environment-local host identity
- latest metadata
- freshness timestamps
- health summary

### 6.2 Edges

In v1, only materialize `network.endpoint_connectivity` into edges, per clause 10.

Rules:

- one successful or failed connectivity telemetry record yields one edge snapshot
- source is always a host in the environment
- target is an endpoint vertex
- if target endpoint resolves to another known host in the same project, optionally attach `target_host_id` as a derived link

### 6.3 Freshness

A graph edge is not eternal. The UI needs freshness semantics.

Recommended policy:

- every edge stores `fresh_at`
- worker sets `stale_at` when superseded or outside freshness window
- graph API returns only non-stale latest edges by default

## 7. Metrics implementation

Clause 7 requires built-in derived telemetry. Keep this intentionally narrow at first.

Implement built-in metric calculators for:

- endpoint connectivity success rate
- endpoint connectivity latency summary
- host interface error rate

Design rules:

- metric calculators are pure functions from telemetry window -> metric value
- metric output is versioned
- metric recomputation is triggered by new telemetry insertion

Do not let metric code query the graph. Metrics derive from raw telemetry, not from graph projections.

## 8. Frontend implications

The current frontend is already expressing a coherent product, not just arbitrary stubs. The implementation should align with that product shape while upgrading the underlying domain model.

Recommended pages:

- Dashboard
- Agent list
- Agent task history
- Task result/log view
- Project members
- Member detail / role assignment
- Environment dashboard
- Environment hosts list
- Environment graph
- Host detail
- Environment task history
- Schedules
- Task templates

### 8.1 Dashboard and navigation

Keep the current high-level navigation model:

- project selector
- environment selector
- dashboard
- agents
- members
- profile/settings

The dashboard should remain an operator overview page with:

- total/online agent counts
- recent task runs
- environment summaries
- links into detailed task and environment views

### 8.2 Agent and task views

Preserve the current operator workflow:

- list agents with status, OS, environments, and last heartbeat
- create/edit/delete agent records
- issue an install script per agent
- inspect per-agent task history
- open a task result/log modal or page with stdout, stderr, exit code, and timing

This means the backend must expose task results as first-class data, not only telemetry records.

### 8.3 Environment graph page

Show:

- host vertices
- connectivity edges
- freshness state
- last metric summaries on hover / side panel

Do not compute graph topology in the browser from raw telemetry blobs. Call a dedicated graph API.

### 8.4 Environment detail views

The recent frontend patch adds a valuable environment-local navigation model:

- environment dashboard
- environment hosts list
- environment task history
- environment host detail

That direction is aligned with the whitepaper and should be preserved. It complements the project-level agent views instead of replacing them.

Recommended environment dashboard content:

- environment health summary
- recent task runs in the environment
- quick navigation into hosts and tasks
- graph entry point

### 8.5 Host detail page

Show:

- discovered metadata
- environment-local telemetry and metrics
- latest telemetry by type
- metric trends
- raw telemetry history timeline
- recent task runs that contributed to the current state

The current frontend patch also introduces specific host-detail panels for:

- system information
- interfaces and IP addresses
- detected services
- detected ports

Those should be implemented as views over typed telemetry and derived summaries, not as ad hoc host-only APIs with unrelated schemas.

### 8.6 Membership and access control

Use this role split:

- project membership and invites
- project-level roles: `admin`, `member`
- environment-specific roles: `operator`, `observer`
- authenticated UI sessions

Permission boundary:

- project `admin` manages project structure and identities
- project `member` has no global management power by default
- environment `operator` works with hosts, telemetry, schedules, task runs, and results inside one environment
- environment `observer` is read-only inside one environment

Project-admin-only actions:

- create, edit, delete, suspend, or rebind agents
- issue or rotate install/bootstrap tokens
- attach or detach agents to environments
- invite/remove members
- change project roles
- change environment roles
- create or delete environments

Environment-operator actions:

- view hosts, telemetry, metrics, graph, task history, and task results
- create manual task runs in the environment
- manage schedules and task templates available in the environment
- perform environment-local host operations that do not mutate project-scoped agent identity

Environment-observer actions:

- read-only access to environment-local hosts, telemetry, metrics, graph, task history, and task results

This boundary should be reflected consistently in backend policy checks and frontend affordances.

### 8.7 Constrain, do not delete, command-style tasks

The current frontend language around “command” and “task log” is not purely legacy noise. It reflects a real operator need and matches the original task statement.

The right adjustment is:

- keep command execution as an explicit task kind
- restrict it to approved templates and predefined commands
- present structured telemetry tasks and command tasks in the same task-run UX
- avoid turning the platform into a generic remote shell

The newer frontend patch improves this further by moving task creation toward template-based runs instead of free-form command entry. That is a good direction and should become the default UX.

### 8.8 Current frontend conflicts to resolve

The recent environment-focused frontend patch is directionally useful, but it still contains one major conceptual mismatch with the current whitepaper and implementation model:

- it treats environment hosts as if they were just agents filtered by environment
- it uses `hostId == agent.id` in routes and data fetching
- host details are currently loaded by agent identity rather than by environment-scoped host identity

This should not be preserved.

The correct target model is:

- project-level agent views work with `agent.id`
- environment-level host views work with `host.id`
- the same agent may appear as multiple hosts across environments

There is also a smaller RBAC mismatch in current frontend types left over from earlier thinking:

- project member role types still include environment-style roles in some places
- some environment-role typing still mentions `admin`

Those type definitions should be corrected as the frontend is migrated onto the new backend contracts.

## 10. Migration strategy

There is no reason to preserve old behavior externally, but an internal phased rollout is still useful to control complexity.

### Phase 1. Introduce the new domain skeleton

- create new tables
- add control plane API skeleton
- add agent plane API skeleton
- add auth, membership, and role models
- keep legacy code untouched but isolated

### Phase 2. Implement Rust agent and registration flow

- implement registration, heartbeat, polling, result upload
- remove SSH connector dependency from the new path

### Phase 3. Implement bootstrap telemetry

- `host.system_profile`
- `host.ip_interfaces`
- host metadata projection refresh

At this point the platform can discover and render hosts meaningfully.

### Phase 4. Implement scheduled telemetry

- manual task runs
- task templates
- CRON schedule rules
- task run leases
- stale lease recovery
- task result/log storage APIs and UI wiring

### Phase 5. Implement graph and metrics

- endpoint connectivity telemetry
- graph edge projection
- first built-in metric calculators
- environment graph UI
- dashboard aggregation queries

### Phase 6. Delete legacy pipeline

- remove old check APIs
- remove Taskiq/Redis path if no longer needed
- remove Python agent
- preserve agent/task/member UI surfaces while swapping them onto the new APIs

## 11. Meaningful breaking changes

These changes are intentional and should not be softened:

- delete the `check` / `check_task` vocabulary
- delete SSH push execution
- delete the Python agent
- stop modeling user-visible infrastructure around agents alone
- stop treating graph data as manually authored primary state
- stop modeling every task as an untyped shell command

## 12. What should stay

Not everything needs to be rewritten.

Reasonable things to keep:

- FastAPI
- SQLAlchemy + Alembic
- React app shell, auth flow, project/environment navigation, and member-management UX
- Postgres as the primary store

What should not stay:

- current domain tables
- current queue / daemon split
- current protocol naming
- current agent transport model

## 13. Final recommendation

Implement this as a deliberate platform rewrite inside the existing repository, not as an incremental adaptation of the current `check` system.

The critical architectural choices are:

- model hosts and telemetry explicitly
- make environment scope first-class
- preserve project/member/role and operator task-management flows already present in the frontend
- store raw telemetry immutably
- store task results/logs alongside telemetry, not instead of telemetry
- derive metrics and graph as projections
- switch to pull-based Rust agents
- simplify runtime around Postgres-backed scheduling and leases

If those choices are made early, the rest of the whitepaper follows naturally. If they are not made early, the codebase will keep accumulating adapters around a domain model that is fundamentally incorrect for the intended product.
