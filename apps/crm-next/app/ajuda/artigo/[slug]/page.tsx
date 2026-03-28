import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarBlank, Clock, User } from '@phosphor-icons/react/dist/ssr';
import { notFound } from 'next/navigation';
import { HelpLayout } from '@/components/help/HelpLayout';
import { ArticleFeedback } from '@/components/help/ArticleFeedback';
import { RelatedArticles } from '@/components/help/RelatedArticles';
import { getHelpArticleBySlug } from '@/lib/help-center';

interface HelpArticlePageProps {
  params: { slug: string };
}

export function generateMetadata({ params }: HelpArticlePageProps): Metadata {
  const article = getHelpArticleBySlug(params.slug);

  if (!article) {
    return {
      title: 'Artigo não encontrado | Central de Ajuda',
    };
  }

  return {
    title: `${article.title} | Central de Ajuda Praja`,
    description: article.description,
    alternates: {
      canonical: `/ajuda/artigo/${article.slug}`,
    },
    openGraph: {
      title: `${article.title} | Central de Ajuda Praja`,
      description: article.description,
      url: `https://praja.koddahub.com.br/ajuda/artigo/${article.slug}`,
      siteName: 'Praja',
      locale: 'pt_BR',
      type: 'article',
    },
  };
}

export default function HelpArticlePage({ params }: HelpArticlePageProps) {
  const article = getHelpArticleBySlug(params.slug);
  if (!article) {
    notFound();
  }

  return (
    <HelpLayout
      breadcrumb={[
        { label: 'Central de Ajuda', href: '/ajuda' },
        { label: article.categoryName, href: `/ajuda/categoria/${article.categorySlug}` },
        { label: article.title, href: '#' },
      ]}
    >
      <article className="mx-auto" style={{ maxWidth: 860 }}>
        <header className="mb-4">
          <span className="badge text-bg-light border mb-2">{article.categoryName}</span>
          <h1 className="mb-2" style={{ color: '#0f172a', fontSize: '2rem' }}>{article.title}</h1>
          <p className="text-secondary mb-3">{article.description}</p>
          <div className="d-flex flex-wrap gap-3 small text-secondary border-top border-bottom py-2">
            <span className="d-inline-flex align-items-center gap-1"><User size={14} /> {article.author}</span>
            <span className="d-inline-flex align-items-center gap-1"><CalendarBlank size={14} /> {new Date(article.publishedAt).toLocaleDateString('pt-BR')}</span>
            <span className="d-inline-flex align-items-center gap-1"><Clock size={14} /> {article.readTime} min</span>
          </div>
        </header>

        <section
          className="bg-white border rounded-4 p-4"
          dangerouslySetInnerHTML={{ __html: article.contentHtml }}
        />

        <ArticleFeedback articleId={article.slug} />
        <RelatedArticles categorySlug={article.categorySlug} currentSlug={article.slug} />

        <div className="mt-4">
          <Link href={`/ajuda/categoria/${article.categorySlug}`} className="btn btn-outline-secondary btn-sm">
            Voltar para {article.categoryName}
          </Link>
        </div>
      </article>
    </HelpLayout>
  );
}
