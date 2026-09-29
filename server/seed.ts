import type { Folder, User } from "../shared/types.js";
export const demoUsers: User[] = [
  {
    id: "sunho",
    name: "Sunho Kim",
    initials: "SK",
    color: "#3867db",
    admin: true,
  },
  { id: "alex", name: "Alex Jung", initials: "AJ", color: "#8c5ed5" },
  { id: "yuna", name: "Yuna Kim", initials: "YK", color: "#188477" },
  { id: "min", name: "Min Lee", initials: "ML", color: "#b47b37" },
];
export const seedFolders: Folder[] = [
  {
    path: "",
    name: "Knowledge",
    ownerId: "sunho",
    policy: "local",
    instructions:
      "Distinguish published requirements from proposals. Cite document paths, line ranges, and revisions.",
    description: "A shared home for engineering knowledge.",
  },
  {
    path: "platform",
    name: "Platform Engineering",
    ownerId: "alex",
    policy: null,
    instructions:
      "Preserve normative language. Consider backward compatibility and operational impact.",
    description: "The foundations of our services, APIs, and infrastructure.",
  },
  {
    path: "platform/architecture",
    name: "Architecture",
    ownerId: "sunho",
    policy: "local",
    instructions:
      "Check failure modes, service boundaries, and the reasoning behind architectural decisions.",
    description: "Design decisions and system architecture.",
  },
  {
    path: "platform/api",
    name: "API & Interfaces",
    ownerId: null,
    policy: "cascade",
    instructions:
      "Verify API compatibility, error contracts, and authentication requirements.",
    description: "Stable contracts for connected services.",
  },
  {
    path: "platform/operations",
    name: "Operations",
    ownerId: "yuna",
    policy: null,
    instructions: "Validate rollback steps and monitoring coverage.",
    description: "Runbooks for reliable day-to-day operations.",
  },
  {
    path: "memory",
    name: "Memory Systems",
    ownerId: "alex",
    policy: null,
    instructions:
      "Preserve protocol terminology and verify device-width and mode-specific conditions.",
    description:
      "Specifications and implementation knowledge for memory systems.",
  },
  {
    path: "memory/ddr6",
    name: "DDR6",
    ownerId: null,
    policy: null,
    instructions:
      "Distinguish internal implementation notes from external protocol requirements.",
    description: "Controller and verification specifications.",
  },
  {
    path: "memory/ddr6/timing",
    name: "Timing",
    ownerId: "sunho",
    policy: "local",
    instructions:
      "Check units, min/max, CK/WCK domains, and density-specific values.",
    description: "Timing constraints, clock domains, and refresh behavior.",
  },
  {
    path: "memory/ddr6/refresh",
    name: "Refresh",
    ownerId: "sunho",
    policy: "cascade",
    instructions: "Check temperature-dependent refresh conditions.",
    description: "Refresh commands and self-refresh behavior.",
  },
  {
    path: "verification",
    name: "Verification",
    ownerId: "yuna",
    policy: null,
    instructions:
      "Consider UVM sequences, monitors, scoreboards, and coverage.",
    description: "Verification methodologies and reusable test infrastructure.",
  },
  {
    path: "verification/uvm",
    name: "UVM Environment",
    ownerId: null,
    policy: null,
    instructions:
      "Prefer configuration-driven sequences over hard-coded constants.",
    description: "Testbench architecture and implementation guidelines.",
  },
  {
    path: "getting-started",
    name: "Getting Started",
    ownerId: "sunho",
    policy: null,
    instructions: "Explain terminology for engineers new to the team.",
    description: "Your first steps in our engineering workspace.",
  },
];
export const seedDocuments: Record<string, string> = {
  "platform/architecture/system-overview.md": `# Platform architecture overview

A practical guide to the services, boundaries, and decisions that shape our engineering platform.

> **At a glance** — Small, independently deployable services communicate through versioned APIs. Each service owns its data and its operational responsibilities.

## 1. Design principles

Our platform favors clear ownership and predictable behavior. Choose the simplest design that meets the current requirement and can be operated by the team.

- **Explicit boundaries.** Every service has a named owner and a documented interface.
- **Safe evolution.** Changes preserve compatibility until consumers have migrated.
- **Observable by default.** Logs, metrics, and traces are part of the interface.
- **Recoverable operations.** Every production change has a tested rollback path.

## 2. System components

| Component | Responsibility | Owner |
| --- | --- | --- |
| API gateway | Authentication, routing, rate limits | Platform Engineering |
| Application services | Domain behavior and data integrity | Service owners |
| Event transport | Durable asynchronous delivery | Platform Engineering |
| Observability | Metrics, logging, and alerting | Operations |

## 3. Request lifecycle

1. The gateway authenticates the caller and assigns a request ID.
2. The owning service validates the request and applies domain rules.
3. State changes are committed before asynchronous events are emitted.
4. Responses include a request ID for tracing and support.

\`\`\`http
GET /v1/resources/{resource_id}
Authorization: Bearer <token>
X-Request-ID: <correlation_id>
\`\`\`

## 4. Failure handling

Set explicit timeouts on every network boundary. Retry only idempotent operations, with exponential backoff and jitter. Consumers must tolerate duplicate event delivery.

> **Engineering note** — A timeout does not prove an operation failed. Use idempotency keys when a retry could repeat a state change.

## 5. Related knowledge

See the API design guidelines, service ownership guide, and incident response runbook in this workspace.
`,
  "platform/architecture/service-ownership.md": `# Service ownership guide

Every service has a clearly identified owner responsible for its interfaces, reliability, and documentation.

## Responsibilities

- Review changes to the service contract.
- Maintain operational runbooks and alerts.
- Keep architecture decisions close to the implementation.

## Ownership handover

Record the new owner, review outstanding changes, and schedule a handover walkthrough. Update folder governance so future reviews route to the correct person.
`,
  "platform/architecture/decision-records.md": `# Architecture decision records

Capture decisions with enough context for the next engineer to understand the tradeoffs.

## Template

### Context
Describe the problem and constraints.

### Decision
State the selected approach and the alternatives considered.

### Consequences
Record benefits, costs, and revisit criteria.
`,
  "platform/api/design-guidelines.md": `# API design guidelines

Public interfaces are contracts. Favor consistency and explicit behavior over convenience.

## Versioning

Use a major version in the URL. Additive fields are compatible; removing fields or changing their meaning requires a new major version.

## Error responses

| Field | Meaning |
| --- | --- |
| code | Stable machine-readable error |
| message | Human-readable explanation |
| request_id | Trace correlation identifier |

## Pagination

Use opaque cursors and bounded page sizes. The default page size is 50 and the maximum is 200.
`,
  "platform/operations/incident-response.md": `# Incident response runbook

Restore service safely, communicate clearly, and preserve evidence.

## First response

1. Acknowledge the alert and assign an incident lead.
2. Assess user impact and establish a timeline.
3. Check recent deployments and dependency health.
4. Mitigate using the documented rollback procedure.

## After recovery

Verify recovery with service-level indicators. Record root causes and actionable follow-ups in a blameless review.
`,
  "memory/ddr6/timing/refresh-timing.md": `# DDR6 refresh timing

This document defines timing requirements for refresh operations in DDR6. It is the internal implementation reference for controller and verification teams.

> **Reference example** — These sample values demonstrate the review workflow. Validate against your licensed protocol specification before implementation.

## 1. Scope

Unless explicitly overridden by a mode-specific rule, the parameters in this document apply to normal refresh scheduling. Preserve external protocol language where wording is normative.

## 2. Refresh interval

The controller shall schedule refresh operations according to the tREFI interval. Temperature-dependent behavior must be evaluated before applying this interval.

| Parameter | Nominal | Domain | Source |
| --- | --- | --- | --- |
| tREFI | 3.9 μs | CK | Protocol § 7.4 |
| tRFC | 295 ns | CK | Timing Table 42 |

## 3. Implementation notes

UVM sequences should not hard-code refresh values when the test configuration already provides device density and operating mode.

\`\`\`systemverilog
// Resolve timing from the active device configuration.
refresh_delay = timing_cfg.tRFC;
\`\`\`

## 4. Review guidance

If the external source and internal interpretation disagree, create a change request and cite both sources separately. Verify units, density, operating mode, and clock domain.
`,
  "memory/ddr6/timing/command-timing.md": `# Command timing constraints

Command spacing must respect the active device timing configuration.

## Clock domains

Keep CK-domain and WCK-domain values distinct. Convert values explicitly and document the rounding policy.

## Validation

Cover minimum and maximum timing boundaries in directed tests. Include mode transitions and refresh overlap scenarios.
`,
  "memory/ddr6/timing/wck-relationship.md": `# WCK and CK relationship

The relationship between command and data clocks depends on the configured operating mode.

## Requirements

Track the active ratio in the shared timing configuration. Do not assume one ratio for all speed bins.

## Transitions

Verify synchronization before issuing data commands after a mode transition.
`,
  "memory/ddr6/refresh/self-refresh.md": `# Self-refresh entry and exit

Self-refresh allows the device to retain data while the controller reduces activity.

## Entry

Complete outstanding commands and satisfy the required entry timing.

## Exit

Wait for the configured exit interval before scheduling a normal command. The verification environment should use the same mode-specific source of timing values.
`,
  "verification/uvm/testbench-architecture.md": `# UVM testbench architecture

Our reusable testbench separates stimulus, observation, checking, and coverage.

## Components

| Component | Responsibility |
| --- | --- |
| Sequence | Generate transactions |
| Driver | Apply interface activity |
| Monitor | Observe protocol events |
| Scoreboard | Check expected behavior |

## Configuration

Pass device parameters through a shared configuration object. Keep protocol constants out of individual sequences.
`,
  "verification/uvm/coverage-guidelines.md": `# Functional coverage guidelines

Coverage models describe intent and help expose missing scenarios.

## Review checklist

- Map each bin to a requirement.
- Justify ignored and illegal bins.
- Cross critical modes with boundary values.
- Document exclusions with evidence.
`,
  "getting-started/welcome.md": `# Welcome to Knowledge Wiki

One shared place for the knowledge that helps us build.

## Find your context

Browse the folder tree or search for a concept. Every document shows the person responsible for its content.

## Propose an improvement

Choose **Request change**, describe why the update is needed, and submit it for review. The responsible owners are selected automatically.

## Work with your AI agent

Use **AI Prompt** on any page to build a prompt with the right instructions and context. Copy it into your coding agent with the Knowledge Wiki MCP connection enabled.

AI can investigate and propose a change. The final approval always belongs to a person.
`,
};
