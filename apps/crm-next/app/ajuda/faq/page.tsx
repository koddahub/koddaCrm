import type { Metadata } from 'next';
import Link from 'next/link';
import { ChatCircleDots } from '@phosphor-icons/react/dist/ssr';
import { HelpLayout } from '@/components/help/HelpLayout';
import { FAQSection } from '@/components/help/FAQSection';
import { getHelpFaqSections } from '@/lib/help-center';

export const metadata: Metadata = {
  title: 'FAQ | Central de Ajuda Praja',
  description: 'Perguntas frequentes sobre uso, pagamentos e integrações do Praja.',
  alternates: {
    canonical: '/ajuda/faq',
  },
};

export default function HelpFaqPage() {
  const faqs = getHelpFaqSections();

  return (
    <HelpLayout
      title="Perguntas Frequentes (FAQ)"
      breadcrumb={[
        { label: 'Central de Ajuda', href: '/ajuda' },
        { label: 'FAQ', href: '#' },
      ]}
    >
      <div className="mx-auto" style={{ maxWidth: 860 }}>
        {faqs.map((section) => (
          <FAQSection key={section.category} section={section} />
        ))}

        <div className="text-center mt-4">
          <p className="text-secondary mb-2">Não encontrou o que procurava?</p>
          <Link href="/ajuda/contato" className="btn btn-primary d-inline-flex align-items-center gap-2">
            <ChatCircleDots size={18} />
            Falar com suporte
          </Link>
        </div>
      </div>
    </HelpLayout>
  );
}
