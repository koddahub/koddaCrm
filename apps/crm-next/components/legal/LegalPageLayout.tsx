import Link from 'next/link';
import { ReactNode } from 'react';
import { ArrowLeft, ArrowUp, Cookie, FileText, Info } from '@phosphor-icons/react/dist/ssr';

interface LegalPageLayoutProps {
  children: ReactNode;
  title: string;
  lastUpdated?: string;
  sections?: Array<{ id: string; label: string }>;
  icon?: ReactNode;
  breadcrumb?: Array<{ label: string; href?: string }>;
  relatedLinks?: Array<{
    href: string;
    title: string;
    description: string;
    icon?: ReactNode;
  }>;
}

const defaultRelatedLinks = [
  {
    href: '/termo-uso',
    title: 'Termos de Uso',
    description: 'Condições de uso da plataforma',
    icon: <FileText size={22} color="#0ea5e9" />,
  },
  {
    href: '/politica-cookies',
    title: 'Política de Cookies',
    description: 'Como utilizamos cookies',
    icon: <Cookie size={22} color="#0ea5e9" />,
  },
  {
    href: '/lgpd',
    title: 'LGPD',
    description: 'Direitos dos titulares de dados',
    icon: <Info size={22} color="#0ea5e9" />,
  },
];

export function LegalPageLayout({
  children,
  title,
  lastUpdated,
  sections = [],
  icon,
  breadcrumb,
  relatedLinks = defaultRelatedLinks,
}: LegalPageLayoutProps) {
  return (
    <div id="topo-pagina-legal" className="bg-light min-vh-100">
      <header style={{ background: 'linear-gradient(135deg, #0f172a, #0ea5e9)', color: '#fff' }}>
        <div className="container py-5">
          <div className="mx-auto" style={{ maxWidth: 896 }}>
            <Link href="/" className="d-inline-flex align-items-center gap-2 text-decoration-none mb-4" style={{ color: 'rgba(255,255,255,.9)' }}>
              <ArrowLeft size={16} />
              <span className="small">Voltar para o Praja</span>
            </Link>

            <div className="d-flex align-items-center gap-3">
              <div
                className="d-inline-flex align-items-center justify-content-center rounded-4"
                style={{ width: 64, height: 64, background: 'rgba(255,255,255,0.14)' }}
              >
                {icon || <FileText size={30} color="#ffffff" />}
              </div>
              <div>
                <h1 className="mb-1" style={{ fontSize: '2rem', lineHeight: 1.1 }}>{title}</h1>
                <p className="mb-0 small" style={{ opacity: 0.9 }}>
                  Última atualização: {lastUpdated || '10 de março de 2026'}
                </p>
              </div>
            </div>

            {breadcrumb && breadcrumb.length > 0 ? (
              <nav className="d-flex align-items-center flex-wrap gap-2 mt-3" aria-label="Breadcrumb">
                {breadcrumb.map((item, index) => (
                  <div key={`${item.label}-${index}`} className="d-flex align-items-center gap-2">
                    {item.href ? (
                      <Link href={item.href} className="small text-decoration-none" style={{ color: 'rgba(255,255,255,.92)' }}>
                        {item.label}
                      </Link>
                    ) : (
                      <span className="small" style={{ color: 'rgba(255,255,255,.92)' }}>{item.label}</span>
                    )}
                    {index < breadcrumb.length - 1 ? <span className="small" style={{ opacity: 0.7 }}>/</span> : null}
                  </div>
                ))}
              </nav>
            ) : null}
          </div>
        </div>
      </header>

      <main className="container py-4 py-md-5">
        <article
          className="mx-auto bg-white rounded-4 shadow-sm p-4 p-md-5"
          style={{ maxWidth: 896, lineHeight: 1.75, color: '#334155' }}
        >
          <p className="mb-4 text-secondary small">
            Praja é desenvolvido e operado pela{' '}
            <a href="https://www.koddahub.com.br" target="_blank" rel="noreferrer" className="text-decoration-none">
              KoddaHub
            </a>
            .
          </p>
          {sections.length > 0 ? (
            <nav className="mb-4 p-3 rounded-4 border bg-light" aria-label="Navegação da página legal">
              <h2 className="h6 mb-2 text-uppercase" style={{ letterSpacing: '.06em', color: '#64748b' }}>
                Navegação rápida
              </h2>
              <div className="d-flex flex-wrap gap-2 align-items-center">
                {sections.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="btn btn-sm rounded-pill border-0"
                    style={{ background: '#e2e8f0', color: '#334155' }}
                  >
                    {section.label}
                  </a>
                ))}
              </div>
            </nav>
          ) : null}
          <div className="legal-content">{children}</div>
          <div className="d-flex justify-content-center mt-4">
            <a href="#topo-pagina-legal" className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1">
              <ArrowUp size={14} />
              Voltar ao topo
            </a>
          </div>
        </article>

        {relatedLinks.length > 0 ? (
          <section className="mx-auto mt-4" style={{ maxWidth: 896 }}>
            <div className="row g-3">
              {relatedLinks.map((item) => (
                <div key={item.href} className="col-12 col-md-4">
                  <Link href={item.href} className="text-decoration-none">
                    <div className="bg-white border rounded-4 p-3 h-100 shadow-sm legal-related-card">
                      <div className="d-flex align-items-center gap-2 mb-1">
                        {item.icon || <FileText size={20} color="#0ea5e9" />}
                        <h3 className="h6 mb-0" style={{ color: '#0f172a' }}>{item.title}</h3>
                      </div>
                      <p className="small text-secondary mb-0">{item.description}</p>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <footer className="border-top py-4">
        <div className="container">
          <div className="mx-auto text-center" style={{ maxWidth: 896 }}>
            <p className="small text-secondary mb-1">© {new Date().getFullYear()} Praja. Todos os direitos reservados.</p>
            <p className="small text-secondary mb-0">
              Desenvolvido com <span style={{ color: '#ef4444' }}>❤</span> pela{' '}
              <a href="https://www.koddahub.com.br" target="_blank" rel="noreferrer" className="text-decoration-none">
                KoddaHub
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
