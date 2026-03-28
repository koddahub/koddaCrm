import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { HelpLayout } from '@/components/help/HelpLayout';
import { getHelpArticlesByCategory, getHelpCategoryBySlug } from '@/lib/help-center';

interface HelpCategoryPageProps {
  params: { slug: string };
}

export function generateMetadata({ params }: HelpCategoryPageProps): Metadata {
  const category = getHelpCategoryBySlug(params.slug);
  if (!category) {
    return { title: 'Categoria não encontrada | Central de Ajuda' };
  }

  return {
    title: `${category.title} | Central de Ajuda Praja`,
    description: category.description,
    alternates: {
      canonical: `/ajuda/categoria/${category.slug}`,
    },
  };
}

export default function HelpCategoryPage({ params }: HelpCategoryPageProps) {
  const category = getHelpCategoryBySlug(params.slug);
  if (!category) {
    notFound();
  }

  const articles = getHelpArticlesByCategory(category.slug);

  return (
    <HelpLayout
      title={category.title}
      breadcrumb={[
        { label: 'Central de Ajuda', href: '/ajuda' },
        { label: category.title, href: '#' },
      ]}
    >
      <p className="text-secondary mb-4">{category.description}</p>

      <div className="d-flex flex-column gap-3">
        {articles.map((article) => (
          <Link key={article.slug} href={`/ajuda/artigo/${article.slug}`} className="text-decoration-none">
            <article className="bg-white border rounded-4 p-4">
              <h2 className="h5 mb-1" style={{ color: '#0f172a' }}>{article.title}</h2>
              <p className="small text-secondary mb-2">{article.description}</p>
              <span className="small text-secondary">{article.readTime} min de leitura</span>
            </article>
          </Link>
        ))}
      </div>
    </HelpLayout>
  );
}
