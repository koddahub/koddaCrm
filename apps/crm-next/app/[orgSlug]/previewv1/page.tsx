type PreviewPageProps = {
  params: {
    orgSlug: string;
  };
  searchParams?: {
    entry?: string;
  };
};

function sanitizeEntry(input?: string) {
  const normalized = String(input || 'index.html').replace(/^\/+/, '').trim() || 'index.html';
  if (normalized.includes('..') || normalized.includes('\0')) return 'index.html';
  return normalized;
}

export default function PreviewV1Page({ params, searchParams }: PreviewPageProps) {
  const orgSlug = encodeURIComponent(params.orgSlug || '');
  const entry = sanitizeEntry(searchParams?.entry);
  const iframeSrc = `/preview-proxy/${orgSlug}/${entry}`;

  return (
    <main style={{ minHeight: '100vh', background: '#0b1220', color: '#fff' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 16px',
          borderBottom: '1px solid rgba(148,163,184,0.28)',
          background: 'rgba(15,23,42,0.88)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <strong style={{ fontSize: 14 }}>Preview V1 - {params.orgSlug}</strong>
        <a
          href={iframeSrc}
          target="_blank"
          rel="noreferrer"
          style={{
            fontSize: 13,
            color: '#bfdbfe',
            textDecoration: 'none',
            border: '1px solid rgba(191,219,254,0.45)',
            borderRadius: 8,
            padding: '6px 10px',
          }}
        >
          Abrir preview direto
        </a>
      </header>
      <iframe
        src={iframeSrc}
        title={`Preview ${params.orgSlug}`}
        style={{ width: '100%', height: 'calc(100vh - 52px)', border: 0, background: '#fff' }}
      />
    </main>
  );
}
