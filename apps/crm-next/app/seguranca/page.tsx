import type { Metadata } from 'next';
import { LegalPageLayout } from '@/components/legal/LegalPageLayout';

export const metadata: Metadata = {
  title: 'Segurança | Praja',
  description: 'Práticas de segurança adotadas pelo Praja para proteger dados e operações.',
  alternates: {
    canonical: '/seguranca',
  },
};

export default function SegurancaPage() {
  return (
    <LegalPageLayout title="Segurança da Plataforma" lastUpdated="10 de março de 2026">
      <ul>
        <li>Controle de acesso e autenticação para áreas administrativas.</li>
        <li>Criptografia em trânsito e monitoramento de incidentes.</li>
        <li>Boas práticas de desenvolvimento e atualizações contínuas.</li>
      </ul>
    </LegalPageLayout>
  );
}
