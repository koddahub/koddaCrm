(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

  const state = { step: 1, maxStep: 4 };

  function setNotice(message, type = 'err') {
    const notice = $('#authInlineNotice');
    if (!notice) return;
    notice.textContent = String(message || '');
    notice.classList.remove('hidden', 'ok', 'err');
    notice.classList.add(type === 'ok' ? 'ok' : 'err');
  }

  function clearNotice() {
    const notice = $('#authInlineNotice');
    if (!notice) return;
    notice.textContent = '';
    notice.classList.add('hidden');
    notice.classList.remove('ok', 'err');
  }

  function getRecaptchaToken(formEl) {
    return (formEl?.querySelector('[name="g-recaptcha-response"]')?.value || '').trim();
  }

  function setTab(tab) {
    clearNotice();
    if (!$('.tab-login') || !$('.tab-signup')) return;
    $$('.tabbtn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $('.tab-login').classList.toggle('hidden', tab !== 'login');
    $('.tab-signup').classList.toggle('hidden', tab !== 'signup');
  }

  function setStep(step) {
    if (!$$('.wizard-step').length) return;
    state.step = Math.max(1, Math.min(state.maxStep, step));
    $$('.wizard-step').forEach((el) => el.classList.add('hidden'));
    const current = $(`.wizard-step[data-step='${state.step}']`);
    if (current) current.classList.remove('hidden');

    const bars = $$('.step');
    bars.forEach((bar, i) => bar.classList.toggle('active', i < state.step));
    const label = $('.step-label');
    if (label) label.textContent = `Etapa ${state.step} de ${state.maxStep}`;

    const prev = $('#wizardPrev');
    const next = $('#wizardNext');
    const submit = $('#wizardSubmit');
    if (prev) prev.disabled = state.step === 1;
    if (next) next.classList.toggle('hidden', state.step === state.maxStep);
    if (submit) submit.classList.toggle('hidden', state.step !== state.maxStep);
  }

  function luhnCheck(num) {
    const digits = String(num || '').replace(/\D/g, '');
    if (digits.length < 13) return false;
    let sum = 0;
    let shouldDouble = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits.charAt(i), 10);
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  }

  function detectBrand(number) {
    const n = String(number).replace(/\D/g, '');
    if (/^4/.test(n)) return 'Visa';
    if (/^5[1-5]/.test(n) || /^2(2[2-9]|[3-6]|7[01]|720)/.test(n)) return 'Mastercard';
    if (/^3[47]/.test(n)) return 'Amex';
    if (/^6(?:011|5)/.test(n)) return 'Discover';
    if (/^5067|^4576|^4011/.test(n)) return 'Elo';
    return 'Cartão';
  }

  function validateStep(step) {
    const block = $(`.wizard-step[data-step='${step}']`);
    if (!block) return true;

    const required = $$('[data-required="true"]', block);
    for (const field of required) {
      if (!field.value || !String(field.value).trim()) {
        const labelText = field.id ? (block.querySelector(`label[for='${field.id}']`)?.textContent || 'campo obrigatório') : 'campo obrigatório';
        setNotice(`Preencha o campo "${labelText.trim()}" para continuar.`);
        field.focus();
        return false;
      }
    }

    if (step === 3) {
      const pass = $('#signup_password')?.value || '';
      const pass2 = $('#signup_password_confirm')?.value || '';
      if (pass.length < 6 || pass !== pass2) {
        setNotice('Senha inválida ou confirmação diferente.');
        return false;
      }
      if (!getRecaptchaToken($('#signupForm'))) {
        setNotice('Conclua o reCAPTCHA para continuar.');
        return false;
      }
    }

    if (step === 4) {
      const method = $('input[name="payment_method"]:checked')?.value || 'CREDIT_CARD';
      if (method === 'CREDIT_CARD') {
        const card = $('#card_number')?.value || '';
        const exp = $('#card_expiry')?.value || '';
        const cvv = $('#card_cvv')?.value || '';

        if (!luhnCheck(card)) {
          setNotice('Número do cartão inválido.');
          return false;
        }
        if (!/^\d{2}\/\d{2}$/.test(exp)) {
          setNotice('Validade inválida. Use MM/AA.');
          return false;
        }
        const [mm, yy] = exp.split('/').map((x) => parseInt(x, 10));
        if (mm < 1 || mm > 12) {
          setNotice('Mês de validade inválido.');
          return false;
        }
        const now = new Date();
        const curY = now.getFullYear() % 100;
        const curM = now.getMonth() + 1;
        if (yy < curY || (yy === curY && mm < curM)) {
          setNotice('Cartão vencido.');
          return false;
        }
        if (!/^\d{3,4}$/.test(cvv)) {
          setNotice('CVV inválido.');
          return false;
        }
      }
    }

    return true;
  }

  function updateCardPreview() {
    const number = $('#card_number')?.value || '';
    const holder = $('#card_holder')?.value || 'Titular';
    const exp = $('#card_expiry')?.value || 'MM/AA';

    const last = String(number).replace(/\D/g, '').slice(-4).padStart(4, '•');
    const brand = detectBrand(number);

    $('#previewBrand') && ($('#previewBrand').textContent = brand);
    $('#previewNumber') && ($('#previewNumber').textContent = `•••• •••• •••• ${last}`);
    $('#previewHolder') && ($('#previewHolder').textContent = holder);
    $('#previewExpiry') && ($('#previewExpiry').textContent = exp);

    const valid = luhnCheck(number);
    const chip = $('#cardValidChip');
    if (chip) {
      chip.textContent = valid ? 'Cartão válido' : 'Aguardando validação';
      chip.className = `status-chip ${valid ? 'status-ok' : 'status-bad'}`;
    }
  }

  async function loginSubmit(e) {
    e.preventDefault();
    clearNotice();
    if (!getRecaptchaToken($('#loginForm'))) {
      setNotice('Conclua o reCAPTCHA para entrar.');
      return;
    }
    const body = Object.fromEntries(new FormData(e.target).entries());
    const res = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) {
      setNotice(data.error || 'Falha no login');
      return;
    }
    location.href = '/portal/dashboard';
  }

  async function signupSubmit(e) {
    e.preventDefault();
    clearNotice();
    for (let i = 1; i <= state.maxStep; i++) {
      if (!validateStep(i)) { setStep(i); return; }
    }

    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());

    const res = await fetch('/api/auth/register-contract', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) {
      let message = data.error || 'Falha no cadastro';
      if (data.details && typeof data.details === 'object') {
        const firstDetail = Object.values(data.details)[0];
        if (firstDetail) message = String(firstDetail);
      }
      setNotice(message);
      return;
    }
    location.href = `/portal/dashboard?new=1&subscription_id=${encodeURIComponent(data.subscription_id || '')}`;
  }

  function toggleGoogleDemoPanel(show) {
    const panel = $('#googleDemoPanel');
    if (!panel) return;
    panel.classList.toggle('hidden', !show);
    if (show) {
      $('#google_demo_email')?.focus();
    }
  }

  async function googleDemoSubmit() {
    clearNotice();
    const email = ($('#google_demo_email')?.value || '').trim();
    const name = ($('#google_demo_name')?.value || '').trim() || 'Cliente Google';
    if (!email) {
      setNotice('Informe um e-mail para continuar com Google (modo demo).');
      return;
    }
    const res = await fetch('/api/auth/google-demo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, name })
    });
    const data = await res.json();
    if (!res.ok) {
      setNotice(data.error || 'Falha no Google Login');
      return;
    }
    location.href = '/portal/dashboard';
  }

  function mount() {
    applyRealtimeValidation();

    if (document.body.dataset.page === 'dashboard') {
      initDashboard();
      return;
    }

    $$('.tabbtn').forEach((btn) => btn.addEventListener('click', () => setTab(btn.dataset.tab)));

    $('#wizardPrev')?.addEventListener('click', () => setStep(state.step - 1));
    $('#wizardNext')?.addEventListener('click', () => {
      if (!validateStep(state.step)) return;
      setStep(state.step + 1);
    });

    $('#loginForm')?.addEventListener('submit', loginSubmit);
    $('#signupForm')?.addEventListener('submit', signupSubmit);

    $('#googleLoginBtn')?.addEventListener('click', () => toggleGoogleDemoPanel(true));
    $('#googleDemoCancel')?.addEventListener('click', () => toggleGoogleDemoPanel(false));
    $('#googleDemoSubmit')?.addEventListener('click', googleDemoSubmit);

    ['#card_number', '#card_holder', '#card_expiry'].forEach((sel) => {
      $(sel)?.addEventListener('input', updateCardPreview);
    });

    $$('.payment-method').forEach((r) => r.addEventListener('change', () => {
      const isCard = $('input[name="payment_method"]:checked')?.value === 'CREDIT_CARD';
      $('.card-fields')?.classList.toggle('hidden', !isCard);
    }));

    const personType = $('#person_type');
    const trade = $('#trade_name_col');
    personType?.addEventListener('change', () => {
      const pj = personType.value === 'PJ';
      trade?.classList.toggle('hidden', !pj);
    });

    $$('.select-plan-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const plan = btn.dataset.plan || 'basic';
        const select = $('#plan_code');
        if (select) select.value = plan;
        setTab('signup');
        setStep(1);
        setNotice(`Plano ${plan.toUpperCase()} pré-selecionado. Complete o cadastro e finalize na etapa de pagamento.`, 'ok');
        $('#person_type')?.focus();
      });
    });

    $('#planPreviewToggle')?.addEventListener('click', () => {
      const wrap = $('.plan-preview-wrap');
      if (!wrap) return;
      wrap.classList.toggle('open');
      const open = wrap.classList.contains('open');
      const toggleBtn = $('#planPreviewToggle');
      if (toggleBtn) toggleBtn.textContent = open ? 'Ocultar planos' : 'Ver planos';
    });

    setTab('login');
    setStep(1);
    updateCardPreview();
  }

  function applyRealtimeValidation() {
    $$('input[required], textarea[required], select[required]').forEach((el) => {
      const check = () => {
        if (!el.value || !String(el.value).trim()) {
          el.style.borderColor = 'rgba(239,68,68,.7)';
          return;
        }
        el.style.borderColor = 'rgba(255,255,255,.18)';
      };
      el.addEventListener('input', check);
      el.addEventListener('change', check);
    });
  }

  function initDashboard() {
    const notice = $('#portalNotice');
    const setPortalNotice = (msg, type = 'ok') => {
      if (!notice) return;
      notice.textContent = msg;
      notice.classList.remove('hidden', 'ok', 'err');
      notice.classList.add(type);
    };

    const validSections = new Set(['dashboard', 'chamados', 'pagamentos', 'planos', 'perfil']);
    const getHashSection = () => {
      const value = (window.location.hash || '#dashboard').replace('#', '').trim();
      return validSections.has(value) ? value : 'dashboard';
    };
    const loadSection = (sectionId) => {
      const target = validSections.has(sectionId) ? sectionId : 'dashboard';
      $$('.portal-section').forEach((section) => section.classList.toggle('active', section.dataset.section === target));
      $$('[data-nav-section]').forEach((item) => item.classList.toggle('active', item.dataset.navSection === target));
    };
    const initNavigation = () => {
      $$('[data-nav-section]').forEach((item) => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          const section = item.dataset.navSection || 'dashboard';
          window.location.hash = section;
          loadSection(section);
        });
      });
      window.addEventListener('hashchange', () => loadSection(getHashSection()));
      loadSection(getHashSection());
    };
    const initDashboardTheme = () => {
      const themeKey = 'koddahub_portal_theme';
      const body = document.body;
      const toggle = $('#themeToggle');
      const applyTheme = (theme) => {
        const normalized = theme === 'light' ? 'light' : 'dark';
        body.setAttribute('data-theme', normalized);
        if (toggle) {
          toggle.setAttribute('aria-pressed', normalized === 'dark' ? 'true' : 'false');
          toggle.innerHTML = normalized === 'dark'
            ? '<i class="bi bi-moon-stars-fill" aria-hidden="true"></i> Escuro'
            : '<i class="bi bi-sun-fill" aria-hidden="true"></i> Claro';
        }
      };
      const saved = (localStorage.getItem(themeKey) || '').toLowerCase();
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(saved === 'light' || saved === 'dark' ? saved : (prefersDark ? 'dark' : 'light'));
      toggle?.addEventListener('click', () => {
        const next = body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        localStorage.setItem(themeKey, next);
      });
    };
    initDashboardTheme();
    initNavigation();

    const ticketForm = $('#ticketForm');
    ticketForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(ticketForm).entries());
      const r = await fetch('/api/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) {
        setPortalNotice(d.error || 'Erro ao abrir chamado', 'err');
        return;
      }
      setPortalNotice('Chamado criado com sucesso.', 'ok');
      setTimeout(() => location.reload(), 700);
    });

    const planForm = $('#planForm');
    planForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(planForm).entries());
      const r = await fetch('/api/billing/subscriptions/' + encodeURIComponent(body.asaas_subscription_id) + '/change-plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const d = await r.json();
      if (!r.ok) {
        setPortalNotice(d.error || 'Erro ao solicitar troca', 'err');
        return;
      }
      setPortalNotice('Solicitação de troca de plano enviada.', 'ok');
    });

    const cardForm = $('#cardForm');
    cardForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(cardForm).entries());
      const r = await fetch('/api/billing/card/update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const d = await r.json();
      if (!r.ok) {
        setPortalNotice(d.error || 'Erro ao atualizar cartão', 'err');
        return;
      }
      setPortalNotice('Cartão atualizado com sucesso.', 'ok');
      cardForm.reset();
    });

    const profileForm = $('#profileForm');
    profileForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(profileForm).entries());
      const r = await fetch('/api/profile/update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const d = await r.json();
      if (!r.ok) {
        setPortalNotice(d.error || 'Erro ao atualizar perfil', 'err');
        return;
      }
      setPortalNotice(d.message || 'Perfil atualizado com sucesso.', 'ok');
      const pwd = profileForm.querySelector('[name="account_password"]');
      const np = profileForm.querySelector('[name="new_password"]');
      const npc = profileForm.querySelector('[name="new_password_confirm"]');
      if (pwd) pwd.value = '';
      if (np) np.value = '';
      if (npc) npc.value = '';
      setTimeout(() => location.reload(), 500);
    });

    const modal = $('#briefingModal');
    const briefInlineNotice = $('#briefInlineNotice');
    const setBriefNotice = (msg, type = 'err') => {
      if (!briefInlineNotice) return;
      briefInlineNotice.textContent = msg;
      briefInlineNotice.classList.remove('hidden', 'ok', 'err');
      briefInlineNotice.classList.add(type === 'ok' ? 'ok' : 'err');
    };
    const clearBriefNotice = () => {
      if (!briefInlineNotice) return;
      briefInlineNotice.textContent = '';
      briefInlineNotice.classList.add('hidden');
      briefInlineNotice.classList.remove('ok', 'err');
    };
    const initBriefUploaders = () => {
      $$('.brief-file-input').forEach((input) => {
        const wrap = input.closest('.file-uploader');
        const meta = wrap?.querySelector('.file-uploader-meta');
        const refresh = () => {
          if (!meta) return;
          const files = input.files ? Array.from(input.files) : [];
          if (!files.length) {
            meta.textContent = 'Nenhum arquivo selecionado';
          } else if (files.length === 1) {
            meta.textContent = files[0].name;
          } else {
            meta.textContent = `${files.length} arquivos selecionados`;
          }
        };
        input.addEventListener('change', refresh);
        refresh();
      });
    };
    const openModal = () => {
      modal?.classList.remove('hidden');
      if (modal) modal.setAttribute('aria-hidden', 'false');
      clearBriefNotice();
    };
    const closeModal = () => {
      modal?.classList.add('hidden');
      if (modal) modal.setAttribute('aria-hidden', 'true');
      clearBriefNotice();
    };
    $$('[data-modal-close]').forEach((el) => el.addEventListener('click', closeModal));
    $('.sidebar-open-briefing')?.addEventListener('click', openModal);

    const draftKey = 'koddahub_briefing_draft_v2';
    const encouragementByStep = {
      1: 'Ótimo começo!',
      2: 'Metade do caminho!',
      3: 'Quase lá!',
      4: 'Últimos detalhes!',
      5: 'Pronto para revisar!',
    };
    let briefStep = 0;
    const maxBriefStep = 5;
    const applyBusinessSuggestions = () => {
      const type = $('select[name="business_type"]')?.value || '';
      const objective = $('textarea[name="objective"]');
      const cta = $('select[name="cta_text"]');
      if (!type || !objective || !cta) return;
      if ((objective.value || '').trim().length > 0) return;
      if (type === 'servicos') {
        objective.value = 'Gerar novos contatos de clientes para orçamento de serviços.';
        cta.value = 'Entrar em contato via WhatsApp';
      } else if (type === 'produtos') {
        objective.value = 'Apresentar produtos e aumentar conversões de vendas.';
        cta.value = 'Comprar agora';
      } else if (type === 'restaurante') {
        objective.value = 'Receber pedidos e reservas com mais agilidade.';
        cta.value = 'Agendar horário';
      }
    };
    const collectCheckedValues = (containerId) => {
      return $$(`#${containerId} input[type="checkbox"]:checked`).map((i) => i.value.trim()).filter(Boolean);
    };
    const buildReview = () => {
      const review = $('#briefReview');
      if (!review) return;
      const data = new FormData($('#briefModalForm'));
      const integrations = collectCheckedValues('integrationsNeeded');
      const pages = collectCheckedValues('pagesNeeded');
      const sections = [
        ['Identidade Visual', [
          `Logo: ${data.get('has_logo') === 'yes' ? 'Já possui' : 'Precisa de criação'}`,
          `Manual de marca: ${data.get('has_brand_manual') || 'Não informado'}`,
          `Cores: ${data.get('brand_colors') || data.get('color_palette') || 'A definir'}`
        ]],
        ['Negócio', [
          `Tipo: ${data.get('business_type') || 'Não informado'}`,
          `Objetivo: ${data.get('objective') || 'Não informado'}`,
          `Público: ${data.get('audience') || 'Não informado'}`
        ]],
        ['Estilo', [
          `Tom: ${data.get('tone_of_voice') || 'Não informado'}`,
          `Estilo visual: ${data.get('style_vibe') || 'Não informado'}`,
          `CTA: ${data.get('cta_text') || 'Não informado'}`
        ]],
        ['Conteúdo', [
          `Páginas: ${pages.join(', ') || 'Não informado'}`,
          `Integrações: ${integrations.join(', ') || 'Não informado'}`,
          `Domínio: ${data.get('domain_target') || 'Não informado'}`
        ]]
      ];
      review.innerHTML = sections.map(([title, items]) => (
        `<article class="brief-review-card"><h5>${title}</h5><ul>${items.map((it) => `<li>${it}</li>`).join('')}</ul></article>`
      )).join('');
    };
    const saveDraft = () => {
      const form = $('#briefModalForm');
      if (!form) return;
      const fd = new FormData(form);
      const obj = {};
      fd.forEach((value, key) => {
        if (value instanceof File) return;
        if (obj[key]) {
          obj[key] = Array.isArray(obj[key]) ? [...obj[key], value] : [obj[key], value];
        } else {
          obj[key] = value;
        }
      });
      obj.pages_needed = collectCheckedValues('pagesNeeded');
      obj.integrations_needed = collectCheckedValues('integrationsNeeded');
      localStorage.setItem(draftKey, JSON.stringify(obj));
    };
    const loadDraft = () => {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      let data;
      try { data = JSON.parse(raw); } catch { return; }
      const form = $('#briefModalForm');
      if (!form || !data || typeof data !== 'object') return;
      Object.entries(data).forEach(([key, value]) => {
        if (key === 'pages_needed' || key === 'integrations_needed') return;
        const radio = form.querySelector(`input[name="${key}"][value="${String(value)}"]`);
        if (radio) {
          radio.checked = true;
          return;
        }
        const field = form.querySelector(`[name="${key}"]`);
        if (field && typeof value === 'string') field.value = value;
      });
      (data.pages_needed || []).forEach((v) => {
        const cb = document.querySelector(`#pagesNeeded input[value="${String(v).replace(/"/g, '\\"')}"]`);
        if (cb) cb.checked = true;
      });
      (data.integrations_needed || []).forEach((v) => {
        const cb = document.querySelector(`#integrationsNeeded input[value="${String(v).replace(/"/g, '\\"')}"]`);
        if (cb) cb.checked = true;
      });
    };
    const validateBriefStep = (step) => {
      if (step === 1) {
        const hasLogo = $('input[name="has_logo"]:checked')?.value || '';
        if (!hasLogo) return false;
        if (hasLogo === 'yes' && !$('input[name="logo_file"]')?.files?.length) {
          setBriefNotice('Envie sua logo para continuar (ou escolha que não possui logo).', 'err');
          return false;
        }
        if (hasLogo === 'no' && !($('textarea[name="logo_description"]')?.value || '').trim()) {
          setBriefNotice('Descreva como gostaria da sua logo.', 'err');
          return false;
        }
      }
      if (step === 2) {
        if (!($('textarea[name="objective"]')?.value || '').trim() || !($('textarea[name="audience"]')?.value || '').trim()) {
          setBriefNotice('Preencha objetivo e público-alvo para continuar.', 'err');
          return false;
        }
      }
      if (step === 3) {
        if (!($('select[name="style_vibe"]')?.value || '').trim() || !($('select[name="cta_text"]')?.value || '').trim()) {
          setBriefNotice('Defina estilo visual e CTA principal.', 'err');
          return false;
        }
      }
      if (step === 5 && !$('#briefTerms')?.checked) {
        setBriefNotice('Você precisa concordar com os termos para finalizar.', 'err');
        return false;
      }
      clearBriefNotice();
      return true;
    };
    const renderBriefStep = () => {
      $$('.brief-step').forEach((s) => s.classList.add('hidden'));
      $(`.brief-step[data-brief-step='${briefStep}']`)?.classList.remove('hidden');
      $('#briefPrev') && ($('#briefPrev').disabled = briefStep === 0);
      $('#briefNext')?.classList.toggle('hidden', briefStep === maxBriefStep);
      $('#briefSubmit')?.classList.toggle('hidden', briefStep !== maxBriefStep);
      const percent = ((briefStep + 1) / (maxBriefStep + 1)) * 100;
      const bar = $('#briefProgressBar');
      if (bar) bar.style.width = `${percent}%`;
      $$('.brief-progress-labels span').forEach((el) => {
        const idx = Number(el.getAttribute('data-progress-step') || '-1');
        el.classList.toggle('active', idx <= briefStep);
      });
      const hint = $('#briefProgressHint');
      if (hint) {
        hint.textContent = briefStep === 0
          ? 'Tempo médio: 5-8 minutos'
          : (encouragementByStep[briefStep] || 'Continue preenchendo.');
      }
      if (briefStep === 5) buildReview();
    };

    const toggleConditionalFields = () => {
      $$('[data-brief-toggle]').forEach((control) => {
        const name = control.getAttribute('name');
        const value = control.value;
        $$(`.conditional-field[data-show-if^='${name}:']`).forEach((el) => {
          const expected = (el.getAttribute('data-show-if') || '').split(':')[1];
          const allowed = expected.split('|').map((v) => v.trim());
          el.classList.toggle('hidden', !allowed.includes(value));
        });
      });
    };
    $$('[data-brief-toggle]').forEach((control) => control.addEventListener('change', toggleConditionalFields));
    $('select[name="business_type"]')?.addEventListener('change', applyBusinessSuggestions);
    toggleConditionalFields();
    loadDraft();

    $('#briefPrev')?.addEventListener('click', () => { briefStep = Math.max(0, briefStep - 1); renderBriefStep(); });
    $('#briefNext')?.addEventListener('click', () => {
      if (!validateBriefStep(briefStep)) return;
      briefStep = Math.min(maxBriefStep, briefStep + 1);
      renderBriefStep();
    });

    const briefForm = $('#briefModalForm');
    let draftTimer;
    briefForm?.addEventListener('input', () => {
      clearTimeout(draftTimer);
      draftTimer = setTimeout(saveDraft, 300);
    });
    briefForm?.addEventListener('change', saveDraft);
    briefForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validateBriefStep(briefStep)) return;
      const fd = new FormData(briefForm);
      const integrations = collectCheckedValues('integrationsNeeded');
      const pages = collectCheckedValues('pagesNeeded');
      fd.set('integrations', integrations.join(', '));
      fd.set('services', [fd.get('services') || '', pages.length ? `Páginas: ${pages.join(', ')}` : ''].filter(Boolean).join('\n'));
      fd.set('extra_requirements', [fd.get('extra_requirements') || '', fd.get('secondary_goals') || '', fd.get('has_differentiation') || ''].filter(Boolean).join('\n'));
      const r = await fetch('/api/onboarding/site-brief', { method: 'POST', body: fd });
      const d = await r.json();
      const out = $('#briefPromptResult');
      if (!r.ok) {
        if (out) {
          out.classList.remove('hidden', 'ok');
          out.classList.add('err');
          out.textContent = d.error || 'Erro ao salvar briefing';
        }
        setBriefNotice(d.error || 'Erro ao salvar briefing. Revise os dados e tente novamente.', 'err');
        return;
      }
      if (out) {
        out.classList.remove('hidden', 'err');
        out.classList.add('ok');
        out.textContent = 'Briefing enviado com sucesso! Nossa equipe vai analisar e responder em até 24h.';
      }
      setBriefNotice('Briefing enviado com sucesso.', 'ok');
      setPortalNotice('Briefing concluído com sucesso.', 'ok');
      localStorage.removeItem(draftKey);
      setTimeout(() => location.reload(), 1000);
    });

    initBriefUploaders();
    renderBriefStep();
    if (document.body.dataset.openBriefing === '1') {
      openModal();
    }

    window.setTimeout(() => {
      $$('.skeleton-ready').forEach((el) => el.classList.remove('skeleton-ready'));
    }, 900);
  }

  document.addEventListener('DOMContentLoaded', mount);
})();
