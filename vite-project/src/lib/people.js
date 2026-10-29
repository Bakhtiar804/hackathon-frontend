import { api } from '../api/client.js';

export async function loadPeople() {
  const map = new Map();
  let page = 1;
  let total;
  do {
    const data = await api('/employees', { query: { page, limit: 100, sort: 'name' } });
    for (const person of data.items || []) map.set(person._id, person);
    total = data.total || 0;
    if (!data.items?.length) break;
    page += 1;
  } while ((page - 1) * 100 < total);
  return map;
}

export function personLabel(people, id) {
  const person = people?.get?.(id);
  if (!person) return id || '—';
  return person.code ? `${person.name} (${person.code})` : person.name;
}

export function asList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export function leaveTypeRows(leaveByType) {
  if (Array.isArray(leaveByType)) {
    return leaveByType.map((row) => ({
      label: row.type || row.name,
      value: row.days ?? row.used ?? row.count ?? 0,
    }));
  }
  return Object.entries(leaveByType || {}).map(([label, value]) => ({
    label,
    value: typeof value === 'object' ? value.days ?? value.used ?? 0 : value,
  }));
}

export function mapRows(obj, valueFn) {
  if (!obj) return [];
  if (Array.isArray(obj)) {
    return obj.map((row) => ({
      label: row.departmentId || row.designationId || row.label || row.type,
      value: valueFn ? valueFn(row) : row.value ?? row.grossMinor ?? row.count ?? 0,
      raw: row,
    }));
  }
  return Object.entries(obj).map(([label, value]) => ({
    label,
    value: valueFn ? valueFn(value) : value && typeof value === 'object' ? value.grossMinor ?? value.netMinor ?? value.count ?? 0 : value,
    raw: value,
  }));
}
