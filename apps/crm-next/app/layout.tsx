import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KoddaCRM',
  description: 'CRM operacional KoddaHub',
  icons: {
    icon: '/koddahub-logo-v2.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
