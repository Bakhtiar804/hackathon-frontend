# Five-minute HCM Lite demo

Use a fresh isolated judging database or a separate workspace on the deployed workspace-capable release. Preserve the existing HCM company. Do not run setup/seed/reset against the live company to prepare a demo. Follow README installation and WORKSPACE-DEPLOYMENT.md before the session; keep frontend and backend on matching releases.

Choose the Admin password yourself. Copy one-time HR/Employee passwords only when shown; change them at first login. No default or invented login credentials are provided.

| Time | Show |
|---|---|
| 0:00–0:45 | Create Workspace, then sign in as Admin. Organization: show hours/grace/weekends, create a department and designation. Users: create HR and copy the temporary credential. |
| 0:45–1:40 | HR signs in, changes password, signs in again. Register an employee with real job details and salary. For month-close payroll, set their joining date in the previous closed month. Show the employee's one-time login. |
| 1:40–2:40 | Employee signs in and changes password. Show own dashboard/profile/calendar, web check-in, and smart leave for future working dates. Edit/review the proposal and explicitly submit. Ask the assistant about a colleague's salary to demonstrate refusal/own scope. |
| 2:40–3:35 | HR enters a comment and approves leave. Show the changed balance/history, notifications, dashboard filters, current-day KPIs and AI summary for the same selected filters. |
| 3:35–4:20 | HR generates a previous closed-month payroll draft and reviews employee breakdowns. Admin reviews and finalizes before any further business write. Demonstrate that a current-month run cannot be finalized. |
| 4:20–5:00 | Employee downloads the published PDF. Admin opens the audit log and before/after details. Show empty datasets honestly where no records exist. |

Attendance check-in is allowed only on a working day without approved leave. If the presentation occurs on a configured weekend/holiday, show the honest rejection and demonstrate a correction for a past eligible working date plus HR approval. Do not weaken the server clock or fabricate attendance. Immediate checkout correctly gives a half-day when under the policy threshold.

Historical payroll uses historical employment/salary/attendance, not today's activity. A newly registered employee with a current joining date is not eligible for last month's payroll. Missing historical attendance produces actual deductions. To demonstrate a paid historical day, the employee can request a correction for an eligible past working date, with actual intended timestamps and a reason, and HR must approve it before draft generation. If any business write occurs after generation, regenerate before Admin finalizes; a stale draft is intentionally rejected.

Hosted AI needs the provider key in backend configuration only. When the provider is unavailable, demonstrate the labeled safe fallback and ordinary leave form; do not claim an actual tool-generated response. Real provider verification is separate from the controlled-provider and fallback tests.
