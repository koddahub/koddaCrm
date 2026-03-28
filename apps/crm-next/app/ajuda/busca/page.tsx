import type { Metadata } from 'next';
import Link from 'next/link';
import { HelpLayout } from '@/components/help/HelpLayout';
import { SearchBar } from '@/components/help/SearchBar';
import { searchHelpArticles } from '@/lib/help-center';

interface HelpSearchPageProps {
  searchParams?: { q?: string };
}

export const metadata: Metadata = {
  title: 'Buscar na Central de Ajuda | Praja',
  description: 'Resultados de busca da central de ajuda do Praja.',
  alternates: {
    canonical: '/ajuda/busca',
  },
};

export default function HelpSearchPage({ searchParams }: HelpSearchPageProps) {
  const query = (searchParams?.q || '').trim();
  const results = query ? searchHelpArticles(query) : [];

  return (
    <HelpLayout
      title="Resultados da busca"
      breadcrumb={[
        { label: 'Central de Ajuda', href: '/ajuda' },
        { label: 'Busca', href: '#' },
      ]}
    >
      <div className="mb-4" style={{ maxWidth: 760 }}>
        <SearchBar initialQuery={query} showSuggestions placeholder="Buscar por termo..." />
      </div>

      {query ? <p className="text-secondary">Busca por: <strong>{query}</strong></p> : <p className="text-secondary">Digite um termo para buscar.</p>}

      {query && results.length === 0 ? (
        <div className="bg-white border rounded-4 p-4 mt-3">
          <p className="mb-2">Nenhum resultado encontrado.</p>
          <p className="small text-secondary mb-0">Tente termos como: Google Agenda, WhatsApp, cancelamento, fatura.</p>
        </div>
      ) : null}

      <div className="d-flex flex-column gap-3 mt-3">
        {results.map((article) => (
          <Link key={article.slug} href={`/ajuda/artigo/${article.slug}`} className="text-decoration-none">
            <article className="bg-white border rounded-4 p-4">
              <h2 className="h5 mb-1" style={{ color: '#0f172a' }}>{article.title}</h2>
              <p className="small text-secondary mb-1">{article.description}</p>
              <span className="badge text-bg-light border">{article.categoryName}</span>
            </article>
          </Link>
        ))}
      </div>
    </HelpLayout>
  );
}
