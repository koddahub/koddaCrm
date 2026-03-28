interface FAQSectionProps {
  section: {
    category: string;
    questions: Array<{ q: string; a: string }>;
  };
}

export function FAQSection({ section }: FAQSectionProps) {
  return (
    <section className="mb-4">
      <h2 className="h5 mb-3" style={{ color: '#0f172a' }}>{section.category}</h2>
      <div className="d-flex flex-column gap-2">
        {section.questions.map((item, index) => (
          <details key={`${section.category}-${index}`} className="border rounded-3 bg-white p-3">
            <summary className="fw-semibold" style={{ cursor: 'pointer' }}>{item.q}</summary>
            <p className="small text-secondary mt-2 mb-0">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
