'use client';

import { useEffect, ReactNode } from 'react';
import Plausible from 'plausible-tracker';

// Cookieless page views only (no custom events), so no consent banner is needed.
// Off unless NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set: never send visitors' requests to a site that isn't ours.
const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!domain) return;
    return Plausible({
      domain,
      apiHost: process.env.NEXT_PUBLIC_PLAUSIBLE_API_HOST || 'https://plausible.io',
    }).enableAutoPageviews();
  }, []);

  return <>{children}</>;
}
