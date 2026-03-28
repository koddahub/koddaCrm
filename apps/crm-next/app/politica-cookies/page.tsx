import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPageLayout } from '@/components/legal/LegalPageLayout';

export const metadata: Metadata = {
  title: 'Política de Cookies | Praja',
  description: 'Saiba como o Praja utiliza cookies para autenticação, segurança e melhoria de experiência.',
  alternates: {
    canonical: '/politica-cookies',
  },
  openGraph: {
    title: 'Política de Cookies | Praja',
    description: 'Informações sobre uso de cookies na plataforma Praja.',
    url: 'https://praja.koddahub.com.br/politica-cookies',
    siteName: 'Praja',
    locale: 'pt_BR',
    type: 'article',
  },
};

const sections = [
  { id: 'o-que-sao', label: 'O que são cookies?' },
  { id: 'como-usamos', label: 'Como usamos' },
  { id: 'tipos', label: 'Tipos de cookies' },
  { id: 'gerenciamento', label: 'Gerenciamento' },
];

export default function PoliticaCookiesPage() {
  return (
    <LegalPageLayout title="Política de Cookies" lastUpdated="10 de março de 2026" sections={sections}>
      <section id="o-que-sao">
        <h2 className="h4 mt-4" style={{ color: '#0f172a' }}>1. O que são cookies?</h2>
        <p>
          Cookies são pequenos arquivos de texto armazenados no seu dispositivo para lembrar preferências e melhorar a experiência de navegação.
        </p>
      </section>

      <section id="como-usamos">
        <h2 className="h4 mt-4" style={{ color: '#0f172a' }}>2. Como usamos cookies</h2>
        <ul>
          <li>Manter você autenticado durante a sessão.</li>
          <li>Lembrar preferências de configuração.</li>
          <li>Coletar métricas agregadas para melhoria da plataforma.</li>
          <li>Fortalecer mecanismos de segurança.</li>
        </ul>
      </section>

      <section id="tipos">
        <h2 className="h4 mt-4" style={{ color: '#0f172a' }}>3. Tipos de cookies utilizados</h2>
        <p><strong>Essenciais:</strong> necessários para funcionamento básico e autenticação.</p>
        <p><strong>Funcionais:</strong> lembram preferências do usuário.</p>
        <p><strong>Analytics:</strong> ajudam a entender o uso do sistema de forma agregada.</p>
      </section>

      <section id="gerenciamento">
        <h2 className="h4 mt-4" style={{ color: '#0f172a' }}>4. Gerenciamento de cookies</h2>
        <p>
          Você pode controlar cookies nas configurações do navegador. Ao continuar usando o Praja, você concorda com o uso descrito nesta política.
        </p>
        <p className="mb-0">
          Esta política complementa nossa{' '}
          <Link href="/politica-privacidade" className="text-decoration-none">
            Política de Privacidade
          </Link>
          .
        </p>
      </section>
    </LegalPageLayout>
  );
}
