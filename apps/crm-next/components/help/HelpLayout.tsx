import Link from 'next/link';
import { CaretRight, Question } from '@phosphor-icons/react/dist/ssr';
import { ReactNode } from 'react';
import { HelpWidget } from '@/components/help/HelpWidget';

interface HelpLayoutProps {
  children: ReactNode;
  title?: string;
  breadcrumb?: Array<{ label: string; href: string }>;
}

export function HelpLayout({ children, title, breadcrumb }: HelpLayoutProps) {
  return (
    <div className="bg-light min-vh-100">
      <header className="bg-white border-bottom sticky-top" style={{ zIndex: 100 }}>
        <div className="container py-3">
          <div className="d-flex align-items-center justify-content-between gap-3">
            <Link href="/ajuda" className="d-flex align-items-center gap-2 text-decoration-none">
              <Question size={24} color="#0ea5e9" />
              <span style={{ color: '#0f172a', fontWeight: 700, fontSize: '1.25rem' }}>Central de Ajuda</span>
            </Link>
            <Link href="/" className="small text-decoration-none text-secondary">
              ← Voltar ao Praja
            </Link>
          </div>

          {breadcrumb && breadcrumb.length > 0 ? (
            <nav className="d-flex flex-wrap align-items-center gap-1 mt-2" aria-label="Breadcrumb">
              {breadcrumb.map((item, index) => (
                <div key={`${item.label}-${index}`} className="d-flex align-items-center gap-1">
                  {index > 0 ? <CaretRight size={14} color="#94a3b8" /> : null}
                  {item.href === '#' ? (
                    <span className="small text-secondary">{item.label}</span>
                  ) : (
                    <Link href={item.href} className="small text-decoration-none text-secondary">
                      {item.label}
                    </Link>
                  )}
                </div>
              ))}
            </nav>
          ) : null}
        </div>
      </header>

      <main className="container py-4 py-md-5">
        {title ? <h1 className="mb-4" style={{ color: '#0f172a', fontSize: '2rem' }}>{title}</h1> : null}
        {children}
      </main>

      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 120 }}>
        <HelpWidget />
      </div>
    </div>
  );
}
