import Link from 'next/link';
import { ArrowRight } from '@phosphor-icons/react/dist/ssr';
import { getPopularHelpArticles } from '@/lib/help-center';

export function PopularArticles() {
  const articles = getPopularHelpArticles(6);

  return (
    <section className="bg-white border rounded-4 p-4 h-100">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h3 className="h5 mb-0" style={{ color: '#0f172a' }}>Artigos populares</h3>
      </div>
      <div className="d-flex flex-column gap-3">
        {articles.map((article) => (
          <Link key={article.slug} href={`/ajuda/artigo/${article.slug}`} className="text-decoration-none">
            <div className="border rounded-3 p-3">
              <h4 className="h6 mb-1" style={{ color: '#0f172a' }}>{article.title}</h4>
              <p className="small text-secondary mb-1">{article.description}</p>
              <div className="d-flex align-items-center justify-content-between">
                <span className="small text-secondary">{article.readTime} min de leitura</span>
                <span className="small d-inline-flex align-items-center gap-1">
                  Ler artigo <ArrowRight size={14} />
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
