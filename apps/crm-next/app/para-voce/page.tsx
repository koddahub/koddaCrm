import type { Metadata } from 'next';
import { LegalPageLayout } from '@/components/legal/LegalPageLayout';

export const metadata: Metadata = {
  title: 'Para Você | Praja',
  description: 'Conheça as funcionalidades e planos do Praja para seu negócio.',
  alternates: {
    canonical: '/para-voce',
  },
};

export default function ParaVocePage() {
  return (
    <LegalPageLayout
      title="Praja para o seu negócio"
      lastUpdated="10 de março de 2026"
      sections={[
        { id: 'funcionalidades', label: 'Funcionalidades' },
        { id: 'planos', label: 'Planos' },
      ]}
    >
      <section id="funcionalidades">
        <h2 className="h4 mt-4" style={{ color: '#0f172a' }}>Funcionalidades</h2>
        <ul>
          <li>Agenda online com controle de horários.</li>
          <li>Cadastro de clientes e histórico de atendimentos.</li>
          <li>Lembretes e notificações operacionais.</li>
          <li>Integrações com Google e pagamentos via ASAAS.</li>
        </ul>
      </section>

      <section id="planos">
        <h2 className="h4 mt-4" style={{ color: '#0f172a' }}>Planos</h2>
        <p>
          O Praja oferece opções para diferentes estágios de negócio, incluindo planos Basic, Professional e Pro, conforme disponibilidade comercial.
        </p>
      </section>
    </LegalPageLayout>
  );
}
