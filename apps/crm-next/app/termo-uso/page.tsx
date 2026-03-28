import type { Metadata } from 'next';
import {
  ArrowsClockwise,
  CheckCircle,
  Clock,
  FileText,
  Info,
  WarningCircle,
  XCircle,
} from '@phosphor-icons/react/dist/ssr';
import { LegalPageLayout } from '@/components/legal/LegalPageLayout';

export const metadata: Metadata = {
  title: 'Termos de Uso | Praja',
  description: 'Termos e condições para uso da plataforma Praja. Leia atentamente antes de utilizar nossos serviços.',
  alternates: {
    canonical: '/termo-uso',
  },
  openGraph: {
    title: 'Termos de Uso | Praja',
    description: 'Condições de uso da plataforma Praja, incluindo responsabilidades, disponibilidade e atualizações.',
    url: 'https://praja.koddahub.com.br/termo-uso',
    siteName: 'Praja',
    locale: 'pt_BR',
    type: 'article',
  },
};

const sections = [
  { id: '1-aceite', label: '1. Aceite dos termos' },
  { id: '2-responsabilidades', label: '2. Responsabilidades' },
  { id: '3-uso-permitido', label: '3. Uso permitido' },
  { id: '4-disponibilidade', label: '4. Disponibilidade' },
  { id: '5-alteracoes', label: '5. Alterações' },
  { id: '6-disposicoes-gerais', label: '6. Disposições gerais' },
];

function SectionCard({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-4 border rounded-4 p-4 bg-white legal-section-anchor">
      <h2 className="h4 mb-3 d-flex align-items-center gap-2" style={{ color: '#0f172a' }}>
        <span
          className="d-inline-flex align-items-center justify-content-center rounded-3"
          style={{ width: 32, height: 32, background: '#e0f2fe', color: '#0284c7', fontWeight: 700 }}
        >
          {number}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function TermoUsoPage() {
  return (
    <LegalPageLayout
      title="Termos de Uso"
      lastUpdated="10 de março de 2026"
      icon={<FileText size={32} color="#ffffff" weight="duotone" />}
      sections={sections}
      breadcrumb={[
        { label: 'Início', href: '/' },
        { label: 'Termos de Uso' },
      ]}
    >
      <SectionCard id="1-aceite" number="1" title="Aceite dos Termos">
        <div className="rounded-3 p-3 mb-3" style={{ borderLeft: '4px solid #0ea5e9', background: '#eff6ff' }}>
          <p className="small mb-0">
            <strong>Importante:</strong> ao utilizar a plataforma Praja, você concorda com estes termos e com a Política de Privacidade vigente.
          </p>
        </div>
        <p>
          Estes Termos de Uso formam um contrato entre o Usuário e a KoddaHub, desenvolvedora e operadora do Praja. Ao criar conta, acessar ou usar
          funcionalidades do sistema, você declara que leu e aceitou integralmente estas condições.
        </p>
        <p className="small mb-0 d-inline-flex align-items-center gap-2 text-secondary">
          <CheckCircle size={16} color="#10b981" weight="fill" />
          Ao se cadastrar, você confirma o aceite dos termos.
        </p>
      </SectionCard>

      <SectionCard id="2-responsabilidades" number="2" title="Responsabilidades do Usuário">
        <div className="row g-2">
          <div className="col-12 col-md-6">
            <div className="border rounded-3 p-3 h-100">
              <h3 className="h6 mb-1" style={{ color: '#0f172a' }}>Veracidade dos dados</h3>
              <p className="small text-secondary mb-0">As informações de cadastro e uso devem ser corretas e atualizadas.</p>
            </div>
          </div>
          <div className="col-12 col-md-6">
            <div className="border rounded-3 p-3 h-100">
              <h3 className="h6 mb-1" style={{ color: '#0f172a' }}>Segurança da conta</h3>
              <p className="small text-secondary mb-0">O usuário é responsável por proteger credenciais e acessos.</p>
            </div>
          </div>
          <div className="col-12 col-md-6">
            <div className="border rounded-3 p-3 h-100">
              <h3 className="h6 mb-1" style={{ color: '#0f172a' }}>Uso adequado</h3>
              <p className="small text-secondary mb-0">A plataforma deve ser usada conforme sua finalidade e dentro da lei.</p>
            </div>
          </div>
          <div className="col-12 col-md-6">
            <div className="border rounded-3 p-3 h-100">
              <h3 className="h6 mb-1" style={{ color: '#0f172a' }}>Incidentes</h3>
              <p className="small text-secondary mb-0">Qualquer suspeita de acesso indevido deve ser comunicada imediatamente.</p>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard id="3-uso-permitido" number="3" title="Uso Permitido e Restrições">
        <div className="rounded-3 p-3 mb-3" style={{ borderLeft: '4px solid #f59e0b', background: '#fffbeb' }}>
          <p className="small mb-0 d-flex align-items-start gap-2">
            <WarningCircle size={16} color="#f59e0b" className="mt-1" />
            <span>
              É proibido usar o Praja para práticas ilegais, fraude, abuso de recursos ou violação de direitos de terceiros.
            </span>
          </p>
        </div>

        <div className="d-flex flex-column gap-2">
          {[
            ['Práticas ilegais', 'Não utilize o Praja para atividades contrárias à legislação.'],
            ['Fraude', 'É vedada qualquer tentativa de burlar pagamento, cobrança ou assinatura.'],
            ['Abuso de recursos', 'Não é permitido sobrecarregar intencionalmente a infraestrutura.'],
            ['Violação de direitos', 'Não use dados de terceiros sem autorização ou em desrespeito à propriedade intelectual.'],
          ].map(([title, description]) => (
            <div key={title} className="rounded-3 p-3 d-flex align-items-start gap-2" style={{ background: '#fef2f2' }}>
              <XCircle size={16} color="#ef4444" className="mt-1" />
              <div>
                <h3 className="h6 mb-1" style={{ color: '#b91c1c' }}>{title}</h3>
                <p className="small text-secondary mb-0">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard id="4-disponibilidade" number="4" title="Disponibilidade do Serviço">
        <p>
          O Praja busca alta disponibilidade, podendo haver indisponibilidades temporárias por manutenção, atualizações e fatores externos.
        </p>
        <div className="d-flex flex-column gap-2 mt-2">
          <div className="d-flex align-items-start gap-2">
            <Clock size={16} color="#0ea5e9" className="mt-1" />
            <div>
              <h3 className="h6 mb-1" style={{ color: '#0f172a' }}>Manutenções programadas</h3>
              <p className="small text-secondary mb-0">Sempre que possível, comunicadas com antecedência mínima de 24 horas.</p>
            </div>
          </div>
          <div className="d-flex align-items-start gap-2">
            <ArrowsClockwise size={16} color="#0ea5e9" className="mt-1" />
            <div>
              <h3 className="h6 mb-1" style={{ color: '#0f172a' }}>Atualizações críticas</h3>
              <p className="small text-secondary mb-0">Podem ocorrer sem aviso prévio quando necessárias para segurança.</p>
            </div>
          </div>
        </div>
        <div className="rounded-3 p-3 mt-3 bg-light border">
          <p className="small mb-0">
            <strong>SLA de referência:</strong> 99,5% de disponibilidade mensal, excetuadas manutenções programadas e casos de força maior.
          </p>
        </div>
      </SectionCard>

      <SectionCard id="5-alteracoes" number="5" title="Alterações nos Termos">
        <p>
          Estes termos podem ser atualizados periodicamente. O uso contínuo da plataforma após atualização representa aceite da versão revisada.
        </p>
        <div className="d-flex flex-column gap-2 mt-2">
          <div className="rounded-3 p-3 d-flex align-items-start gap-2" style={{ background: '#eff6ff' }}>
            <Info size={16} color="#0ea5e9" className="mt-1" />
            <p className="small mb-0">Alterações relevantes serão comunicadas por e-mail ou aviso na plataforma.</p>
          </div>
          <div className="rounded-3 p-3 d-flex align-items-start gap-2" style={{ background: '#eff6ff' }}>
            <Info size={16} color="#0ea5e9" className="mt-1" />
            <p className="small mb-0">Caso não concorde com as mudanças, você pode cancelar sua conta conforme regras aplicáveis.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard id="6-disposicoes-gerais" number="6" title="Disposições Gerais">
        <div className="d-flex flex-column gap-2">
          <p className="mb-0"><strong>Lei aplicável:</strong> legislação brasileira.</p>
          <p className="mb-0"><strong>Foro:</strong> Comarca de Curitiba/PR, salvo competência legal diversa.</p>
          <p className="mb-0">
            <strong>Contato jurídico:</strong> <a href="mailto:legal@praja.com.br">legal@praja.com.br</a>
          </p>
        </div>
      </SectionCard>

      <div className="border rounded-4 p-3 bg-white mt-3">
        <h3 className="h6 mb-2" style={{ color: '#0f172a' }}>Resumo para você</h3>
        <div className="row g-2 text-center">
          <div className="col-12 col-md-4">
            <div className="border rounded-3 p-3 h-100">
              <CheckCircle size={18} color="#10b981" className="mb-1" />
              <p className="small mb-0 text-secondary">Leia e aceite os termos</p>
            </div>
          </div>
          <div className="col-12 col-md-4">
            <div className="border rounded-3 p-3 h-100">
              <FileText size={18} color="#0ea5e9" className="mb-1" />
              <p className="small mb-0 text-secondary">Use a plataforma com responsabilidade</p>
            </div>
          </div>
          <div className="col-12 col-md-4">
            <div className="border rounded-3 p-3 h-100">
              <ArrowsClockwise size={18} color="#f59e0b" className="mb-1" />
              <p className="small mb-0 text-secondary">Acompanhe atualizações</p>
            </div>
          </div>
        </div>
      </div>

      <div className="text-center mt-3">
        <p className="small text-secondary mb-0">Estes Termos de Uso foram atualizados pela última vez em 10 de março de 2026.</p>
      </div>
    </LegalPageLayout>
  );
}
