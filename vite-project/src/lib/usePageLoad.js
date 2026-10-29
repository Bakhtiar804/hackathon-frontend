import { useEffect, useEffectEvent, useState } from 'react';

// Initial reads run once per mounted page; filters are applied explicitly by its form.
export function usePageLoad(read, identity = '') {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const run = useEffectEvent(read);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(async () => {
      if (!active) return;
      setLoading(true);
      setLoadError(null);
      try { await run(); }
      catch (error) { if (active) setLoadError(error); }
      finally { if (active) setLoading(false); }
    });
    return () => { active = false; };
  }, [identity, attempt]);
  return { loading, loadError, retry: () => setAttempt((value) => value + 1) };
}
