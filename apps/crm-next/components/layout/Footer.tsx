import Link from 'next/link';
import {
  ArrowUp,
  Envelope,
  Heart,
  InstagramLogo,
  LinkedinLogo,
  MapPin,
  Phone,
} from '@phosphor-icons/react/dist/ssr';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-light border-top pt-5 pb-4 position-relative">
      <div className="container">
        <div className="row g-4 mb-4">
          <div className="col-12 col-md-6 col-lg-3">
            <h3 className="h5 mb-3" style={{ color: '#0f172a' }}>Praja</h3>
            <p className="small text-secondary mb-0">
              Plataforma SaaS para agendamento profissional com foco em simplicidade, segurança e crescimento do seu negócio.
            </p>
          </div>

          <div className="col-12 col-md-6 col-lg-3">
            <h4 className="h6 mb-3" style={{ color: '#0f172a' }}>Produto</h4>
            <ul className="list-unstyled d-flex flex-column gap-2 mb-0">
              <li><Link href="/para-voce#funcionalidades" className="small text-decoration-none text-secondary">Funcionalidades</Link></li>
              <li><Link href="/para-voce#planos" className="small text-decoration-none text-secondary">Planos</Link></li>
              <li><Link href="/para-voce" className="small text-decoration-none text-secondary">Para você</Link></li>
              <li><Link href="/seguranca" className="small text-decoration-none text-secondary">Segurança</Link></li>
            </ul>
          </div>

          <div className="col-12 col-md-6 col-lg-3">
            <h4 className="h6 mb-3" style={{ color: '#0f172a' }}>Suporte</h4>
            <ul className="list-unstyled d-flex flex-column gap-2 mb-0">
              <li><Link href="/ajuda" className="small text-decoration-none text-secondary">Central de ajuda</Link></li>
              <li><Link href="/ajuda/faq" className="small text-decoration-none text-secondary">Perguntas frequentes (FAQ)</Link></li>
              <li><Link href="/ajuda/contato" className="small text-decoration-none text-secondary">Fale conosco</Link></li>
              <li><Link href="/status" className="small text-decoration-none text-secondary">Status do sistema</Link></li>
            </ul>
          </div>

          <div className="col-12 col-md-6 col-lg-3">
            <h4 className="h6 mb-3" style={{ color: '#0f172a' }}>Legal</h4>
            <ul className="list-unstyled d-flex flex-column gap-2 mb-3">
              <li><Link href="/termo-uso" className="small text-decoration-none text-secondary">Termos de uso</Link></li>
              <li><Link href="/politica-privacidade" className="small text-decoration-none text-secondary">Política de privacidade</Link></li>
              <li><Link href="/politica-cookies" className="small text-decoration-none text-secondary">Política de cookies</Link></li>
              <li><Link href="/lgpd" className="small text-decoration-none text-secondary">LGPD</Link></li>
            </ul>

            <div className="d-flex flex-column gap-2">
              <a href="mailto:oi@praja.com.br" className="small text-decoration-none text-secondary d-flex align-items-center gap-2">
                <Envelope size={16} color="#0ea5e9" />
                <span>oi@praja.com.br</span>
              </a>
              <a href="tel:+5541997434837" className="small text-decoration-none text-secondary d-flex align-items-center gap-2">
                <Phone size={16} color="#0ea5e9" />
                <span>(41) 99743-4837</span>
              </a>
              <div className="small text-secondary d-flex align-items-center gap-2">
                <MapPin size={16} color="#0ea5e9" />
                <span>Curitiba, PR - Brasil</span>
              </div>
            </div>
          </div>
        </div>

        <div className="d-flex justify-content-center gap-4 py-3 border-top">
          <a
            href="https://linkedin.com/company/praja"
            target="_blank"
            rel="noopener noreferrer"
            className="text-secondary"
            aria-label="LinkedIn"
          >
            <LinkedinLogo size={24} weight="fill" />
          </a>
          <a
            href="https://instagram.com/praja"
            target="_blank"
            rel="noopener noreferrer"
            className="text-secondary"
            aria-label="Instagram"
          >
            <InstagramLogo size={24} weight="fill" />
          </a>
        </div>

        <div className="d-flex flex-column flex-lg-row justify-content-between align-items-center gap-2 pt-3 border-top">
          <p className="small text-secondary mb-0">© {currentYear} Praja. Todos os direitos reservados.</p>

          <div className="d-flex align-items-center gap-2 small">
            <Link href="/termo-uso" className="text-decoration-none text-secondary">Termos</Link>
            <span className="text-secondary">•</span>
            <Link href="/politica-privacidade" className="text-decoration-none text-secondary">Privacidade</Link>
            <span className="text-secondary">•</span>
            <Link href="/politica-cookies" className="text-decoration-none text-secondary">Cookies</Link>
          </div>

          <div className="d-flex align-items-center gap-1 small text-secondary">
            <span>Desenvolvido com</span>
            <Heart size={12} weight="fill" color="#ef4444" />
            <span>pela</span>
            <a href="https://www.koddahub.com.br" target="_blank" rel="noopener noreferrer" className="text-decoration-none">
              KoddaHub
            </a>
          </div>
        </div>
      </div>

      <a
        href="#topo-site"
        className="btn btn-primary rounded-circle position-fixed shadow d-inline-flex align-items-center justify-content-center"
        style={{ width: 48, height: 48, right: 24, bottom: 24, zIndex: 1000 }}
        aria-label="Voltar ao topo"
      >
        <ArrowUp size={20} weight="bold" />
      </a>
    </footer>
  );
}
