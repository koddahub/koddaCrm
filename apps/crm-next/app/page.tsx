import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'KoddaCRM | Operação Comercial',
  description: 'KoddaCRM é a plataforma SaaS da KoddaHub para captação de leads, gestão comercial e operação integrada.',
  alternates: {
    canonical: '/',
  },
};

export default function HomePage() {
  return (
    <main className="bg-light min-vh-100 d-flex align-items-center">
      <div className="container py-5">
        <div className="mx-auto bg-white border rounded-4 shadow-sm p-4 p-md-5" style={{ maxWidth: 880 }}>
          <div className="d-flex flex-wrap gap-3 small mb-3">
            <Link href="/politica-privacidade" className="text-decoration-none">
              Política de Privacidade
            </Link>
            <span className="text-secondary">•</span>
            <Link href="/termo-uso" className="text-decoration-none">
              Termos de Uso
            </Link>
          </div>

          <div className="d-flex align-items-center gap-2 mb-3">
            <img src="/koddahub-logo-v2.png" alt="KoddaCRM" style={{ width: 34, height: 34 }} />
            <h1 className="h3 mb-0" style={{ color: '#0f172a' }}>KoddaCRM by KoddaHub</h1>
          </div>

          <p className="text-secondary mb-4">
            Plataforma SaaS para captação de leads, gestão comercial e operação integrada.
          </p>

          <div className="d-flex flex-wrap gap-2 mb-4">
            <Link href="/login" className="btn btn-primary">Entrar no painel</Link>
            <Link href="/ajuda" className="btn btn-outline-secondary">Central de ajuda</Link>
          </div>

          <div className="border-top pt-3">
            <p className="small text-secondary mb-2">Documentos legais</p>
            <div className="d-flex flex-wrap gap-3">
              <Link href="/politica-privacidade" className="small text-decoration-none">
                Política de Privacidade
              </Link>
              <Link href="/termo-uso" className="small text-decoration-none">
                Termos de Uso
              </Link>
              <Link href="/politica-cookies" className="small text-decoration-none">
                Política de Cookies
              </Link>
              <Link href="/lgpd" className="small text-decoration-none">
                LGPD
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
