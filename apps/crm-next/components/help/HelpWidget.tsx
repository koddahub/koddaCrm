'use client';

import Link from 'next/link';
import { BookOpenText, ChatCircleDots, Question, X } from '@phosphor-icons/react';
import { useState } from 'react';

export function HelpWidget() {
  const [open, setOpen] = useState(false);

  return (
    <div className="position-relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="btn rounded-circle shadow"
        style={{ width: 56, height: 56, background: '#0ea5e9', color: '#fff' }}
        aria-label="Abrir ajuda rápida"
      >
        {open ? <X size={22} /> : <Question size={22} weight="fill" />}
      </button>

      {open ? (
        <div
          className="bg-white border rounded-4 shadow position-absolute"
          style={{ width: 280, right: 0, bottom: 68, overflow: 'hidden' }}
        >
          <div className="p-3" style={{ background: 'linear-gradient(135deg, #0f172a, #0ea5e9)', color: '#fff' }}>
            <h4 className="h6 mb-1">Precisa de ajuda?</h4>
            <p className="small mb-0" style={{ opacity: 0.9 }}>Escolha uma opção abaixo</p>
          </div>
          <div className="p-2 d-flex flex-column gap-1">
            <Link href="/ajuda" className="text-decoration-none text-dark p-2 rounded-3" onClick={() => setOpen(false)}>
              <div className="d-flex align-items-center gap-2">
                <BookOpenText size={20} color="#0ea5e9" />
                <div>
                  <p className="small fw-semibold mb-0">Central de Ajuda</p>
                  <p className="small text-secondary mb-0">Artigos e tutoriais</p>
                </div>
              </div>
            </Link>

            <Link href="/ajuda/contato" className="text-decoration-none text-dark p-2 rounded-3" onClick={() => setOpen(false)}>
              <div className="d-flex align-items-center gap-2">
                <ChatCircleDots size={20} color="#16a34a" />
                <div>
                  <p className="small fw-semibold mb-0">Falar com suporte</p>
                  <p className="small text-secondary mb-0">Atendimento em horário comercial</p>
                </div>
              </div>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
