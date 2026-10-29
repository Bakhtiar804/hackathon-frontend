# Brief readiness: code, tests and deployment

Second pass completed against the resupplied six-page HCM Lite brief on 25 October 2026. Required modules are implemented in source; the second pass repaired missing analytics presentation and business/filter mismatches rather than merely reusing the previous checklist.

## Fixed in this pass

- Department headcount and average gross, monthly gross/net payroll, department gross/net payroll, and leave utilization by type/department now render the server's actual aggregates.
- Admin YTD attrition is queried for the current year through company-local today. HR present/on-leave/late-today are queried for today. Both remain separate from historical/date-range metrics and keep the selected department.
- Open check-ins remain open and do not add completed attendance to the rate numerator in the brief. Historical missing checkout is still handled by day-close rules.
- Employee plus department leave filters intersect instead of one replacing the other.
- Employee 360 shows published payslip state and links to PDF access; staff payslip screens explain drafts versus publication.
- Employee dashboard links directly to the assistant and payslips. [DEMO.md](DEMO.md) provides the timed judging flow and working-day/month-close prerequisites.

## Remaining to claim live/demo readiness

Second-pass validation: 63 full browser workflow tests, additional populated dashboard/mobile and delayed-logout regressions, 39 backend tests, 11 unit tests, lint and production build passed. After the logout fix, the actual disposable-backend full role/workspace lifecycle passed again. Responsive role pages were checked at 375/768/1440 pixels.

Backend files changed in this second pass: `src/services/analytics.js`, `src/services/employees.js`, `src/services/leave.js`, `tests/integration.test.js`, `docs/API.md` and `docs/RULES.md`. Frontend changes are in Dashboard, Employee360, Payslips, Layout, ChangePassword, workflow tests and the linked README/demo/audit documents. No new environment variable was introduced. These changes belong with the previously prepared workspace release, not a database reset.

1. **Deploy the matching backend release.** Public read-only checks still show the older Render API: `/health`, `/ready`, and `/api/v1/setup-status` return 200 and allow `http://localhost:5173`, but setup-status has no `workspaceCreationAvailable`, and public OpenAPI has no `/workspaces`. New backend fixes are not live merely because local tests pass. Preserve existing data and follow [WORKSPACE-DEPLOYMENT.md](WORKSPACE-DEPLOYMENT.md); never reset or recreate the company.
2. **Verify a publicly hosted frontend URL.** The frontend verified here is localhost. No public frontend deployment URL has been supplied, so the brief's hosted judge-facing frontend link is not verified. Keep its VITE_API_BASE pointed at the matching backend, rebuild, and verify that exact browser origin.
3. **Verify the real hosted AI provider.** Controlled tool-calling provider tests and graceful no-key fallback pass. A real hosted provider call with the deployment's configuration has not been verified. Supply provider credentials only to the backend, never to this frontend or chat.

Optional bonuses such as camera/face/geofence attendance, liveness, attrition-risk predictions, anomaly detection, late penalties and PWA installation are not required for the 25-item core. They are not claimed implemented. The existing theme toggle covers dark-mode UI; web attendance does not pretend to verify camera/location.

Mutation verification uses disposable databases and intercepted browser fixtures. This second audit did not mutate the existing live company's business records.
