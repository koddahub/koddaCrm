import Link from 'next/link';
import { getHelpFaqSections } from '@/lib/help-center';

export function FAQPreview() {
  const sections = getHelpFaqSections();
  const questions = sections.flatMap((section) => section.questions).slice(0, 4);

  return (
    <section className="bg-white border rounded-4 p-4 h-100">
      <h3 className="h5 mb-3" style={{ color: '#0f172a' }}>FAQ</h3>
      <div className="d-flex flex-column gap-2">
        {questions.map((item, index) => (
          <Link key={`${item.q}-${index}`} href="/ajuda/faq" className="text-decoration-none text-dark">
            <div className="border rounded-3 p-3">
              <p className="small mb-0">{item.q}</p>
            </div>
          </Link>
        ))}
      </div>
      <Link href="/ajuda/faq" className="btn btn-outline-primary btn-sm mt-3">
        Ver FAQ completo
      </Link>
    </section>
  );
}
