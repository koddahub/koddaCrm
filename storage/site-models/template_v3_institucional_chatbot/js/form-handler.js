(function () {
  const cfg = Object.assign(
    {
      formMode: 'front-only',
      formEndpoint: '',
      successMessage: 'Mensagem enviada com sucesso. Retornaremos em breve.',
      errorMessage: 'Não foi possível enviar agora. Tente novamente em alguns instantes.',
    },
    window.TemplateConfig || {},
  );

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  function setFieldState(field, invalid, message) {
    if (!field) return;
    field.classList.toggle('is-invalid', Boolean(invalid));
    const feedbackId = field.getAttribute('data-feedback-id');
    if (!feedbackId) return;
    const feedback = document.getElementById(feedbackId);
    if (!feedback) return;
    feedback.textContent = invalid ? message : '';
  }

  function formDataToObject(formData) {
    const out = {};
    for (const [key, value] of formData.entries()) out[key] = String(value || '').trim();
    return out;
  }

  function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) return;

    const status = form.querySelector('[data-form-status]');
    const submitBtn = form.querySelector('button[type="submit"]');
    const inputs = Array.from(form.querySelectorAll('input, textarea, select'));

    const data = new FormData(form);
    const payload = formDataToObject(data);

    let invalid = false;

    inputs.forEach((input) => {
      if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement)) return;
      if (!input.hasAttribute('required')) {
        setFieldState(input, false, '');
        return;
      }
      const value = String(input.value || '').trim();
      if (!value) {
        invalid = true;
        setFieldState(input, true, 'Este campo é obrigatório.');
        return;
      }
      if (input.getAttribute('type') === 'email' && !isValidEmail(value)) {
        invalid = true;
        setFieldState(input, true, 'E-mail inválido.');
        return;
      }
      setFieldState(input, false, '');
    });

    if (invalid) {
      if (status) {
        status.className = 'form-status error';
        status.textContent = 'Revise os campos obrigatórios antes de enviar.';
      }
      return;
    }

    if (submitBtn instanceof HTMLButtonElement) {
      submitBtn.disabled = true;
      submitBtn.dataset.originalText = submitBtn.textContent || 'Enviar';
      submitBtn.textContent = 'Enviando...';
      submitBtn.classList.add('is-loading');
    }
    if (status) {
      status.className = 'form-status loading';
      status.textContent = 'Processando envio...';
    }

    const finish = (ok, message) => {
      if (submitBtn instanceof HTMLButtonElement) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitBtn.dataset.originalText || 'Enviar';
        submitBtn.classList.remove('is-loading');
      }
      if (status) {
        status.className = `form-status ${ok ? 'success' : 'error'}`;
        status.textContent = message;
      }
      if (ok) form.reset();
    };

    if (cfg.formMode === 'api' && cfg.formEndpoint) {
      fetch(cfg.formEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then((res) => {
          if (!res.ok) throw new Error('request_failed');
          return res.json().catch(() => ({}));
        })
        .then(() => finish(true, cfg.successMessage))
        .catch(() => finish(false, cfg.errorMessage));
      return;
    }

    setTimeout(() => {
      finish(true, cfg.successMessage);
    }, 550);
  }

  function initForms() {
    const forms = Array.from(document.querySelectorAll('form[data-template-contact="true"]'));
    forms.forEach((form) => {
      form.addEventListener('submit', handleSubmit);
    });
  }

  document.addEventListener('DOMContentLoaded', initForms);
})();
