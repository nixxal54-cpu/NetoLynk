import { useEffect } from 'react';

const BASE = 'Netolynk';

/**
 * Sets document.title to "<title> | Netolynk", or just "Netolynk" when no title given.
 * Resets to the base title on unmount.
 */
export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} | ${BASE}` : BASE;
    return () => {
      document.title = BASE;
    };
  }, [title]);
}
