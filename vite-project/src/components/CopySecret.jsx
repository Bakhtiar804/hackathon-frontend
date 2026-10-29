import { useState } from 'react';

export function CopySecret({ value }) {
  const [message, setMessage] = useState('');
  return <div className="stack"><button className="btn secondary" type="button" onClick={async () => {
    try { await navigator.clipboard.writeText(value); setMessage('Copied. Share privately with the account holder.'); }
    catch { setMessage('Copy is unavailable. Select and copy the password above.'); }
  }}>Copy temporary password</button><p className="muted small" role="status">{message || 'Copy now and share privately. This password is only shown here and is not saved in the browser.'}</p></div>;
}
