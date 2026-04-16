# Dashboard FWX Integration Design

## Summary

This design defines the first-stage integration of the selected `fanchmwrt-packages` capabilities into `luci-app-dashboard`.

The target is not a direct code transplant. The target is a single-page LuCI dashboard shell backed by a modular internal architecture that works on standard OpenWrt without requiring `fwxd` or `kmod-fwx`.

Stage 1 covers these functional areas:

- Dashboard
- Dashboard setting
- User management and user detail views
- Network settings
- System settings
- Internet record settings
- Feature library

Stage 1 does not include:

- App filter
- MAC filter
- Any feature that requires deep `fwx` kernel-assisted app classification semantics for correctness

## Goals

- Keep `/admin/dashboard` as the single entry page.
- Preserve a dashboard-first interaction model instead of restoring the original multi-page `fwx` navigation tree.
- Replace `fwx` backend dependencies with standard OpenWrt-compatible data sources and configuration storage.
- Refactor the current dashboard into a modular backend and frontend instead of continuing to expand the existing controller and template files.
- Support graceful degradation when optional runtime capabilities such as `nlbwmon`, DNS logs, or a feature package are missing.

## Non-Goals

- Full behavioral equivalence with `fwxd`-powered installations.
- Integration of `luci-app-fwx-appfilter`.
- Integration of `luci-app-fwx-macfilter`.
- A full SPA rewrite with a new frontend toolchain.
- Recreating `fwx`-specific deep application recognition accuracy on ordinary OpenWrt.

## Scope Decisions Confirmed

The user confirmed the following product and implementation decisions:

- Implementation target: real integration into `luci-app-dashboard`, not a menu wrapper.
- Stage 1 scope: `dashboard + dashboard-setting + user + network + system + record + feature`.
- UI direction: single-page shell.
- Runtime target: standard OpenWrt compatibility first, not `fwx`-only.
- Information density: overview-first, with lower-frequency content folded or lazy-loaded.
- Mutability: some high-frequency configuration is writable from the single page, but not every possible setting.
- Integration approach: single-page shell with a modular kernel.

## Architecture

The implementation is split into four layers.

### 1. Controller Layer

File:

- `luasrc/controller/dashboard.lua`

Responsibilities:

- Register the `/admin/dashboard` entry.
- Validate session/auth for API access.
- Dispatch API requests to feature-specific modules.
- Stop owning business logic directly.

The current controller already contains mixed responsibilities:

- page rendering
- local API handlers
- future route loading for `luci.dashboard.*`

Stage 1 restructures this so that the controller becomes a thin router and auth boundary.

### 2. API Layer

Planned module namespace:

- `luasrc/dashboard/api/overview.lua`
- `luasrc/dashboard/api/users.lua`
- `luasrc/dashboard/api/network.lua`
- `luasrc/dashboard/api/system.lua`
- `luasrc/dashboard/api/record.lua`
- `luasrc/dashboard/api/feature.lua`
- `luasrc/dashboard/api/settings.lua`

Responsibilities:

- Parse request arguments.
- Validate user input.
- Call service-layer functions.
- Return JSON using a unified response schema.

### 3. Service Layer

Planned module namespace:

- `luasrc/dashboard/services/overview.lua`
- `luasrc/dashboard/services/users.lua`
- `luasrc/dashboard/services/network.lua`
- `luasrc/dashboard/services/system.lua`
- `luasrc/dashboard/services/record.lua`
- `luasrc/dashboard/services/feature.lua`
- `luasrc/dashboard/services/settings.lua`

Responsibilities:

- Express dashboard business semantics.
- Merge and normalize data from multiple sources.
- Enforce feature-level rules and capability-based fallbacks.

Examples:

- Merge DHCP leases, ARP data, stored nicknames, and optional traffic stats into a user list.
- Translate UCI and `ubus` network state into dashboard network forms and summaries.
- Build the overview payload used by the single-page shell.

### 4. Source / Adapter Layer

Planned module namespace:

- `luasrc/dashboard/sources/system.lua`
- `luasrc/dashboard/sources/network.lua`
- `luasrc/dashboard/sources/leases.lua`
- `luasrc/dashboard/sources/arp.lua`
- `luasrc/dashboard/sources/nlbwmon.lua`
- `luasrc/dashboard/sources/domains.lua`
- `luasrc/dashboard/sources/feature.lua`
- `luasrc/dashboard/sources/config.lua`

Responsibilities:

- Read system state from OpenWrt-native sources.
- Read and write dashboard-owned configuration.
- Avoid page or business-specific logic.

### Shared Infrastructure

Planned shared helpers:

- `luasrc/dashboard/http.lua`
- `luasrc/dashboard/response.lua`
- `luasrc/dashboard/session.lua`
- `luasrc/dashboard/validation.lua`
- `luasrc/dashboard/capabilities.lua`

Responsibilities:

- Common HTTP helpers
- JSON success/error writers
- Session validation
- Argument validation
- Runtime capability detection

## Frontend Design

The product remains a single page, but the page is no longer implemented as one giant template script.

### Single-Page Shell

Primary view:

- `luasrc/view/dashboard/main.htm`

Responsibilities after refactor:

- Render the page shell only.
- Define static layout zones.
- Load shared frontend scripts.
- Host containers for overview, foldable modules, and drawers/modals.

### Frontend Modules

Planned static assets:

- `htdocs/luci-static/dashboard/app.js`
- `htdocs/luci-static/dashboard/sections-overview.js`
- `htdocs/luci-static/dashboard/sections-users.js`
- `htdocs/luci-static/dashboard/sections-network.js`
- `htdocs/luci-static/dashboard/sections-system.js`
- `htdocs/luci-static/dashboard/sections-record.js`
- `htdocs/luci-static/dashboard/sections-feature.js`
- `htdocs/luci-static/dashboard/sections-settings.js`

Responsibilities:

- Hydrate the page shell.
- Fetch data per section.
- Own rendering and event handling for each section.
- Lazy-load lower-frequency sections on first expansion where appropriate.

This keeps the user experience as a single page without preserving the current monolithic `main.htm` implementation style.

## Single-Page Layout

The page is organized as overview-first, then expandable or heavier modules below.

### Top Overview Zone

Always visible on first load:

- System summary
- Network status
- Real-time traffic
- Online devices
- Active domains

This remains the primary first-screen dashboard view.

### User Center

Displayed inside the single page:

- Paginated user/device table
- Online status
- Current rate
- Today traffic
- Common apps where available
- Current domain or URL where available
- Nickname editing

User detail no longer navigates to a separate page in Stage 1. It opens inside the same page via a drawer or modal with tabs:

- Basic info
- App statistics
- Today traffic
- Today top apps
- Visit records

### Network Settings

Shown as one feature area with three foldable sub-panels:

- LAN
- WAN
- Work mode

Only high-frequency configuration is exposed directly.

### System Settings

Stage 1 only exposes settings needed to support dashboard data correctness, especially:

- `lan_ifname`

### Record Settings

Exposed inline:

- enable
- record retention time
- app valid time
- history data size
- history data path
- clean history action

### Feature Library

Exposed inline:

- current version
- format
- app count
- feature class list
- upload trigger
- upgrade status

### Dashboard Settings

Exposed inline:

- monitor interface / monitor device selection

## Writable Configuration in Stage 1

Stage 1 writes only these settings from the single page.

### Dashboard Settings

- `monitor_device`

### Network Settings

- LAN protocol and addressing
- LAN DNS
- LAN DHCP settings
- WAN protocol and addressing
- WAN PPPoE credentials
- dashboard-owned `work_mode`

### System Settings

- `lan_ifname`

### Record Settings

- `enable`
- `record_time`
- `app_valid_time`
- `history_data_size`
- `history_data_path`
- `clean_all_data`

### Feature Library

- Upload feature package
- Query upgrade state

## API Design

All Stage 1 APIs are moved under a single root:

- `/admin/dashboard/api/`

### Response Format

Success:

```json
{
  "ok": true,
  "data": {},
  "meta": {}
}
```

Failure:

```json
{
  "ok": false,
  "error": {
    "code": "invalid_arg",
    "message": "invalid IPv4 address"
  }
}
```

This replaces the current inconsistent mix of raw JSON objects, `code=2000`, and ad hoc fallback payloads.

### Stage 1 Endpoints

Overview:

- `GET /admin/dashboard/api/overview`

Users:

- `GET /admin/dashboard/api/users`
- `GET /admin/dashboard/api/users/detail?mac=AA%3ABB%3ACC%3ADD%3AEE%3AFF`
- `POST /admin/dashboard/api/users/nickname`

Network:

- `GET /admin/dashboard/api/network/lan`
- `POST /admin/dashboard/api/network/lan`
- `GET /admin/dashboard/api/network/wan`
- `POST /admin/dashboard/api/network/wan`
- `GET /admin/dashboard/api/network/work-mode`
- `POST /admin/dashboard/api/network/work-mode`

System:

- `GET /admin/dashboard/api/system/config`
- `POST /admin/dashboard/api/system/config`

Record:

- `GET /admin/dashboard/api/record/base`
- `POST /admin/dashboard/api/record/base`
- `POST /admin/dashboard/api/record/action`

Feature:

- `GET /admin/dashboard/api/feature/info`
- `GET /admin/dashboard/api/feature/classes`
- `POST /admin/dashboard/api/feature/upload`
- `GET /admin/dashboard/api/feature/status`

Dashboard settings:

- `GET /admin/dashboard/api/settings/dashboard`
- `POST /admin/dashboard/api/settings/dashboard`

### Overview Aggregation

The overview endpoint is intentionally aggregated.

It returns:

- system summary
- network summary
- traffic summary
- device summary
- domain summary
- capability flags

Example shape:

```json
{
  "ok": true,
  "data": {
    "system": {},
    "network": {},
    "traffic": {},
    "devices": [],
    "domains": {},
    "capabilities": {
      "nlbwmon": true,
      "domain_logs": true,
      "feature_library": false
    }
  }
}
```

This reduces first-load request fan-out, simplifies capability-based rendering, and gives the frontend one authoritative overview payload.

## Data Sources on Standard OpenWrt

Stage 1 intentionally targets standard OpenWrt instead of `fwx`.

### System Data

Sources:

- `ubus system board`
- `/proc/uptime`
- `/proc/meminfo`
- `/sys/class/thermal/*`
- existing model and firmware detection logic already present in `dashboard.lua`

### Network Data

Sources:

- `ubus network.interface.* status`
- `ubus network.interface dump`
- `uci network`
- `uci dhcp`

### Devices and Users

Sources:

- `/tmp/dhcp.leases`
- `/proc/net/arp`
- dashboard-owned nickname storage
- optional `nlbwmon` data for traffic augmentation

### Domain Activity

Priority order:

1. OpenClash logs
2. `dnsmasq` logs from `logread`
3. unavailable state

### Feature Library

Stage 1 does not reuse `/etc/fwxd/feature.cfg` as the authoritative location.

Instead it introduces dashboard-owned feature storage and metadata handling so the feature module can exist independently of `fwx`.

The original `fwx_feature` implementation writes to:

- `/etc/fwxd/feature.cfg`
- `/www/luci-static/resources/app_icons/`
- `fwxd` process signaling

Stage 1 replaces that design with dashboard-owned locations and status handling.

### Record Data

The original `fwx_record` behavior depends on an `fwx` backend API.

Stage 1 redefines record support around dashboard-managed history snapshots and configuration rather than pretending the `fwx` backend exists.

## Dashboard-Owned Persistence

Stage 1 introduces dashboard-owned configuration and runtime storage.

### Persistent UCI

New UCI config namespace:

- `dashboard`

Initial persistent fields:

- `monitor_device`
- `lan_ifname`
- `work_mode`
- record configuration values
- nickname mappings
- feature metadata as needed

### Runtime Cache

Temporary runtime state:

- `/tmp/dashboard`

### Persistent History Path

Used by record/history features:

- stored under the configured `history_data_path`

History format is intentionally simple in Stage 1:

- JSON or JSONL snapshots

No embedded database is introduced in this stage.

## Capability Detection and Degradation

Graceful degradation is a first-class requirement.

### If `nlbwmon` Is Missing

- Device list still works.
- User traffic ranking and detailed per-user traffic become unavailable.
- UI shows an explicit degraded-state message instead of blank data or a 500.

### If Domain Logs Are Unavailable

- Domain module remains visible.
- UI shows that the current runtime environment does not expose a usable domain observation source.

### If No Feature Package Exists Yet

- Feature section remains available.
- It shows empty state plus upload affordance.

### If History Storage Cannot Be Used

- Record section can still show current config.
- Persistent history enablement is disabled or shown as unavailable.

### Work Mode Semantics

On standard OpenWrt, `work_mode` is treated as dashboard-owned behavior and interpretation state.

It does not claim to reconfigure the real data plane in the same way an `fwx` backend could.

### User / App Recognition Limits

Stage 1 does not promise `fwx`-level app classification accuracy.

Where the original `fwx` UX depends on deep kernel-assisted application identification, Stage 1 provides best-effort approximation only and clearly exposes unavailable states where necessary.

## Error Handling

### Input Validation

Validation is centralized in shared helpers.

Fields that require validation include:

- IPv4 addresses
- netmasks
- gateways
- DNS addresses
- PPPoE credentials
- LAN interface names
- feature upload format and size
- record history size and path

### Dangerous Actions

Inline warnings are required for:

- LAN IP changes
- operations that can interrupt current management connectivity
- history cleanup

### Long-Running Actions

These require visible status and non-blocking UX:

- feature upload / extraction / validation
- LAN reconfiguration feedback
- record cleanup

## Testing Strategy

Stage 1 testing is divided into parsing/unit checks, package integration checks, and functional acceptance.

### Parsing and Logic Checks

Add focused tests or testable helper coverage for:

- DHCP lease parsing
- ARP + lease + nickname merge
- domain log parsing
- LAN/WAN input validation
- feature metadata validation

### Integration Verification

- Lua syntax checks for all new modules
- JavaScript syntax checks for new static assets
- package build verification through the existing OpenWrt SDK workflow

The current GitHub Actions workflow in `.github/workflows/release.yml` must continue to produce a buildable IPK for `luci-app-dashboard`.

### Functional Acceptance

Acceptance criteria:

- `/admin/dashboard` renders successfully on standard OpenWrt.
- Missing optional capabilities do not break page rendering.
- Overview data refreshes correctly.
- User list renders and nickname editing works.
- User detail overlay opens and loads section data.
- LAN/WAN/system/record/dashboard-setting reads and writes function with validation and clear feedback.
- Feature upload correctly handles success, invalid format, and oversized files.
- No missing capability produces a blank page or a 500 by default.

## Acceptance Definition

Stage 1 is complete when all of the following are true:

- `luci-app-dashboard` remains a single-page dashboard entry.
- Covered `fwx` Stage 1 features are integrated into that single page.
- The implementation no longer depends on `fwxd` or `kmod-fwx`.
- Backend code is split into controller, API, service, and source layers.
- Frontend code is split into a shell and feature modules.
- The plugin works on standard OpenWrt with graceful degradation.
- The package still builds through CI and produces an installable IPK.

## Risks

### 1. Monolith Regression

If the refactor stops halfway, `dashboard.lua` and `main.htm` can become even larger and harder to maintain.

Mitigation:

- move routing first
- move service logic second
- move frontend section logic into static modules early

### 2. False Equivalence to `fwx`

Some original views imply backend semantics that ordinary OpenWrt does not have.

Mitigation:

- explicitly define capability flags
- do not fake unsupported deep app recognition
- degrade visibly and honestly

### 3. Feature Upload Coupling

The original feature upload path is tightly coupled to `fwxd`.

Mitigation:

- replace storage locations and signaling behavior with dashboard-owned logic
- keep upload validation self-contained

### 4. Single-Page Complexity

A single page can still become operationally dense.

Mitigation:

- use foldable sections
- lazy-load low-frequency modules
- keep heavy detail views in drawers or modals

## Recommended Implementation Order

Recommended order for Stage 1 execution:

1. Introduce shared response, session, validation, and capability helpers.
2. Move routing in `dashboard.lua` to module dispatch.
3. Implement dashboard-owned config storage.
4. Implement overview and capability APIs.
5. Extract frontend shell and static section modules.
6. Implement user list and user detail support.
7. Implement network and system writable sections.
8. Implement record support with dashboard-owned persistence.
9. Implement feature storage, upload, and class rendering.
10. Finalize degradation states and acceptance verification.
