import type { Metadata } from 'next';
import { Shield } from '@phosphor-icons/react/dist/ssr';
import { LegalPageLayout } from '@/components/legal/LegalPageLayout';

export const metadata: Metadata = {
  title: 'Política de Privacidade | Praja',
  description: 'Saiba como o Praja coleta, usa e protege seus dados pessoais em conformidade com a LGPD.',
  alternates: {
    canonical: '/politica-privacidade',
  },
  openGraph: {
    title: 'Política de Privacidade | Praja',
    description: 'Informações sobre coleta, uso e proteção de dados pessoais no Praja.',
    url: 'https://praja.koddahub.com.br/politica-privacidade',
    siteName: 'Praja',
    locale: 'pt_BR',
    type: 'article',
  },
};

const sections = [
  { id: '1-coleta-de-dados', label: '1. Coleta de dados' },
  { id: '2-uso-dos-dados', label: '2. Uso dos dados' },
  { id: '3-compartilhamento', label: '3. Compartilhamento' },
  { id: '4-seguranca', label: '4. Segurança' },
  { id: '5-direitos-lgpd', label: '5. Direitos LGPD' },
];

function SectionTitle({ number, title }: { number: string; title: string }) {
  return (
    <h2 className="h4 mb-3 d-flex align-items-center gap-2" style={{ color: '#0f172a' }}>
      <span
        className="d-inline-flex align-items-center justify-content-center rounded-3"
        style={{ width: 32, height: 32, background: '#e0f2fe', color: '#0284c7', fontWeight: 700 }}
      >
        {number}
      </span>
      {title}
    </h2>
  );
}

export default function PoliticaPrivacidadePage() {
  return (
    <LegalPageLayout
      title="Política de Privacidade do Praja"
      lastUpdated="10 de março de 2026"
      icon={<Shield size={32} color="#ffffff" weight="duotone" />}
      sections={sections}
      breadcrumb={[
        { label: 'Início', href: '/' },
        { label: 'Política de Privacidade' },
      ]}
    >
      <section id="1-coleta-de-dados" className="mb-4 border rounded-4 p-4 bg-white legal-section-anchor">
        <SectionTitle number="1" title="Coleta de dados" />
        <p>
          Coletamos dados informados por você durante cadastro, autenticação e uso da plataforma, incluindo informações de perfil, clientes e
          agendamentos. Também coletamos dados operacionais de navegação para segurança, estabilidade e melhoria contínua da experiência.
        </p>
        <div className="rounded-3 p-3 mt-3" style={{ borderLeft: '4px solid #0ea5e9', background: '#eff6ff' }}>
          <p className="small mb-0">
            <strong>Importante:</strong> dados de pagamento (cartão de crédito) são processados diretamente pela <strong>ASAAS</strong>. O Praja não
            armazena esses dados sensíveis.
          </p>
        </div>
      </section>

      <section id="2-uso-dos-dados" className="mb-4 border rounded-4 p-4 bg-white legal-section-anchor">
        <SectionTitle number="2" title="Uso dos dados" />
        <p>Os dados são utilizados para operação segura da plataforma, atendimento e evolução do produto. Utilizamos suas informações para:</p>
        <ul>
          <li>Fornecer e manter a plataforma de agendamento.</li>
          <li>Processar assinaturas e cobranças via ASAAS.</li>
          <li>Enviar lembretes por WhatsApp, quando autorizado.</li>
          <li>Sincronizar dados com Google Calendar, Google Meet e Google Contacts, quando conectado.</li>
          <li>Prevenir fraude, monitorar segurança e melhorar suporte.</li>
        </ul>
      </section>

      <section id="3-compartilhamento" className="mb-4 border rounded-4 p-4 bg-white legal-section-anchor">
        <SectionTitle number="3" title="Compartilhamento" />
        <p>
          Não comercializamos dados pessoais. O compartilhamento ocorre apenas quando necessário para execução do serviço, por integrações autorizadas
          por você ou por obrigação legal.
        </p>

        <div className="row g-2 mt-1">
          <div className="col-12 col-md-6">
            <div className="border rounded-3 p-3 h-100">
              <h3 className="h6 mb-1" style={{ color: '#0f172a' }}>ASAAS</h3>
              <p className="small text-secondary mb-0">Processamento de pagamentos e gestão de assinaturas.</p>
            </div>
          </div>
          <div className="col-12 col-md-6">
            <div className="border rounded-3 p-3 h-100">
              <h3 className="h6 mb-1" style={{ color: '#0f172a' }}>Google</h3>
              <p className="small text-secondary mb-0">Integrações de Calendar, Meet e People quando autorizadas por OAuth.</p>
            </div>
          </div>
          <div className="col-12 col-md-6">
            <div className="border rounded-3 p-3 h-100">
              <h3 className="h6 mb-1" style={{ color: '#0f172a' }}>WhatsApp</h3>
              <p className="small text-secondary mb-0">Envio de confirmações, alertas e lembretes operacionais.</p>
            </div>
          </div>
          <div className="col-12 col-md-6">
            <div className="border rounded-3 p-3 h-100">
              <h3 className="h6 mb-1" style={{ color: '#0f172a' }}>KoddaHub</h3>
              <p className="small text-secondary mb-0">Operação técnica, manutenção e suporte da plataforma Praja.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="4-seguranca" className="mb-4 border rounded-4 p-4 bg-white legal-section-anchor">
        <SectionTitle number="4" title="Segurança" />
        <p>Aplicamos medidas técnicas e organizacionais para proteger os dados contra acesso indevido, alteração, perda e vazamento:</p>
        <ul>
          <li>Criptografia de dados em trânsito (SSL/TLS).</li>
          <li>Controle de acesso e autenticação segura.</li>
          <li>Monitoramento contínuo de eventos e logs de segurança.</li>
          <li>Backups regulares e procedimentos de recuperação.</li>
        </ul>
      </section>

      <section id="5-direitos-lgpd" className="mb-4 border rounded-4 p-4 bg-white legal-section-anchor">
        <SectionTitle number="5" title="Direitos do titular (LGPD)" />
        <p>
          Você pode solicitar acesso, correção, exclusão, portabilidade e revogação de consentimento conforme a LGPD, usando os canais oficiais de
          atendimento.
        </p>
        <div className="rounded-4 border p-3 bg-light">
          <h3 className="h6 mb-2" style={{ color: '#0f172a' }}>Canais de atendimento</h3>
          <p className="small mb-1">
            <strong>Email:</strong> <a href="mailto:lgpd@praja.com.br">lgpd@praja.com.br</a>
          </p>
          <p className="small mb-1"><strong>Prazo de resposta:</strong> até 15 dias úteis</p>
          <p className="small mb-0"><strong>Encarregado (DPO):</strong> Equipe KoddaHub</p>
        </div>
      </section>

      <div className="pt-3 text-center">
        <p className="small text-secondary mb-0">
          Esta política é revisada periodicamente. Recomendamos consultar esta página regularmente.
        </p>
      </div>
    </LegalPageLayout>
  );
}
