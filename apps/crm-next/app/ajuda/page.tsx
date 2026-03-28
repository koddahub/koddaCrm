import type { Metadata } from 'next';
import Link from 'next/link';
import { HelpLayout } from '@/components/help/HelpLayout';
import { SearchBar } from '@/components/help/SearchBar';
import { CategoryGrid } from '@/components/help/CategoryGrid';
import { PopularArticles } from '@/components/help/PopularArticles';
import { FAQPreview } from '@/components/help/FAQPreview';

export const metadata: Metadata = {
  title: 'Central de Ajuda | Praja',
  description: 'Encontre respostas sobre integrações, pagamentos, agenda, clientes e configurações do Praja.',
  alternates: {
    canonical: '/ajuda',
  },
  openGraph: {
    title: 'Central de Ajuda | Praja',
    description: 'Artigos, tutoriais e FAQ para autoatendimento no Praja.',
    url: 'https://praja.koddahub.com.br/ajuda',
    siteName: 'Praja',
    locale: 'pt_BR',
    type: 'website',
  },
};

export default function HelpHomePage() {
  return (
    <HelpLayout>
      <section className="text-center mb-5">
        <h1 className="mb-2" style={{ color: '#0f172a', fontSize: '2rem' }}>Como podemos ajudar?</h1>
        <p className="text-secondary mb-3">Busque por artigos, tutoriais e perguntas frequentes.</p>
        <div className="mx-auto" style={{ maxWidth: 760 }}>
          <SearchBar
            placeholder='Ex.: "Conectar Google Agenda", "Cancelar assinatura", "Lembretes WhatsApp"'
            className="mx-auto"
            showSuggestions
          />
        </div>
      </section>

      <section className="mb-5">
        <h2 className="h4 mb-3" style={{ color: '#0f172a' }}>Explore por categoria</h2>
        <CategoryGrid />
      </section>

      <section className="row g-3 mb-5">
        <div className="col-12 col-lg-8">
          <PopularArticles />
        </div>
        <div className="col-12 col-lg-4">
          <FAQPreview />
        </div>
      </section>

      <section
        className="rounded-4 p-4 text-center"
        style={{ background: 'linear-gradient(135deg, #0f172a, #0ea5e9)', color: '#fff' }}
      >
        <h3 className="h4 mb-2">Ainda precisa de ajuda?</h3>
        <p className="mb-3" style={{ opacity: 0.9 }}>Nossa equipe está pronta para apoiar você.</p>
        <div className="d-flex flex-wrap justify-content-center gap-2">
          <Link href="/ajuda/contato" className="btn btn-light">Falar com suporte</Link>
          <Link href="/ajuda/faq" className="btn btn-outline-light">Ver FAQ completo</Link>
        </div>
      </section>
    </HelpLayout>
  );
}
