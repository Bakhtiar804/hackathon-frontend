import { passwordError } from './password.js';
import { localDateTime } from './format.js';

export function controlError(control, form) {
  if (control.disabled || !['INPUT', 'SELECT', 'TEXTAREA'].includes(control.tagName) || ['submit', 'button', 'checkbox', 'hidden'].includes(control.type)) return '';
  const value = control.value;
  const label = control.labels?.[0]?.textContent?.trim() || control.getAttribute('aria-label') || 'This field';
  if (control.required && !(control.dataset.password ? value : value.trim())) return `${label} is required.`;
  if (!value) return '';
  if (control.type === 'email' && control.validity.typeMismatch) return 'Enter a valid email address.';
  if (control.validity.badInput) return control.type === 'number' ? 'Enter a valid number.' : 'Enter a valid date or time.';
  if (['date', 'month'].includes(control.type) && control.validity.rangeUnderflow) return `Choose ${control.min} or later.`;
  if (['date', 'month'].includes(control.type) && control.validity.rangeOverflow) return `Choose ${control.max} or earlier.`;
  if (control.validity.rangeUnderflow || control.validity.rangeOverflow) return `Use a value between ${control.min || 'the minimum'} and ${control.max || 'the maximum'}.`;
  if (control.dataset.exclusiveMin && Number(value) <= Number(control.min)) return 'Use a value greater than zero.';
  if (control.validity.stepMismatch) return control.step === '0.01' ? 'Use no more than two decimal places.' : 'Enter a whole number.';
  if (control.validity.patternMismatch) return control.dataset.patternMessage || 'Use the requested format.';
  if (control.maxLength > 0 && value.length > control.maxLength) return `Use at most ${control.maxLength} characters.`;
  if (control.type !== 'password' && control.minLength > 0 && value.length < control.minLength) return `Use at least ${control.minLength} characters.`;
  if (control.name === 'confirmPassword' && value !== form.elements.namedItem('newPassword')?.value) return 'The passwords do not match.';
  if (control.autocomplete === 'new-password' && !['confirmation', 'confirmPassword'].includes(control.name)) return passwordError(value);
  if (control.name === 'confirmation' && value !== (form.elements.namedItem('password') || form.elements.namedItem('currentPassword'))?.value) return 'The passwords do not match.';
  if (control.name === 'timezone') {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); } catch { return 'Enter a valid timezone, such as Asia/Karachi.'; }
  }
  if (/^policy\.leaveTypes\.\d+\.name$/.test(control.name) && [...form.elements].some(other => other !== control && /^policy\.leaveTypes\.\d+\.name$/.test(other.name) && other.value === value)) return 'Each leave type needs a unique name.';
  const pairs = { to: 'from', end: 'start', officeEnd: 'officeStart', checkOut: 'checkIn' };
  const start = pairs[control.name] && form.elements.namedItem(pairs[control.name])?.value;
  if (start && (['officeEnd', 'checkOut'].includes(control.name) ? value <= start : value < start)) return 'Choose an end after the start.';
  if (control.type === 'time' && ['checkIn', 'checkOut'].includes(control.name)) {
    const date = form.elements.namedItem('date')?.value;
    if (date) {
      try { if (Date.parse(localDateTime(date, value, form.dataset.timezone)) > Date.now()) return 'Choose a time that has already passed.'; }
      catch (error) { return error.message; }
    }
  }
  return '';
}
