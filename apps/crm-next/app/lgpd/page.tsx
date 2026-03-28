import type { Metadata } from 'next';
import { LegalPageLayout } from '@/components/legal/LegalPageLayout';

export const metadata: Metadata = {
  title: 'LGPD | Praja',
  description: 'Informações sobre direitos do titular e como exercer solicitações LGPD no Praja.',
  alternates: {
    canonical: '/lgpd',
  },
};

export default function LgpdPage() {
  return (
    <LegalPageLayout
      title="LGPD e Direitos do Titular"
      lastUpdated="10 de março de 2026"
      sections={[
        { id: 'direitos', label: 'Direitos' },
        { id: 'como-solicitar', label: 'Como solicitar' },
      ]}
    >
      <section id="direitos">
        <h2 className="h4 mt-4" style={{ color: '#0f172a' }}>1. Direitos garantidos</h2>
        <ul>
          <li>Acesso e confirmação de tratamento.</li>
          <li>Correção, atualização e portabilidade de dados.</li>
          <li>Anonimização, bloqueio ou eliminação quando aplicável.</li>
          <li>Revogação de consentimento e informação sobre compartilhamentos.</li>
        </ul>
      </section>
      <section id="como-solicitar">
        <h2 className="h4 mt-4" style={{ color: '#0f172a' }}>2. Como exercer seus direitos</h2>
        <p>
          Envie sua solicitação para <a href="mailto:privacidade@koddahub.com.br">privacidade@koddahub.com.br</a> com os dados da conta e descrição
          do pedido. Nossa equipe responderá dentro de prazo legal.
        </p>
      </section>
    </LegalPageLayout>
  );
}
