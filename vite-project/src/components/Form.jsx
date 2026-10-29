import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ValidationContext } from '../context/ValidationContext.js';
import { controlError } from '../lib/validation.js';

export function Form({ children, onSubmit, validate, ...props }) {
  const ref = useRef(null);
  const locked = useRef(false);
  const pendingFocus = useRef(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  useLayoutEffect(() => {
    if (!busy && pendingFocus.current) {
      pendingFocus.current.focus();
      pendingFocus.current = null;
    }
  }, [busy, errors]);
  const update = useCallback((control) => {
    const key = control.name || control.id;
    if (key) setErrors(previous => ({ ...previous, [key]: controlError(control, ref.current) }));
  }, []);
  useEffect(() => {
    const form = ref.current;
    const onError = event => {
      const next = {};
      for (const item of event.detail || []) {
        const control = [...form.elements].find(input => input.name === item.field || input.dataset.apiField === item.field);
        if (control) next[control.name || control.id] = item.reason;
      }
      const first = [...form.elements].find(input => next[input.name || input.id]);
      pendingFocus.current = first || null;
      setErrors(next);
    };
    form.addEventListener('hcm:field-errors', onError);
    return () => form.removeEventListener('hcm:field-errors', onError);
  }, []);
  return <ValidationContext.Provider value={{ errors }}><form {...props} ref={ref} noValidate aria-busy={busy}
    onBlur={event => {
      // A new inline error can move the clicked action between mouse-down/up.
      // Submit validates the entire form; navigation must remain immediately usable.
      if (event.relatedTarget?.closest('button, a')) return;
      update(event.target);
    }}
    onChange={event => {
      const key = event.target.name || event.target.id;
      if (errors[key]) update(event.target);
      if (['password', 'currentPassword'].includes(event.target.name) && errors.confirmation) update(ref.current.elements.namedItem('confirmation'));
    }}
    onSubmit={async event => {
      event.preventDefault();
      if (locked.current) return;
      const form = ref.current;
      const next = {};
      for (const control of form.elements) {
        const message = controlError(control, form);
        if (message) next[control.name || control.id] = message;
      }
      Object.assign(next, validate?.(form, event.nativeEvent.submitter) || {});
      setErrors(next);
      if (Object.keys(next).length) {
        [...form.elements].find(control => next[control.name || control.id])?.focus();
        return;
      }
      locked.current = true;
      setBusy(true);
      try { await onSubmit?.(event); }
      finally { locked.current = false; setBusy(false); }
    }}>
    {busy && <span className="sr-only" aria-live="polite">Working on your request…</span>}
    <fieldset className="form-contents" disabled={busy}>{children}</fieldset>
  </form></ValidationContext.Provider>;
}
