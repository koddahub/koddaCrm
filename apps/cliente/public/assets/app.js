(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

  const state = { step: 1, maxStep: 4, paymentPollTimer: null, paymentDeadlineTimer: null, pendingExpired: false, cepResolved: false };
  const csrfToken = document.body?.dataset?.csrfToken || '';
  let pendingSid = null;
  let pendingSignupSessionId = null;
  let pendingPaymentUrl = null;
  let pendingUntilEpoch = null;
  let authPendingBlocked = false;
  let pendingModalDismissed = false;
  let authStatePrimaryAction = null;

  const onlyDigits = (v) => String(v || '').replace(/\D+/g, '');
  const formatPhone = (v) => {
    const d = onlyDigits(v).slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };
  const formatCpfCnpj = (v) => {
    const d = onlyDigits(v).slice(0, 14);
    if (d.length <= 11) {
      return d
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    }
    return d
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  };
  const formatZip = (v) => {
    const d = onlyDigits(v).slice(0, 8);
    return d.replace(/^(\d{5})(\d)/, '$1-$2');
  };

  function setFieldError(el, msg = '') {
    if (!el) return;
    el.style.borderColor = msg ? 'rgba(239,68,68,.9)' : 'rgba(255,255,255,.18)';
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  function isValidCpf(cpf) {
    if (!/^\d{11}$/.test(cpf) || /^(\d)\1+$/.test(cpf)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
    let digit = (sum * 10) % 11;
    if (digit === 10) digit = 0;
    if (digit !== Number(cpf[9])) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
    digit = (sum * 10) % 11;
    if (digit === 10) digit = 0;
    return digit === Number(cpf[10]);
  }

  function isValidCnpj(cnpj) {
    if (!/^\d{14}$/.test(cnpj) || /^(\d)\1+$/.test(cnpj)) return false;
    const w1 = [5,4,3,2,9,8,7,6,5,4,3,2];
    const w2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(cnpj[i]) * w1[i];
    let r = sum % 11;
    const d1 = r < 2 ? 0 : 11 - r;
    if (d1 !== Number(cnpj[12])) return false;
    sum = 0;
    for (let i = 0; i < 13; i++) sum += Number(cnpj[i]) * w2[i];
    r = sum % 11;
    const d2 = r < 2 ? 0 : 11 - r;
    return d2 === Number(cnpj[13]);
  }

  function showFlowOverlay(title, message) {
    const wrap = $('#authFlowOverlay');
    if (!wrap) return;
    $('#authFlowTitle').textContent = title || 'Redirecionando...';
    $('#authFlowMessage').textContent = message || 'Aguarde...';
    wrap.classList.remove('hidden');
  }

  function hideFlowOverlay() {
    $('#authFlowOverlay')?.classList.add('hidden');
  }

  function showStateModal({
    title,
    text,
    richHtml = '',
    countdown = null,
    showRetry = false,
    showCheck = false,
    showClose = false,
    showPrimary = false,
    primaryLabel = 'Continuar',
    onPrimary = null,
    loading = false
  }) {
    const modal = $('#authStateModal');
    if (!modal) return;
    $('#authStateTitle').textContent = title || 'Aviso';
    $('#authStateText').textContent = text || '';
    const rich = $('#authStateRich');
    if (rich) {
      if (richHtml) {
        rich.innerHTML = richHtml;
        rich.classList.remove('hidden');
      } else {
        rich.innerHTML = '';
        rich.classList.add('hidden');
      }
    }
    $('#authStateSpinner')?.classList.toggle('hidden', !loading);
    const cd = $('#authStateCountdown');
    if (cd) {
      if (countdown) {
        cd.textContent = countdown;
        cd.classList.remove('hidden');
      } else {
        cd.classList.add('hidden');
      }
    }
    $('#authStateRetryBtn')?.classList.toggle('hidden', !showRetry);
    $('#authStateCheckBtn')?.classList.toggle('hidden', !showCheck);
    const primaryBtn = $('#authStatePrimaryBtn');
    if (primaryBtn) {
      primaryBtn.textContent = primaryLabel || 'Continuar';
      primaryBtn.classList.toggle('hidden', !showPrimary);
    }
    authStatePrimaryAction = typeof onPrimary === 'function' ? onPrimary : null;
    $('#authStateCloseBtn')?.classList.toggle('hidden', !showClose);
    modal.classList.remove('hidden');
  }

  function hideStateModal() {
    $('#authStateModal')?.classList.add('hidden');
    $('#authStateSpinner')?.classList.add('hidden');
    $('#authStateRich')?.classList.add('hidden');
    authStatePrimaryAction = null;
    if (pendingSid || pendingSignupSessionId) {
      pendingModalDismissed = true;
    }
  }

  function setAuthPendingBlocked(blocked) {
    authPendingBlocked = !!blocked;
  }

  async function checkPendingByIdentity({ email = '', cpfCnpj = '' } = {}) {
    const payload = {
      email: String(email || '').trim(),
      cpf_cnpj: String(cpfCnpj || '').trim(),
    };
    if (!payload.email && !payload.cpf_cnpj) return null;
    try {
      const res = await apiFetch('/api/auth/pending-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) return null;
      if (data?.has_pending && (data?.sid || data?.signup_session_id)) {
        return data;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  async function apiFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (csrfToken && !headers.has('X-CSRF-Token')) {
      headers.set('X-CSRF-Token', csrfToken);
    }
    return fetch(url, { ...options, headers });
  }

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

  function getTurnstileToken(formEl) {
    return (formEl?.querySelector('[name="cf-turnstile-response"]')?.value || '').trim();
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

  async function runSignupStepPrecheck(step) {
    if (![1, 3].includes(Number(step))) return true;
    const payload = { step: Number(step) };
    if (Number(step) === 1) {
      payload.cpf_cnpj = ($('#cpf_cnpj')?.value || '').trim();
      payload.phone = ($('#phone')?.value || '').trim();
    } else if (Number(step) === 3) {
      payload.email = ($('#signup_email')?.value || '').trim();
      payload.lgpd = !!($('#signupForm input[name="lgpd"]')?.checked);
      payload.turnstile_token = getTurnstileToken($('#signupForm'));
    }
    try {
      const res = await apiFetch('/api/auth/signup-precheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data?.can_proceed === false) {
        const msg = data?.error || 'Não foi possível validar esta etapa. Tente novamente.';
        setNotice(msg);
        const fieldName = String(data?.field || '');
        const fieldMap = {
          cpf_cnpj: '#cpf_cnpj',
          phone: '#phone',
          email: '#signup_email',
          lgpd: '#signupForm input[name=\"lgpd\"]',
          turnstile: '.cf-turnstile',
        };
        const target = $(fieldMap[fieldName] || '');
        if (target && typeof target.focus === 'function') target.focus();
        return false;
      }
      return true;
    } catch (_) {
      setNotice('Falha ao validar etapa no servidor. Tente novamente em instantes.');
      return false;
    }
  }

  async function validateStep(step) {
    const block = $(`.wizard-step[data-step='${step}']`);
    if (!block) return true;

    const required = $$('[data-required="true"]', block);
    for (const field of required) {
      const isCheckbox = (field.type || '').toLowerCase() === 'checkbox';
      const empty = isCheckbox ? !field.checked : (!field.value || !String(field.value).trim());
      if (empty) {
        const labelText = field.id ? (block.querySelector(`label[for='${field.id}']`)?.textContent || 'campo obrigatório') : 'campo obrigatório';
        setNotice(`Preencha o campo "${labelText.trim()}" para continuar.`);
        field.focus();
        return false;
      }
    }

    if (step === 3) {
      const pass = $('#signup_password')?.value || '';
      const pass2 = $('#signup_password_confirm')?.value || '';
      if (pass.length < 8 || !/[A-Za-z]/.test(pass) || !/\d/.test(pass) || pass !== pass2) {
        setNotice('Senha deve ter no mínimo 8 caracteres, com letras e números, e confirmação igual.');
        return false;
      }
      if (!$('#signupForm input[name="lgpd"]')?.checked) {
        setNotice('Aceite os termos LGPD para continuar.');
        return false;
      }
      if (!getTurnstileToken($('#signupForm'))) {
        setNotice('CAPTCHA inválido, tente novamente.');
        return false;
      }
    }

    if (step === 1) {
      const docEl = $('#cpf_cnpj');
      const doc = onlyDigits(docEl?.value || '');
      const personType = $('#person_type')?.value || 'PF';
      const valid = personType === 'PJ' ? isValidCnpj(doc) : isValidCpf(doc);
      if (!valid) {
        setFieldError(docEl, 'invalid');
        setNotice('CPF/CNPJ inválido para o tipo selecionado.');
        docEl?.focus();
        return false;
      }
      setFieldError(docEl);
    }

    if (step === 2) {
      const zip = onlyDigits($('#billing_zip')?.value || '');
      if (zip.length !== 8) {
        setNotice('Informe um CEP válido.');
        $('#billing_zip')?.focus();
        return false;
      }
      if (!state.cepResolved) {
        setNotice('Preencha um CEP válido para buscar o endereço automaticamente.');
        $('#billing_zip')?.focus();
        return false;
      }
      const requiredAddress = ['#billing_street', '#billing_district', '#billing_city', '#billing_state'];
      for (const selector of requiredAddress) {
        const input = $(selector);
        if (!input || !String(input.value || '').trim()) {
          setNotice('Endereço não foi carregado pelo CEP. Revise o CEP e tente novamente.');
          $('#billing_zip')?.focus();
          return false;
        }
      }
    }

    return await runSignupStepPrecheck(step);
  }

  async function tryResolveCep() {
    const zipEl = $('#billing_zip');
    if (!zipEl) return;
    const zip = onlyDigits(zipEl.value);
    if (zip.length !== 8) {
      state.cepResolved = false;
      return;
    }
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${zip}/json/`);
      const data = await resp.json();
      if (!resp.ok || data?.erro) {
        state.cepResolved = false;
        ['#billing_street', '#billing_district', '#billing_city', '#billing_state'].forEach((selector) => {
          const field = $(selector);
          if (field) field.value = '';
        });
        showStateModal({
          title: 'CEP não encontrado',
          text: 'Não foi possível carregar o endereço pelo CEP. Revise o CEP informado para continuar.',
          showClose: true,
        });
        return;
      }
      if ($('#billing_street')) $('#billing_street').value = data.logradouro || '';
      if ($('#billing_district')) $('#billing_district').value = data.bairro || '';
      if ($('#billing_city')) $('#billing_city').value = data.localidade || '';
      if ($('#billing_state')) $('#billing_state').value = String(data.uf || '').toUpperCase();
      state.cepResolved = true;
    } catch (err) {
      state.cepResolved = false;
      ['#billing_street', '#billing_district', '#billing_city', '#billing_state'].forEach((selector) => {
        const field = $(selector);
        if (field) field.value = '';
      });
      showStateModal({
        title: 'Falha ao consultar CEP',
        text: 'Não conseguimos consultar o CEP agora. Tente novamente em alguns instantes.',
        showClose: true,
      });
    }
  }

  function clearPendingTimers() {
    if (state.paymentPollTimer) clearInterval(state.paymentPollTimer);
    if (state.paymentDeadlineTimer) clearInterval(state.paymentDeadlineTimer);
    state.paymentPollTimer = null;
    state.paymentDeadlineTimer = null;
  }

  function openPaymentTab(url) {
    if (!url) return false;
    const tab = window.open(url, '_blank', 'noopener,noreferrer');
    return !!tab;
  }

  function showWelcomeConfirmedModal() {
    showStateModal({
      title: 'Bem-vindo(a) à KoddaHub!',
      text: 'Pagamento confirmado e acesso liberado.',
      richHtml: `
        <ul>
          <li>Pagamento confirmado com sucesso</li>
          <li>Cadastro liberado na área do cliente</li>
          <li>Próximo passo: preencher o briefing do seu site</li>
        </ul>
      `,
      showPrimary: true,
      primaryLabel: 'Seguir para login',
      onPrimary: () => {
        hideStateModal();
        $('#login_email')?.focus();
      },
      showClose: true,
      loading: false,
    });
  }

  async function verifyPendingPaymentNow(showFeedback = false) {
    if (!pendingSid && !pendingSignupSessionId) return false;
    try {
      if (pendingSignupSessionId) {
        const resSession = await apiFetch('/api/auth/signup-session/' + encodeURIComponent(String(pendingSignupSessionId)) + '/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const sessionData = await resSession.json();
        if (resSession.ok) {
          if (sessionData?.sid && !pendingSid) pendingSid = String(sessionData.sid);
          if (sessionData?.payment_redirect_url && !pendingPaymentUrl) pendingPaymentUrl = String(sessionData.payment_redirect_url);
          if (sessionData?.ready) {
            clearPendingTimers();
            setAuthPendingBlocked(false);
            pendingSid = null;
            pendingSignupSessionId = null;
            pendingModalDismissed = false;
            setTimeout(() => {
              window.location.href = '/login?payment=confirmed';
            }, 1100);
            return true;
          }
          if (!pendingModalDismissed || showFeedback) {
            showStateModal({
              title: 'Aguardando pagamento',
              text: sessionData?.payment_confirmed
                ? 'Pagamento confirmado no ASAAS. Estamos sincronizando seu cadastro no CRM para liberar o login.'
                : 'Finalize a cobrança no ASAAS para liberar seu login.',
              showRetry: true,
              showCheck: false,
              showClose: true,
              loading: true,
            });
          }
          return false;
        }
      }

      if (!pendingSid) return false;
      const res = await apiFetch('/api/billing/subscriptions/' + encodeURIComponent(String(pendingSid)) + '/status');
      const data = await res.json();
      if (!res.ok) return false;
      if (data?.can_login) {
        clearPendingTimers();
        setAuthPendingBlocked(false);
        pendingSid = null;
        pendingSignupSessionId = null;
        pendingModalDismissed = false;
        setTimeout(() => {
          window.location.href = '/login?payment=confirmed';
        }, 1300);
        return true;
      }
      if (showFeedback) {
        showStateModal({
          title: 'Aguardando pagamento',
          text: 'Ainda estamos aguardando o ASAAS confirmar o pagamento.',
          showRetry: true,
          showCheck: false,
          showClose: true,
          loading: true,
        });
      }
    } catch (_) {}
    return false;
  }

  function startPendingFlow(sid, pendingUntilIso = null, paymentUrl = null, signupSessionId = null) {
    if (!sid && !signupSessionId) return;
    pendingSid = sid || null;
    pendingSignupSessionId = signupSessionId || null;
    pendingPaymentUrl = paymentUrl || null;
    setAuthPendingBlocked(true);
    pendingModalDismissed = false;
    state.pendingExpired = false;
    pendingUntilEpoch = pendingUntilIso ? Date.parse(pendingUntilIso) : (Date.now() + 15 * 60 * 1000);
    showStateModal({
      title: 'Aguardando pagamento',
      text: 'Estamos aguardando confirmação do ASAAS para liberar seu acesso.',
      showRetry: true,
      showCheck: false,
      showClose: true,
      loading: true,
    });

    const updateCountdown = () => {
      const remainMs = Math.max(0, pendingUntilEpoch - Date.now());
      const mins = String(Math.floor(remainMs / 60000)).padStart(2, '0');
      const secs = String(Math.floor((remainMs % 60000) / 1000)).padStart(2, '0');
      const label = `Tempo restante: ${mins}:${secs}`;
      const countdownEl = $('#authStateCountdown');
      if (countdownEl) {
        countdownEl.classList.remove('hidden');
        countdownEl.textContent = label;
      }
      if (remainMs <= 0) {
        if (state.pendingExpired) return;
        state.pendingExpired = true;
        if (state.paymentDeadlineTimer) {
          clearInterval(state.paymentDeadlineTimer);
          state.paymentDeadlineTimer = null;
        }
        showStateModal({
          title: 'Falha ao completar transação',
          text: 'Pagamento não confirmado em 15 minutos. Reabra o link e conclua a cobrança para liberar o acesso.',
          showRetry: true,
          showCheck: false,
          showClose: true,
          loading: false,
        });
      }
    };

    const pollStatus = async () => verifyPendingPaymentNow(false);

    clearPendingTimers();
    updateCountdown();
    pollStatus();
    state.paymentDeadlineTimer = setInterval(updateCountdown, 1000);
    state.paymentPollTimer = setInterval(pollStatus, 10000);
  }

  async function loginSubmit(e) {
    e.preventDefault();
    clearNotice();
    if (!getTurnstileToken($('#loginForm'))) {
      setNotice('CAPTCHA inválido, tente novamente.');
      return;
    }
    const body = Object.fromEntries(new FormData(e.target).entries());
    const res = await apiFetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) {
      setNotice((data.error || 'Falha no login') + (data.action_hint ? ` ${data.action_hint}` : ''));
      return;
    }
    location.href = data.redirect || '/portal/dashboard';
  }

  async function signupSubmit(e) {
    e.preventDefault();
    if (e.target.dataset.submitting === '1') return;
    clearNotice();
    hideStateModal();
    for (let i = 1; i <= state.maxStep; i++) {
      if (!(await validateStep(i))) { setStep(i); return; }
    }
    e.target.dataset.submitting = '1';
    $('#wizardSubmit')?.setAttribute('disabled', 'disabled');
    showFlowOverlay('Aguardando link de pagamento...', 'Estamos cadastrando o cliente e preparando o checkout seguro no ASAAS.');
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    const pendingCheck = await checkPendingByIdentity({
      email: String(body.email || body.billing_email || '').trim(),
      cpfCnpj: String(body.cpf_cnpj || '').trim(),
    });
    if (pendingCheck?.sid || pendingCheck?.signup_session_id) {
      hideFlowOverlay();
      startPendingFlow(
        pendingCheck?.sid ? String(pendingCheck.sid) : null,
        pendingCheck.pending_until || null,
        pendingCheck.payment_redirect_url || null,
        pendingCheck?.signup_session_id ? String(pendingCheck.signup_session_id) : null
      );
      return;
    }

    try {
      const res = await apiFetch('/api/auth/register-contract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      const data = contentType.includes('application/json')
        ? await res.json()
        : { error: 'Resposta inesperada da API de cadastro/pagamento.' };
      if (!res.ok) {
        if (data?.asaas_subscription_id && data?.payment_redirect_url) {
          hideFlowOverlay();
          const sid = String(data.asaas_subscription_id);
          const ssid = data?.signup_session_id ? String(data.signup_session_id) : '';
          openPaymentTab(data.payment_redirect_url);
          startPendingFlow(sid, data.pending_until || null, data.payment_redirect_url, ssid || null);
          return;
        }
        hideFlowOverlay();
        let message = data.error || 'Falha no cadastro';
        if (data.action_hint) {
          message += ` ${String(data.action_hint)}`;
        }
        if (data.gateway_message) {
          message += ` (${data.gateway_message})`;
        }
        if (data.details && typeof data.details === 'object') {
          const firstDetail = Object.values(data.details)[0];
          if (firstDetail) message = String(firstDetail);
        }
        showStateModal({
          title: 'Não foi possível iniciar o pagamento',
          text: message,
          showClose: true,
        });
        return;
      }

      const sidRaw = String(data.asaas_subscription_id || '');
      const ssidRaw = String(data.signup_session_id || '');
      const paymentUrl = data.payment_redirect_url || null;
      if (paymentUrl) {
        hideFlowOverlay();
        openPaymentTab(paymentUrl);
        startPendingFlow(sidRaw, data.pending_until || null, paymentUrl, ssidRaw || null);
        return;
      }

      if (data.awaiting_payment && data.asaas_subscription_id) {
        hideFlowOverlay();
        startPendingFlow(sidRaw, data.pending_until || null, null, ssidRaw || null);
        return;
      }
      hideFlowOverlay();
      window.location.href = `/portal/dashboard?new=1&subscription_id=${encodeURIComponent(data.subscription_id || '')}`;
    } catch (err) {
      hideFlowOverlay();
      showStateModal({
        title: 'Falha de comunicação',
        text: 'Não foi possível completar o cadastro agora. Tente novamente em alguns segundos.',
        showClose: true,
      });
    } finally {
      e.target.dataset.submitting = '0';
      $('#wizardSubmit')?.removeAttribute('disabled');
    }
  }

  function initAuthInputEnhancements() {
    const phone = $('#phone');
    const doc = $('#cpf_cnpj');
    const zip = $('#billing_zip');
    const stateUf = $('#billing_state');
    const street = $('#billing_street');
    const district = $('#billing_district');
    const city = $('#billing_city');

    phone?.addEventListener('input', () => { phone.value = formatPhone(phone.value); });
    doc?.addEventListener('input', () => { doc.value = formatCpfCnpj(doc.value); });
    zip?.addEventListener('input', () => {
      zip.value = formatZip(zip.value);
      state.cepResolved = false;
      if (onlyDigits(zip.value).length < 8) {
        if (street) street.value = '';
        if (district) district.value = '';
        if (city) city.value = '';
        if (stateUf) stateUf.value = '';
      }
    });
    zip?.addEventListener('blur', tryResolveCep);
    [street, district, city, stateUf].forEach((el) => {
      if (el) el.setAttribute('readonly', 'readonly');
    });

    doc?.addEventListener('blur', () => {
      const personType = $('#person_type')?.value || 'PF';
      const digits = onlyDigits(doc.value);
      const valid = personType === 'PJ' ? isValidCnpj(digits) : isValidCpf(digits);
      setFieldError(doc, valid ? '' : 'invalid');
      if (!valid) setNotice('CPF/CNPJ inválido para o tipo selecionado.');
    });
  }

  function initAuthKeyBehavior() {
    const signupForm = $('#signupForm');
    signupForm?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.tagName === 'TEXTAREA') return;
      if (target.tagName === 'BUTTON') return;
      if (target.id === 'billing_zip') {
        e.preventDefault();
        tryResolveCep();
        target.blur();
        return;
      }
      e.preventDefault();
      target.blur();
    });

    const loginForm = $('#loginForm');
    loginForm?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.tagName === 'TEXTAREA') return;
      if (target.tagName === 'BUTTON') return;
      e.preventDefault();
      target.blur();
    });
  }

  function mount() {
    applyRealtimeValidation();
    initAuthInputEnhancements();

    if (document.body.dataset.page === 'dashboard') {
      initDashboard();
      return;
    }

    $$('.tabbtn').forEach((btn) => btn.addEventListener('click', () => setTab(btn.dataset.tab)));

    $('#wizardPrev')?.addEventListener('click', () => setStep(state.step - 1));
    $('#wizardNext')?.addEventListener('click', async () => {
      if (!(await validateStep(state.step))) return;
      setStep(state.step + 1);
    });

    $('#authStateCloseBtn')?.addEventListener('click', hideStateModal);
    $('#authStatePrimaryBtn')?.addEventListener('click', () => {
      if (typeof authStatePrimaryAction === 'function') {
        authStatePrimaryAction();
      }
    });
    $('#authStateRetryBtn')?.addEventListener('click', async () => {
      if (pendingPaymentUrl) {
        openPaymentTab(pendingPaymentUrl);
        return;
      }
      if (!pendingSid) {
        return;
      }
      try {
        const retry = await apiFetch('/api/billing/subscriptions/' + encodeURIComponent(String(pendingSid)) + '/retry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const retryData = await retry.json();
        if (retry.ok && retryData?.payment_redirect_url) {
          pendingPaymentUrl = String(retryData.payment_redirect_url);
          openPaymentTab(pendingPaymentUrl);
          return;
        }
      } catch (_) {}
      showStateModal({
        title: 'Link indisponível no momento',
        text: 'Não foi possível recuperar o link de pagamento agora. Tente novamente em instantes.',
        showRetry: true,
        showClose: true,
        loading: false,
      });
    });
    ['#login_email', '#billing_email', '#cpf_cnpj'].forEach((selector) => {
      const el = $(selector);
      el?.addEventListener('blur', async () => {
        const pendingCheck = await checkPendingByIdentity({
          email: ($('#login_email')?.value || $('#billing_email')?.value || '').trim(),
          cpfCnpj: ($('#cpf_cnpj')?.value || '').trim(),
        });
        if (pendingCheck?.sid || pendingCheck?.signup_session_id) {
          startPendingFlow(
            pendingCheck?.sid ? String(pendingCheck.sid) : null,
            pendingCheck.pending_until || null,
            pendingCheck.payment_redirect_url || null,
            pendingCheck?.signup_session_id ? String(pendingCheck.signup_session_id) : null
          );
        }
      });
    });

    $('#loginForm')?.addEventListener('submit', loginSubmit);
    $('#signupForm')?.addEventListener('submit', signupSubmit);

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
    initAuthKeyBehavior();

    const qp = new URLSearchParams(window.location.search || '');
    const sidParam = (qp.get('sid') || '').trim();
    const ssidParam = (qp.get('ssid') || '').trim();
    const paymentState = (qp.get('payment') || '').trim();
    if (paymentState === 'pending' && (sidParam || ssidParam)) {
      startPendingFlow(sidParam || null, null, null, ssidParam || null);
    } else if (paymentState === 'confirmed') {
      setAuthPendingBlocked(false);
      pendingSid = null;
      pendingSignupSessionId = null;
      showWelcomeConfirmedModal();
      clearPaymentQueryParams();
    }
  }

  function clearPaymentQueryParams() {
    try {
      const url = new URL(window.location.href);
      const hasPaymentParams =
        url.searchParams.has('payment')
        || url.searchParams.has('sid')
        || url.searchParams.has('ssid');
      if (!hasPaymentParams) return;
      url.searchParams.delete('payment');
      url.searchParams.delete('sid');
      url.searchParams.delete('ssid');
      const nextUrl = url.pathname + (url.search ? url.search : '') + (url.hash || '');
      window.history.replaceState({}, '', nextUrl);
    } catch (_) {}
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

    const validSections = new Set(['dashboard', 'chamados', 'pagamentos', 'operacao', 'planos', 'perfil']);
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
      const r = await apiFetch('/api/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
      const r = await apiFetch('/api/billing/subscriptions/' + encodeURIComponent(body.asaas_subscription_id) + '/change-plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const d = await r.json();
      if (!r.ok) {
        setPortalNotice(d.error || 'Erro ao solicitar troca', 'err');
        return;
      }
      setPortalNotice('Solicitação de troca de plano enviada.', 'ok');
    });

    $('#retryPaymentBtn')?.addEventListener('click', async () => {
      const sid = $('#retryPaymentBtn')?.dataset?.subscriptionId;
      if (!sid) return;
      const r = await apiFetch('/api/billing/subscriptions/' + encodeURIComponent(sid) + '/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const d = await r.json();
      if (!r.ok) {
        setPortalNotice(d.error || 'Não foi possível abrir a cobrança.', 'err');
        return;
      }
      if (d.payment_redirect_url) {
        window.open(d.payment_redirect_url, '_blank', 'noopener,noreferrer');
        return;
      }
      setPortalNotice('Nenhuma cobrança pendente encontrada no momento.', 'err');
    });

    const portalApprovalNotice = $('#portalApprovalNotice');
    const setPortalApprovalNotice = (msg, ok = false) => {
      if (!portalApprovalNotice) {
        setPortalNotice(msg, ok ? 'ok' : 'err');
        return;
      }
      portalApprovalNotice.textContent = msg || '';
      portalApprovalNotice.classList.remove('hidden', 'ok', 'err');
      portalApprovalNotice.classList.add(ok ? 'ok' : 'err');
    };

    const portalApprovalConfirmModal = $('#portalApprovalConfirmModal');
    const portalRequestChangesModal = $('#portalRequestChangesModal');
    const portalApproveBtn = $('#portalApproveBtn');
    const portalChangesBtn = $('#portalChangesBtn');
    const portalApproveConfirmBtn = $('#portalApproveConfirmBtn');
    const portalApproveCancelBtn = $('#portalApproveCancelBtn');
    const portalChangesCancelBtn = $('#portalChangesCancelBtn');
    const portalRequestChangesForm = $('#portalRequestChangesForm');
    const portalDescricaoAjuste = $('#portalDescricaoAjuste');
    const portalDescricaoCounter = $('#portalDescricaoCounter');
    const portalDescricaoCounterFill = $('#portalDescricaoCounterFill');
    const portalChangesSubmitBtn = $('#portalChangesSubmitBtn');
    const portalChangesNotice = $('#portalChangesNotice');
    const portalPublicationNotice = $('#portalPublicationNotice');
    const portalPublicationRespondBtn = $('#portalPublicationRespondBtn');
    const portalPublicationDomainModal = $('#portalPublicationDomainModal');
    const portalPublicationDomainForm = $('#portalPublicationDomainForm');
    const portalPublicationRequestId = $('#portalPublicationRequestId');
    const portalPublicationAction = $('#portalPublicationAction');
    const portalPublicationDomain = $('#portalPublicationDomain');
    const portalPublicationDomainHint = $('#portalPublicationDomainHint');
    const portalPublicationNote = $('#portalPublicationNote');
    const portalPublicationDomainNotice = $('#portalPublicationDomainNotice');
    const portalPublicationDomainSubmitBtn = $('#portalPublicationDomainSubmitBtn');
    const portalPublicationDomainCancelBtn = $('#portalPublicationDomainCancelBtn');
    const portalPublicationDomainCloseBtn = $('#portalPublicationDomainCloseBtn');
    let portalApproveSending = false;
    let portalChangesSending = false;
    let portalPublicationSending = false;

    const openPortalModal = (el) => {
      if (!el) return;
      el.classList.remove('hidden');
      el.setAttribute('aria-hidden', 'false');
    };
    const closePortalModal = (el) => {
      if (!el) return;
      el.classList.add('hidden');
      el.setAttribute('aria-hidden', 'true');
    };
    const setPortalChangesNotice = (msg, ok = false) => {
      if (!portalChangesNotice) return;
      portalChangesNotice.textContent = msg || '';
      portalChangesNotice.classList.remove('hidden', 'ok', 'err');
      portalChangesNotice.classList.add(ok ? 'ok' : 'err');
    };
    const clearPortalChangesNotice = () => {
      if (!portalChangesNotice) return;
      portalChangesNotice.textContent = '';
      portalChangesNotice.classList.add('hidden');
      portalChangesNotice.classList.remove('ok', 'err');
    };
    const setPortalPublicationNotice = (msg, ok = false) => {
      if (!portalPublicationNotice) return;
      portalPublicationNotice.textContent = msg || '';
      portalPublicationNotice.classList.remove('hidden', 'ok', 'err');
      portalPublicationNotice.classList.add(ok ? 'ok' : 'err');
    };
    const setPortalPublicationDomainNotice = (msg, ok = false) => {
      if (!portalPublicationDomainNotice) return;
      portalPublicationDomainNotice.textContent = msg || '';
      portalPublicationDomainNotice.classList.remove('hidden', 'ok', 'err');
      portalPublicationDomainNotice.classList.add(ok ? 'ok' : 'err');
    };
    const clearPortalPublicationDomainNotice = () => {
      if (!portalPublicationDomainNotice) return;
      portalPublicationDomainNotice.textContent = '';
      portalPublicationDomainNotice.classList.add('hidden');
      portalPublicationDomainNotice.classList.remove('ok', 'err');
    };
    const sanitizeDomainInput = (value) => {
      return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//i, '')
        .replace(/\/.*$/, '')
        .replace(/\.$/, '');
    };
    const isDomainValid = (value) => /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(String(value || ''));
    const syncPublicationActionUi = () => {
      const action = String(portalPublicationAction?.value || 'approve');
      if (!portalPublicationDomain || !portalPublicationDomainHint) return;
      const required = action === 'reject';
      portalPublicationDomain.required = required;
      portalPublicationDomainHint.textContent = required
        ? 'Obrigatório ao rejeitar. Informe o domínio sugerido.'
        : 'Opcional para aprovação. Se vazio, manteremos o domínio atual.';
    };
    const openPublicationDomainModal = () => {
      if (!portalPublicationDomainModal) return;
      const requestId = portalPublicationRespondBtn?.dataset?.requestId || '';
      const requestDomain = portalPublicationRespondBtn?.dataset?.requestDomain || '';
      if (portalPublicationRequestId) portalPublicationRequestId.value = requestId;
      if (portalPublicationDomain) portalPublicationDomain.value = requestDomain;
      if (portalPublicationAction) portalPublicationAction.value = 'approve';
      if (portalPublicationNote) portalPublicationNote.value = '';
      clearPortalPublicationDomainNotice();
      syncPublicationActionUi();
      openPortalModal(portalPublicationDomainModal);
      portalPublicationAction?.focus();
    };
    const closePublicationDomainModal = () => {
      closePortalModal(portalPublicationDomainModal);
      portalPublicationDomainSubmitBtn?.removeAttribute('disabled');
      portalPublicationSending = false;
    };
    const updatePortalDescricaoCounter = () => {
      if (!portalDescricaoAjuste || !portalDescricaoCounter || !portalDescricaoCounterFill || !portalChangesSubmitBtn) return;
      const length = String(portalDescricaoAjuste.value || '').trim().length;
      const pct = Math.min(100, (length / 100) * 100);
      portalDescricaoCounter.textContent = `${length} / 2000 (mínimo 100)`;
      portalDescricaoCounterFill.style.width = `${pct}%`;
      const valid = length >= 100;
      portalChangesSubmitBtn.disabled = !valid || portalChangesSending;
      portalDescricaoCounter.classList.toggle('text-success', valid);
      portalDescricaoCounter.classList.toggle('text-danger', !valid);
    };

    portalApproveBtn?.addEventListener('click', () => {
      setPortalApprovalNotice('', true);
      portalApprovalNotice?.classList.add('hidden');
      openPortalModal(portalApprovalConfirmModal);
    });
    portalApproveCancelBtn?.addEventListener('click', () => closePortalModal(portalApprovalConfirmModal));
    portalApprovalConfirmModal?.querySelector('.portal-modal-backdrop')?.addEventListener('click', () => closePortalModal(portalApprovalConfirmModal));

    portalApproveConfirmBtn?.addEventListener('click', async () => {
      if (portalApproveSending) return;
      portalApproveSending = true;
      portalApproveConfirmBtn.setAttribute('disabled', 'disabled');
      portalApproveBtn?.setAttribute('disabled', 'disabled');
      try {
        const res = await apiFetch('/api/portal/approval/current/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: 'Aprovação confirmada via portal do cliente.' }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Não foi possível aprovar o site neste momento.');
        }
        closePortalModal(portalApprovalConfirmModal);
        setPortalApprovalNotice('Site aprovado com sucesso. Movendo para publicação...', true);
        setTimeout(() => window.location.reload(), 900);
      } catch (err) {
        setPortalApprovalNotice(err?.message || 'Erro ao aprovar o site.', false);
      } finally {
        portalApproveSending = false;
        portalApproveConfirmBtn.removeAttribute('disabled');
        portalApproveBtn?.removeAttribute('disabled');
      }
    });

    portalChangesBtn?.addEventListener('click', () => {
      clearPortalChangesNotice();
      openPortalModal(portalRequestChangesModal);
      portalDescricaoAjuste?.focus();
      updatePortalDescricaoCounter();
    });
    portalChangesCancelBtn?.addEventListener('click', () => closePortalModal(portalRequestChangesModal));
    portalRequestChangesModal?.querySelector('.portal-modal-backdrop')?.addEventListener('click', () => closePortalModal(portalRequestChangesModal));
    portalDescricaoAjuste?.addEventListener('input', updatePortalDescricaoCounter);
    updatePortalDescricaoCounter();

    portalRequestChangesForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (portalChangesSending) return;
      clearPortalChangesNotice();
      const descriptionLength = String(portalDescricaoAjuste?.value || '').trim().length;
      if (descriptionLength < 100) {
        setPortalChangesNotice('Descreva sua solicitação com no mínimo 100 caracteres.', false);
        updatePortalDescricaoCounter();
        return;
      }
      portalChangesSending = true;
      portalChangesSubmitBtn?.setAttribute('disabled', 'disabled');
      try {
        const formData = new FormData(portalRequestChangesForm);
        const res = await apiFetch('/api/portal/approval/current/request-changes', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Não foi possível enviar sua solicitação de ajustes.');
        }
        closePortalModal(portalRequestChangesModal);
        setPortalApprovalNotice(`Solicitação enviada com sucesso (${data.ticket || 'protocolo gerado'}).`, true);
        setTimeout(() => window.location.reload(), 900);
      } catch (err) {
        setPortalChangesNotice(err?.message || 'Erro ao enviar solicitação de ajustes.', false);
      } finally {
        portalChangesSending = false;
        updatePortalDescricaoCounter();
      }
    });

    portalPublicationRespondBtn?.addEventListener('click', () => {
      setPortalPublicationNotice('', true);
      portalPublicationNotice?.classList.add('hidden');
      openPublicationDomainModal();
    });
    portalPublicationDomainCancelBtn?.addEventListener('click', closePublicationDomainModal);
    portalPublicationDomainCloseBtn?.addEventListener('click', closePublicationDomainModal);
    portalPublicationAction?.addEventListener('change', syncPublicationActionUi);
    portalPublicationDomainForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (portalPublicationSending) return;
      clearPortalPublicationDomainNotice();

      const requestId = String(portalPublicationRequestId?.value || '').trim();
      const action = String(portalPublicationAction?.value || '').trim().toLowerCase();
      const note = String(portalPublicationNote?.value || '').trim();
      const domain = sanitizeDomainInput(portalPublicationDomain?.value || '');
      if (!requestId) {
        setPortalPublicationDomainNotice('Solicitação inválida para resposta.', false);
        return;
      }
      if (!['approve', 'reject'].includes(action)) {
        setPortalPublicationDomainNotice('Ação inválida.', false);
        return;
      }
      if (action === 'reject' && !domain) {
        setPortalPublicationDomainNotice('Informe o domínio sugerido para rejeitar.', false);
        portalPublicationDomain?.focus();
        return;
      }
      if (domain && !isDomainValid(domain)) {
        setPortalPublicationDomainNotice('Domínio inválido. Use o formato exemplo.com.br', false);
        portalPublicationDomain?.focus();
        return;
      }

      portalPublicationSending = true;
      portalPublicationDomainSubmitBtn?.setAttribute('disabled', 'disabled');
      try {
        const res = await apiFetch('/api/portal/publication/domain/respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            request_id: requestId,
            action,
            domain: domain || null,
            note: note || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Não foi possível registrar sua resposta.');
        }
        closePublicationDomainModal();
        setPortalPublicationNotice(
          action === 'approve'
            ? 'Domínio aprovado com sucesso. O monitoramento foi iniciado automaticamente.'
            : 'Rejeição enviada com domínio sugerido. A equipe KoddaHub irá revisar.',
          true,
        );
        setTimeout(() => window.location.reload(), 900);
      } catch (err) {
        setPortalPublicationDomainNotice(err?.message || 'Erro ao enviar resposta de domínio.', false);
      } finally {
        portalPublicationSending = false;
        portalPublicationDomainSubmitBtn?.removeAttribute('disabled');
      }
    });

    $('#operationHistoryToggle')?.addEventListener('click', () => {
      const body = $('#operationHistoryBody');
      if (!body) return;
      body.classList.toggle('hidden');
    });

    const profileForm = $('#profileForm');
    profileForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(profileForm).entries());
      const r = await apiFetch('/api/profile/update', {
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
      const r = await apiFetch('/api/onboarding/site-brief', { method: 'POST', body: fd });
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
