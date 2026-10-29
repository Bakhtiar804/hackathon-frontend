# Challenge brief audit — 25 October 2026

This audit uses the supplied HCM Lite brief and the repository API contract. Validation uses mocked browser data and a separate disposable MongoDB replica set. Existing live company records were not used as test fixtures or modified during this audit.

## Fixes made

- Directory search now uses a trimmed, escaped, case-insensitive prefix on the server. `Ali` matches `Alice`; `lice` does not. Name, employee code and email use the same search behavior in the directory, all-results CSV export and the AI employee-search service. This requires deploying the backend source.
- Directory, attendance, leave and audit pagination retain the last successfully applied filters. Editing a field does not silently change the next page or CSV export. Directory/leave clear actions reset filters and paging. Older directory/attendance/leave/dashboard responses cannot replace newer results. Pagination disables repeated page actions while loading and shrinking approval lists return to an existing page.
- Added designation and employee filters, correction-status filtering, current-month/today shortcuts and a directory results/loading status. Inactive departments/designations remain available for historical filters; employee registration still requires active units.
- Fixed label/control/action alignment, narrow-screen filter wrapping, table action cells, pagination spacing and the desktop mobile-menu visibility regression. Preserved the original cream/green design.
- Fixed blur validation moving an action between mouse-down and mouse-up, which could swallow navigation clicks. Submit still validates all fields and focuses the first error.
- Personal attendance now includes a month calendar fetched from saved own attendance, including all days in the month. A linked HR account explicitly requests its own employee ID. Empty dates are not fabricated as absences. Older month requests cannot overwrite a newly selected month.
- Dashboard summaries first load the selected date/department data and use those same filters. Applying new filters clears old AI insights. Attrition is labeled for the selected range.
- HR late KPIs use the independent late flag, including late half-days rather than only records with the exclusive `late` status.
- Employee weekly hours are aggregated by the server from the current company-local Monday through today, independently of the selected history range. Old deployed APIs display an unavailable weekly value rather than inventing it.
- Organization displays saved future policy versions separately from the effective policy; a saved version can seed a later draft. This makes successful scheduled changes visible immediately without pretending they already apply today.

## Required functionality coverage

### Second pass against the resupplied brief

The second pass found additional gaps beyond the earlier checks. These are now fixed:

- The required department headcount, department average gross, monthly gross/net payroll, department gross/net payroll, and per-type/per-department leave utilization are now visible using the server's actual breakdowns. Unlimited/undefined utilization is displayed without invented percentages.
- Admin attrition YTD uses a separate current-year-through-today server query; the selected-range attrition is also retained and labeled. HR present/on-leave/late-today KPIs use today's server query rather than month or historical range totals. Both queries retain the chosen department and authenticated scope.
- Attendance rate now follows the exact brief numerator; a currently open session stays open and does not count as completed present attendance. Historical missing-checkout handling remains unchanged.
- Combined employee and department leave filters now intersect. Previously the department condition overwrote the employee condition.
- Employee 360 includes the saved published payslip state and links to PDF access. Staff payslip screens distinguish draft review from employee publication.
- The employee dashboard has direct assistant/payslip actions, and the README now links a timed demo with honest weekend/month-close/provider prerequisites.
- The final real lifecycle exposed a delayed-logout navigation race: server logout could finish after the user opened a new workspace form and redirect away from it. Logout now navigates immediately after local session clearing, before awaiting the server response. A controlled delayed-response browser regression covers this case for the shared auth/navigation flow.

New checks distinguish YTD/today from historical filters, verify server values in the previously missing breakdowns, verify an open-session attendance rate, and check combined leave filters with matching and mismatched departments. Live deployment and real provider verification remain separate pending steps.

| Brief item | Implementation and verification |
|---|---|
| 01 First-run setup | Public setup and workspace creation; no automatic login; existing company preserved; real isolated browser creation verified. |
| 02 Auth/access | Server roles, bearer sessions, password change/logout, expired-session handling, protected routes and account switching tested. |
| 03 Company settings | Admin writes/HR reads, timezone, office hours, grace, weekend, office coordinates and radius; prospective versions tested. |
| 04 Units/leave policy | Departments/designations, activation/rename/delete constraints, quotas, holidays and effective-date behavior tested. |
| 05 Login administration | Admin creates HR, resets/deactivates/activates accounts; temporary credentials and session revocation tested. |
| 06 Registration/profile | HR registration creates account/profile atomically; Employee only edits own phone/address; linked HR profile tested. |
| 07 Directory/360 | Server prefix search, department/designation/status/sort filters, paging, own scope and Employee 360 tested. |
| 08 CSV | Dry-run gating, row errors, atomic import, one-time credentials, filtered all-results export and formula-safe cells tested. |
| 09 Web attendance | Server-time check-in/out, uniqueness, linked HR/Employee permissions and attendance rules tested. |
| 10 Board/calendar | Staff board/history, employee month calendar, dates, paging and own-record scope tested. |
| 11 Corrections | Own requests, reason and local timestamps, independent HR decisions/comments, status filters and notifications tested. |
| 12 Leave self-service | Quotas, holidays/weekends, overlaps, multi-year allocations, balance restoration and future cancellation tested. |
| 13 Leave decisions | HR approves/rejects another employee’s request with comment; concurrent quota protection and last-page behavior tested. |
| 14 Salary | Basic salary and computed 40% housing/10% medical structure; increasing future versions and old snapshots tested. |
| 15 Payroll drafts | HR generation/recalculation, proration, attendance/leave deductions, tax and saved breakdowns tested. |
| 16 Finalization | Admin only, closed-month protection, stale revision detection, immutable publication and notifications tested. |
| 17 Payslips | Role/ownership scope, published Employee access, saved JSON and protected binary PDF download tested. |
| 18 Dashboards | Real aggregates, empty datasets, role scope, date/department filters, charts and own weekly hours tested. |
| 19 AI chat/tools | Shared business services, role/data restrictions, safe tool execution, timeout/rate-limit/fallback paths tested. |
| 20 AI summaries | Staff scope and exact applied filters tested; safe fallback remains available. |
| 21 Smart leave | Validated proposal only, editable ordinary form, explicit confirmation and four-field submission tested. |
| 22 Policy Q&A | Backend policy prompt/tools; model text rendered safely and AI-generated labels/fallbacks tested. |
| 23 Announcements | Staff publishing, role reads, dashboard display and plain-text rendering tested. |
| 24 Notifications | Own paginated inbox, idempotent mark-read and transactional decision/payroll notifications tested. |
| 25 Audit | Admin read-only paginated dates and structured before/after display; server action logs and scope tested. |

## Verification limits and deployment

Completed second-pass checks: the 63-test full mocked browser suite, additional populated-dashboard/mobile verification, 11 API-client/unit tests, 39 full backend tests, the actual frontend/disposable-backend role lifecycle, ESLint and production build. Prefix search is tested through directory, CSV and AI routes; weekly hours are tested independently of historical dashboard filters. The backend database used for mutation tests is isolated and disposable.

The browser suite checks workflows and responsive screens at 375, 768 and 1440 pixels. The real browser lifecycle uses a disposable backend/database and covers Admin → HR/profile → Employee → password changes → saved profile reload → leave approval → announcements → AI fallback → second isolated workspace. Backend integration covers payroll/PDF, business rules and cross-workspace authorization.

The hosted AI provider itself has not been verified with a real provider key during this audit. Backend tests use a controlled tool-calling provider; the real isolated browser uses the no-key fallback. Optional camera/face/location attendance is a bonus feature and is not implemented or presented as working web geolocation verification.

Local source changes do not deploy Render. Prefix search and weekly-hours additions require the updated backend, including `src/services/employees.js`, `src/services/analytics.js`, updated integration tests and `docs/API.md`. The earlier workspace implementation additionally requires the explicit preserving migration in [WORKSPACE-DEPLOYMENT.md](WORKSPACE-DEPLOYMENT.md). Do not reset the live database or reopen single-company setup to deploy these changes.
