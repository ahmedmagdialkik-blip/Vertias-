import React, { useSyncExternalStore } from 'react';

export function isPortalPathname(pathname: string): boolean {
  return pathname === '/login' || pathname === '/signup' || pathname === '/account' || pathname === '/admin';
}

declare global {
  interface Window {
    __veritasSetPortalMode?: (isPortal: boolean, options?: { skipIntro?: boolean }) => void;
    __veritasApplyPublicData?: (payload: unknown) => void;
  }
}

const listeners = new Set<() => void>();
let lastLocationKey = `${window.location.pathname || '/'}${window.location.search || ''}`;

function notifySubscribers(): void {
  const nextKey = `${window.location.pathname || '/'}${window.location.search || ''}`;
  if (nextKey !== lastLocationKey) {
    lastLocationKey = nextKey;
  }
  listeners.forEach(listener => listener());
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    const nextPath = window.location.pathname || '/';
    const enteringPortal = isPortalPathname(nextPath);
    document.documentElement.classList.toggle('is-portal-route', enteringPortal);
    window.__veritasSetPortalMode?.(enteringPortal, { skipIntro: !enteringPortal });
    notifySubscribers();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): string {
  return `${window.location.pathname || '/'}\n${window.location.search || ''}`;
}

export function navigate(to: string, options?: { replace?: boolean }): void {
  const targetUrl = new URL(to, window.location.origin);
  const nextFull = targetUrl.pathname + targetUrl.search + targetUrl.hash;
  const currentFull = window.location.pathname + window.location.search + window.location.hash;

  if (nextFull !== currentFull) {
    if (options?.replace) {
      window.history.replaceState({}, '', nextFull);
    } else {
      window.history.pushState({}, '', nextFull);
    }
  }

  const enteringPortal = isPortalPathname(targetUrl.pathname);
  document.documentElement.classList.toggle('is-portal-route', enteringPortal);
  window.__veritasSetPortalMode?.(enteringPortal, { skipIntro: !enteringPortal });

  notifySubscribers();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

export function useLocationState(): { pathname: string; search: string } {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const idx = snap.indexOf('\n');
  return {
    pathname: idx >= 0 ? snap.slice(0, idx) : '/',
    search: idx >= 0 ? snap.slice(idx + 1) : ''
  };
}

interface RouterLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
}

export const RouterLink: React.FC<RouterLinkProps> = ({ to, onClick, children, ...rest }) => {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (
      e.defaultPrevented ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      e.button !== 0
    ) {
      return;
    }
    e.preventDefault();
    navigate(to);
  };

  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
};
