import type { Metadata } from 'next';
import { EnvelopeSimple, Phone, WhatsappLogo } from '@phosphor-icons/react/dist/ssr';
import { HelpLayout } from '@/components/help/HelpLayout';

export const metadata: Metadata = {
  title: 'Contato do Suporte | Central de Ajuda Praja',
  description: 'Entre em contato com o suporte do Praja para dúvidas técnicas, cobrança ou integrações.',
  alternates: {
    canonical: '/ajuda/contato',
  },
};

export default function HelpContactPage() {
  return (
    <HelpLayout
      title="Fale com o Suporte"
      breadcrumb={[
        { label: 'Central de Ajuda', href: '/ajuda' },
        { label: 'Contato', href: '#' },
      ]}
    >
      <div className="row g-3">
        <div className="col-12 col-lg-7">
          <section className="bg-white border rounded-4 p-4 h-100">
            <h2 className="h5 mb-3" style={{ color: '#0f172a' }}>Atendimento</h2>
            <p className="text-secondary">Nosso time responde em horário comercial, de segunda a sexta.</p>
            <ul className="list-unstyled d-flex flex-column gap-3 mb-0">
              <li className="d-flex align-items-center gap-2">
                <EnvelopeSimple size={18} color="#0ea5e9" />
                <a href="mailto:suporte@praja.com.br" className="text-decoration-none">suporte@praja.com.br</a>
              </li>
              <li className="d-flex align-items-center gap-2">
                <Phone size={18} color="#0ea5e9" />
                <a href="tel:+5541997434837" className="text-decoration-none">(41) 99743-4837</a>
              </li>
              <li className="d-flex align-items-center gap-2">
                <WhatsappLogo size={18} color="#16a34a" />
                <a href="https://wa.me/5541997434837" target="_blank" rel="noreferrer" className="text-decoration-none">
                  WhatsApp de suporte
                </a>
              </li>
            </ul>
          </section>
        </div>

        <div className="col-12 col-lg-5">
          <section className="bg-white border rounded-4 p-4 h-100">
            <h2 className="h5 mb-3" style={{ color: '#0f172a' }}>Antes de abrir chamado</h2>
            <ul className="small text-secondary mb-0">
              <li>Inclua print da tela e mensagem de erro.</li>
              <li>Informe usuário afetado e horário aproximado.</li>
              <li>Descreva os passos para reproduzir.</li>
            </ul>
          </section>
        </div>
      </div>
    </HelpLayout>
  );
}
