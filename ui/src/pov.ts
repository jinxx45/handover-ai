import { useSearchParams } from 'react-router-dom';

/** Whose eyes the case is seen through. Each sees a different job, with the same data underneath. */
export type Pov = 'leaver' | 'manager' | 'newhire';

export const POVS: Pov[] = ['leaver', 'manager', 'newhire'];

export function usePov(): [Pov, (p: Pov) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('as');
  const pov: Pov = raw === 'leaver' || raw === 'newhire' ? raw : 'manager';
  return [
    pov,
    (p: Pov) => {
      const next = new URLSearchParams(params);
      next.set('as', p);
      setParams(next, { replace: true });
    },
  ];
}
