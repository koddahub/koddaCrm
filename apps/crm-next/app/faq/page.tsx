import type { Metadata } from 'next';
import { LegalPageLayout } from '@/components/legal/LegalPageLayout';

export const metadata: Metadata = {
  title: 'FAQ | Praja',
  description: 'Perguntas frequentes sobre uso, pagamentos e integrações do Praja.',
  alternates: {
    canonical: '/faq',
  },
};

export default function FaqPage() {
  return (
    <LegalPageLayout title="Perguntas Frequentes (FAQ)" lastUpdated="10 de março de 2026">
      <h2 className="h5 mt-3" style={{ color: '#0f172a' }}>Como cancelar minha assinatura?</h2>
      <p>Você pode cancelar a qualquer momento pelo painel ou suporte oficial.</p>
      <h2 className="h5 mt-3" style={{ color: '#0f172a' }}>O Praja armazena dados do cartão?</h2>
      <p>Não. O processamento é feito pela ASAAS.</p>
      <h2 className="h5 mt-3" style={{ color: '#0f172a' }}>Posso integrar com Google?</h2>
      <p>Sim, mediante autorização OAuth para os escopos necessários.</p>
    </LegalPageLayout>
  );
}
