import type { Metadata } from 'next';
import { LegalPageLayout } from '@/components/legal/LegalPageLayout';

export const metadata: Metadata = {
  title: 'Contato | Praja',
  description: 'Fale com o time do Praja para suporte, comercial ou assuntos de privacidade.',
  alternates: {
    canonical: '/contato',
  },
};

export default function ContatoPage() {
  return (
    <LegalPageLayout title="Fale Conosco" lastUpdated="10 de março de 2026">
      <ul>
        <li>E-mail geral: <a href="mailto:oi@praja.com.br">oi@praja.com.br</a></li>
        <li>Suporte: <a href="mailto:suporte@praja.com.br">suporte@praja.com.br</a></li>
        <li>Privacidade: <a href="mailto:privacidade@koddahub.com.br">privacidade@koddahub.com.br</a></li>
        <li>Telefone: <a href="tel:+5541997434837">(41) 99743-4837</a></li>
        <li>Endereço de referência: Curitiba, PR - Brasil</li>
      </ul>
    </LegalPageLayout>
  );
}
