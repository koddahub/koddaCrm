import Link from 'next/link';
import { getRelatedHelpArticles } from '@/lib/help-center';

interface RelatedArticlesProps {
  categorySlug: string;
  currentSlug: string;
}

export function RelatedArticles({ categorySlug, currentSlug }: RelatedArticlesProps) {
  const articles = getRelatedHelpArticles(currentSlug, categorySlug, 4);

  if (articles.length === 0) {
    return null;
  }

  return (
    <section className="mt-4">
      <h3 className="h5 mb-3" style={{ color: '#0f172a' }}>Artigos relacionados</h3>
      <div className="row g-3">
        {articles.map((article) => (
          <div key={article.slug} className="col-12 col-md-6">
            <Link href={`/ajuda/artigo/${article.slug}`} className="text-decoration-none">
              <div className="border rounded-3 p-3 h-100">
                <h4 className="h6 mb-1" style={{ color: '#0f172a' }}>{article.title}</h4>
                <p className="small text-secondary mb-0">{article.description}</p>
              </div>
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
