import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://praja.koddahub.com.br';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const routes = [
    '/',
    '/politica-privacidade',
    '/termo-uso',
    '/politica-cookies',
    '/lgpd',
    '/ajuda',
    '/faq',
    '/contato',
    '/status',
    '/para-voce',
    '/seguranca',
  ];

  return routes.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: now,
    changeFrequency: route === '/' ? 'daily' : 'monthly',
    priority: route === '/' ? 1 : 0.6,
  }));
}
