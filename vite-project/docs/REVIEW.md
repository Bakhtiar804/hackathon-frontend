# Review notes — 25 October 2026

## Scope and source

Inspected all application routes, pages, shared UI, API client, authentication, formatting, README, package scripts and styling. The supplied API contract and the live generated `/api/v1/openapi.json` were used to check paths, request field allowlists, required fields and roles. The generated contract is saved in this directory. A separate project brief and backend RULES.md/source were not supplied, so full brief/tax-rule conformance cannot be certified.

## Live evidence and blockers

- Public `GET /api/v1/setup-status` without an Origin header returned HTTP 200 with `data.initializationRequired:true`. No setup, login, password reset, account creation or business mutation was performed on the live backend.
- Generated OpenAPI was successfully read from `/api/v1/openapi.json`. Root `/openapi.json`, `/api-docs`, `/docs` and `/swagger.json` returned 404.
- Sending `Origin: http://localhost:5173` to setup status returned HTTP 403, `{"success":false,"message":"Origin not allowed","requestId":"666fe897-4612-400f-8e21-6f56c9b519ae"}`, with no Access-Control-Allow-Origin. Login OPTIONS preflight with JSON/Authorization headers was also rejected with `Origin not allowed` (request ID `57597ee8-2f00-4b1f-a948-c829a62fe7ca`).
- The current development origin, `http://127.0.0.1:5174`, was separately checked and also returned HTTP 403 `Origin not allowed`, without Access-Control-Allow-Origin (request ID `b4718945-cc0c-499c-8bbc-3d3e4a2a1fa6`).
- Backend action required: permit the actual frontend local/production origins in its CORS allowlist and correctly answer OPTIONS for Authorization and Content-Type. Vite may choose a different port when occupied; that origin also needs authorization. No frontend header can grant this permission.
- Authenticated live workflows are unverified. No credentials were supplied; the service reports it has not been initialized, and the instruction prohibits running setup for live tests.
- Employee timezone metadata is incomplete in the documented API: Employee cannot GET organization, and auth/dashboard responses do not document a company timezone. Attendance uses returned row policySnapshot.timezone when available, otherwise the documented Asia/Karachi default. For a company with a different timezone and no usable attendance snapshot, fully reliable Employee correction conversion/date boundaries need backend-provided safe timezone/effective-policy metadata. Staff reads use the organization policy. This limitation cannot be solved reliably by guessing a browser timezone or inventing an endpoint.

## Review coverage

| Area | Changes/review |
| --- | --- |
| Setup/auth | Loading/retry, setup conflict recheck, explicit sign-in after setup/change, session validation, 401/403 distinction, cross-tab session isolation, required password gate |
| Roles | Backend role drives dashboards/menu; protected Admin/HR routes; Employee cannot fetch another profile via direct URL |
| Accounts | HR creation/reset one-time password copy; HR profile linking; employee registration and missing-unit/profile guidance |
| Employees/CSV | Exact registration/edit field sets; unchanged status omitted; future status dates; salary endpoint separate; current effective status display; dry-run gate invalidated by CSV edits; errors retain row/field/reason; credential copy; export remains text |
| Organization | Full policy version body, active units, future policies excluded, editable row focus preserved |
| Attendance/leave | Self-service link guidance, correction inbox pagination, HR comments and self-approval restrictions, leave types from actual policy/balances, future-only cancellation, edited smart proposal requires explicit confirmation |
| Payroll/payslips | HR-only drafts, Admin-only finalization, current/future month blocked using company timezone, server state/stale errors shown, integer-paisa display, protected PDF downloads |
| Communications/AI | Honest loading/retry/empty states, announcement text rendering, notification badge refresh, Admin-only audit route, AI safe fallback and read-only proposal flow |
| API transport | Normalized version prefix/slashes, consistent envelopes, support request IDs, no write retries, concurrent write protection, stale-session response rejection |

Final checks: lint passed without warnings; production build passed; all 5 unit tests and all 24 Playwright browser tests passed. Browser checks used installed Chrome and intercepted responses, including a small PDF fixture; they establish frontend request/download behavior, not live payroll arithmetic, provider behavior, database transactions or PDF content correctness. Login screenshots at 375, 768 and 1440 pixels were generated, and the mobile/desktop screenshots were visually inspected. The browser suite also verifies successful email/password sign-in and dashboard routing for all three roles.
