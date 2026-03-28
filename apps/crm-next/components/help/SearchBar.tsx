'use client';

import Link from 'next/link';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getHelpSearchSuggestions } from '@/lib/help-center';

interface SearchBarProps {
  placeholder?: string;
  className?: string;
  showSuggestions?: boolean;
  initialQuery?: string;
}

export function SearchBar({ placeholder, className, showSuggestions = true, initialQuery = '' }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const suggestions = getHelpSearchSuggestions(query, 6);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!query.trim()) {
      return;
    }
    setIsOpen(false);
    router.push(`/ajuda/busca?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <div ref={wrapperRef} className={`position-relative ${className || ''}`}>
      <form onSubmit={submitSearch}>
        <div className="position-relative">
          <MagnifyingGlass size={20} color="#94a3b8" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            value={query}
            onFocus={() => showSuggestions && setIsOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              if (showSuggestions) {
                setIsOpen(true);
              }
            }}
            placeholder={placeholder || 'Buscar artigos...'}
            className="form-control"
            style={{ paddingLeft: 42, paddingRight: 40, minHeight: 48 }}
          />
          {query ? (
            <button
              type="button"
              className="btn btn-link p-0 border-0"
              onClick={() => setQuery('')}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}
              aria-label="Limpar busca"
            >
              <X size={18} color="#94a3b8" />
            </button>
          ) : null}
        </div>
      </form>

      {showSuggestions && isOpen ? (
        <div className="position-absolute w-100 bg-white border rounded-3 shadow-sm mt-2 overflow-hidden" style={{ zIndex: 20 }}>
          {suggestions.length > 0 ? (
            suggestions.map((suggestion) => (
              <Link
                key={suggestion}
                href={`/ajuda/busca?q=${encodeURIComponent(suggestion)}`}
                className="d-block px-3 py-2 text-decoration-none text-dark"
                onClick={() => setIsOpen(false)}
              >
                {suggestion}
              </Link>
            ))
          ) : (
            <div className="px-3 py-2 text-secondary small">Nenhuma sugestão para este termo.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
