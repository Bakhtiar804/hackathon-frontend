import { departmentName } from './departments.js';
let companyTimezone = 'Asia/Karachi';
export function setCompanyTimezone(timezone) { companyTimezone = timezone || 'Asia/Karachi'; }
const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

export { WEEKDAYS };

export function money(minor) {
  if (minor === null || minor === undefined) return '—';
  return `PKR ${(Number(minor) / 100).toFixed(2)}`;
}

export function pct(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(1)}%`;
}

export function todayISO(timeZone = companyTimezone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function monthISO(timeZone = companyTimezone) {
  return todayISO(timeZone).slice(0, 7);
}

export function monthStart(timeZone = companyTimezone) {
  return `${todayISO(timeZone).slice(0, 7)}-01`;
}

export function formatStamp(value, timeZone = companyTimezone) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatTime(value, timeZone = companyTimezone) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function currentPolicy(company) {
  const policies = [...(company?.policies || [])].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  let current = null;
  for (const policy of policies) {
    if (policy.effectiveDate <= todayISO(policy.timezone || companyTimezone)) current = policy;
  }
  return current;
}

export function offsetFor(date, timeZone = 'Asia/Karachi') {
  const noon = new Date(`${date}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(noon);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  const diffMin = Math.round((asUTC - noon.getTime()) / 60000);
  const sign = diffMin >= 0 ? '+' : '-';
  const abs = Math.abs(diffMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

export function localDateTime(date, time, timeZone = 'Asia/Karachi') {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let instant = target;
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  for (let attempt = 0; attempt < 5; attempt++) {
    const parts = formatter.formatToParts(new Date(instant));
    const part = type => Number(parts.find(value => value.type === type).value);
    const rendered = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'));
    if (rendered === target) return new Date(instant).toISOString();
    instant += target - rendered;
  }
  throw new Error('This time does not exist on the selected date because the clocks change. Choose another time.');
}

export function tomorrowISO(timeZone = companyTimezone) {
  const date = new Date(`${todayISO(timeZone)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function policyFor(company, date) {
  return [...(company?.policies || [])].filter(p => p.effectiveDate <= date).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)).at(-1) || null;
}

export function futureEffectiveDate(previous, timeZone = companyTimezone) {
  if (!previous) return tomorrowISO(timeZone);
  const next = new Date(`${previous}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return [tomorrowISO(timeZone), next.toISOString().slice(0, 10)].sort().at(-1);
}

export function unitName(units, id) {
  const unit = units?.find((u) => u._id === id);
  return unit ? (unit.kind === 'department' ? departmentName(unit.name) || unit.name : unit.name) : '—';
}

export function roleLabel(role) {
  return role || 'User';
}

export function statusLabel(status) {
  return String(status || '—').replaceAll('_', ' ');
}

export function employmentStatus(employee, timeZone = 'Asia/Karachi') {
  const today = todayISO(timeZone);
  const history = [...(employee?.employmentHistory || [])].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  return history.filter((version) => version.effectiveDate <= today).at(-1)?.status || employee?.status;
}
