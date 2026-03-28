import Link from 'next/link';
import {
  CalendarBlank,
  CreditCard,
  Gear,
  GoogleLogo,
  UsersThree,
  VideoCamera,
} from '@phosphor-icons/react/dist/ssr';
import { getHelpCategories } from '@/lib/help-center';

function iconForCategory(icon: string) {
  switch (icon) {
    case 'calendar':
      return <CalendarBlank size={22} color="#2563eb" />;
    case 'credit-card':
      return <CreditCard size={22} color="#16a34a" />;
    case 'integrations':
      return <GoogleLogo size={22} color="#059669" />;
    case 'users':
      return <UsersThree size={22} color="#7c3aed" />;
    case 'video':
      return <VideoCamera size={22} color="#ef4444" />;
    case 'gear':
      return <Gear size={22} color="#64748b" />;
    default:
      return <CalendarBlank size={22} color="#2563eb" />;
  }
}

export function CategoryGrid() {
  const categories = getHelpCategories();

  return (
    <div className="row g-3">
      {categories.map((category) => (
        <div key={category.slug} className="col-12 col-md-6 col-lg-4">
          <Link href={`/ajuda/categoria/${category.slug}`} className="text-decoration-none">
            <div className="bg-white border rounded-4 p-4 h-100 shadow-sm">
              <div className="d-inline-flex align-items-center justify-content-center rounded-3 mb-3" style={{ width: 44, height: 44, background: '#f8fafc' }}>
                {iconForCategory(category.icon)}
              </div>
              <h4 className="h6 mb-1" style={{ color: '#0f172a' }}>{category.title}</h4>
              <p className="small text-secondary mb-2">{category.description}</p>
              <span className="small text-secondary">{category.articleCount} artigos</span>
            </div>
          </Link>
        </div>
      ))}
    </div>
  );
}
