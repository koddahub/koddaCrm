'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const BACKDROP_SELECTORS = '.modal-backdrop, .offcanvas-backdrop, .crm-v2-modal-backdrop';

function clearStaleOverlays() {
  if (typeof document === 'undefined') return;

  const hasActiveBootstrapLayer = Boolean(document.querySelector('.modal.show, .offcanvas.show'));
  const hasActiveCrmLayer = Boolean(document.querySelector('.crm-v2-modal .crm-v2-modal-content'));

  if (hasActiveBootstrapLayer || hasActiveCrmLayer) return;

  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');
  document.documentElement.style.removeProperty('overflow');
  document.querySelectorAll(BACKDROP_SELECTORS).forEach((element) => element.remove());
}

export function UiOverlayReset() {
  const pathname = usePathname();

  useEffect(() => {
    clearStaleOverlays();
  }, [pathname]);

  useEffect(() => {
    const onPageShow = () => clearStaleOverlays();
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  return null;
}
