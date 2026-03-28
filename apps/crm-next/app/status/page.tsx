import type { Metadata } from 'next';
import { LegalPageLayout } from '@/components/legal/LegalPageLayout';

export const metadata: Metadata = {
  title: 'Status do Sistema | Praja',
  description: 'Acompanhe o status operacional dos serviços do Praja.',
  alternates: {
    canonical: '/status',
  },
};

export default function StatusPage() {
  return (
    <LegalPageLayout title="Status do Sistema" lastUpdated="10 de março de 2026">
      <p className="mb-2">Situação atual: <strong>Operacional</strong>.</p>
      <p className="mb-0">Para incidentes, entre em contato pelo suporte oficial: suporte@praja.com.br.</p>
    </LegalPageLayout>
  );
}
