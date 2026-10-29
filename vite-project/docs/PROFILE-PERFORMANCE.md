# Department catalog, Employee 360 and navigation improvements

Requested departments: IT / Engineering; Human Resources (HR); Finance / Accounts; Sales; Marketing; Operations.

Department creation/rename is limited to these names. Recognized old names such as Engineering/IT, HR/Human Resources and Finance/Accounts normalize to their canonical labels. Designations remain configurable. Registration/import checks require a supported active department, including on the server.

After deploying the matching backend, Admin opens **Organization → Set up all departments**. The new `POST /organization/departments/configure` accepts `{}`. It atomically reuses matching IDs, creates missing configured units, activates the six selected units and deactivates other legacy departments without deleting them or changing employee references. Repeating it preserves IDs and does not create duplicates. This configuration action is explicit: it is never run automatically by setup/startup and was not run against live business data during testing. Other legacy employee assignments remain readable and can be reassigned by HR. All API operations remain workspace scoped and role guarded.

Employee 360 previously waited for the staff-only organization request before fetching/rendering the profile. A slow/failing metadata request therefore blocked the entire page. Profile data now loads independently, job-option failures have a separate retry, and route/request guards discard old profile results. Employee 360 returns its own safe job labels/timezone, so Employees do not need access to `/organization`. The profile has an identity header, job facts, back navigation, existing edit/salary actions, histories and payslip access.

Performance changes:

- Only organization metadata uses an explicit, maximum 30-second in-memory cache. Concurrent requests coalesce; results are cloned to prevent form edits mutating shared cache. Every mutation and session/token change invalidates it. No employee/payroll lists or credentials are cached in browser storage.
- Directory, dashboard, attendance, leave and payroll reads perform independent work in parallel instead of serial metadata→records requests.
- Employee 360 uses lean history queries and MongoDB's selected-employee slip projection instead of hydrating/loading every employee's slip in each saved payroll run. The saved slip/breakdown is preserved.
- The header now shows workspace/page context, role greeting, company-local date, Ask AI, notifications and account avatar; desktop/mobile/dark styling stays within the existing design.

Verification: full 67-test browser suite, 46-test backend suite, 13 client/unit tests and the actual frontend/disposable-backend role lifecycle passed. Additional tests check slow/failed profile metadata, Employee-only job labels, cache invalidation, canonical departments, legacy-ID preservation and workspace isolation. Latest profile/catalog changes were checked again with 30 isolated integration/workspace tests and four targeted profile/registration browser checks. Screens were visually inspected at desktop and 375-pixel mobile widths. These checks do not claim a measured percentage speedup or remove Render cold-start latency.

Frontend changes are available in the local Vite app after refresh. The new catalog endpoint, department enforcement, self-contained job labels and database-query improvements require deployment of the updated backend. Existing workspace migration requirements still apply. No database reset, automatic live catalog write or company recreation is needed.
