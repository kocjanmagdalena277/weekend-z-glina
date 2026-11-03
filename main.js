/*
 * Weekend z Gliną – logika strony demonstracyjnej.
 * Strona wysyła do dataLayer wyłącznie zdarzenia i parametry techniczne.
 * Treść formularza (imię, e-mail, termin) NIGDY nie trafia do dataLayer ani do URL.
 * O tym, czy dane zdarzenie dotrze do GA4 / Meta / Clarity, decydują tagi w GTM
 * na podstawie stanu zgód (consent_analytics / consent_marketing).
 */
(function () {
  'use strict';

  window.dataLayer = window.dataLayer || [];
  var FORM_ID = 'zapis_warsztat';

  function push(data) {
    window.dataLayer.push(data);
  }

  /* ---------- Zgody ---------- */

  var CONSENT_KEY = 'wzg_consent_v1';
  var banner = document.getElementById('consent');
  var cAnalytics = document.getElementById('c-analytics');
  var cMarketing = document.getElementById('c-marketing');

  function readConsent() {
    try {
      var raw = localStorage.getItem(CONSENT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function storeConsent(consent) {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
    } catch (e) { /* tryb prywatny – wybór obowiązuje do końca odsłony */ }
  }

  function applyConsent(consent) {
    var a = consent.analytics ? 'granted' : 'denied';
    var m = consent.marketing ? 'granted' : 'denied';
    gtag('consent', 'update', {
      analytics_storage: a,
      ad_storage: m,
      ad_user_data: m,
      ad_personalization: m
    });
    push({
      event: 'consent_update',
      consent_analytics: a,
      consent_marketing: m
    });
  }

  function showBanner() {
    var current = readConsent();
    cAnalytics.checked = !!(current && current.analytics);
    cMarketing.checked = !!(current && current.marketing);
    banner.hidden = false;
    banner.querySelector('button[data-consent="accept"]').focus();
  }

  function decide(analytics, marketing) {
    var previous = readConsent();
    var consent = { analytics: analytics, marketing: marketing, ts: new Date().toISOString() };
    storeConsent(consent);
    banner.hidden = true;

    // Cofnięcie wcześniej udzielonej zgody: narzędzia już załadowane w tej odsłonie
    // zostałyby w pamięci, więc przeładowujemy stronę – po przeładowaniu GTM ich nie uruchomi.
    var revoked = previous && ((previous.analytics && !analytics) || (previous.marketing && !marketing));
    if (revoked) {
      window.location.reload();
      return;
    }
    applyConsent(consent);
  }

  banner.addEventListener('click', function (e) {
    var action = e.target.getAttribute('data-consent');
    if (action === 'accept') decide(true, true);
    if (action === 'reject') decide(false, false);
    if (action === 'save') decide(cAnalytics.checked, cMarketing.checked);
  });

  document.getElementById('open-consent').addEventListener('click', showBanner);

  var saved = readConsent();
  if (saved) {
    applyConsent(saved);
  } else {
    showBanner(); // brak wyboru = wszystko odmówione (consent default)
  }

  /* ---------- cta_click ---------- */

  document.querySelectorAll('[data-cta-location]').forEach(function (cta) {
    cta.addEventListener('click', function () {
      push({
        event: 'cta_click',
        cta_location: cta.getAttribute('data-cta-location'),
        cta_text: cta.textContent.trim()
      });
      // Dla klawiatury i czytników ekranu: przenieś fokus na pierwsze pole formularza.
      setTimeout(function () {
        document.getElementById('f-name').focus({ preventScroll: true });
      }, 400);
    });
  });

  /* ---------- section_view ---------- */
  // Definicja: co najmniej 50% sekcji widoczne przez co najmniej 1 s, raz na odsłonę.
  // Sekcja wyższa niż ekran: wystarczy, że zajmuje co najmniej 50% wysokości okna.

  var VIEW_MS = 1000;

  document.querySelectorAll('[data-track-section]').forEach(function (section) {
    var timer = null;
    var sent = false;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (sent) return;
        var visible = entry.intersectionRect.height;
        var needed = Math.min(entry.boundingClientRect.height, window.innerHeight) * 0.5;
        var isVisible = entry.isIntersecting && visible >= needed;

        if (isVisible && !timer) {
          timer = setTimeout(function () {
            sent = true;
            push({ event: 'section_view', section_id: section.getAttribute('data-track-section') });
            observer.disconnect();
          }, VIEW_MS);
        } else if (!isVisible && timer) {
          clearTimeout(timer);
          timer = null;
        }
      });
    }, { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] });

    observer.observe(section);
  });

  /* ---------- Formularz: form_start, walidacja, lead_success ---------- */

  var form = document.getElementById(FORM_ID);
  var success = document.getElementById('form-success');
  var summary = document.getElementById('form-summary');
  var submitBtn = form.querySelector('button[type="submit"]');
  var started = false;
  var leadSent = false;
  var attempted = false;

  function onFirstInteraction() {
    if (started) return;
    started = true;
    push({ event: 'form_start', form_id: FORM_ID });
  }
  form.addEventListener('input', onFirstInteraction);
  form.addEventListener('change', onFirstInteraction);

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  var rules = [
    {
      field: 'name', el: 'f-name', error: 'f-name-error',
      check: function () {
        var v = form.elements['name'].value.trim();
        if (!v) return 'Podaj imię.';
        if (v.length < 2) return 'Imię musi mieć co najmniej 2 znaki.';
        return '';
      }
    },
    {
      field: 'email', el: 'f-email', error: 'f-email-error',
      check: function () {
        var v = form.elements['email'].value.trim();
        if (!v) return 'Podaj adres e-mail.';
        if (!EMAIL_RE.test(v)) return 'Wpisz adres e-mail w formacie nazwa@domena.pl.';
        return '';
      }
    },
    {
      field: 'term', el: 'f-term', error: 'f-term-error',
      check: function () {
        return form.elements['term'].value ? '' : 'Wybierz termin warsztatu.';
      }
    },
    {
      field: 'people', el: null, error: 'f-people-error',
      check: function () {
        return form.querySelector('input[name="people"]:checked') ? '' : 'Wybierz liczbę osób.';
      }
    },
    {
      field: 'terms', el: 'f-terms', error: 'f-terms-error',
      check: function () {
        return form.elements['terms'].checked ? '' : 'Zaakceptuj regulamin demonstracyjny.';
      }
    }
  ];

  function showError(rule, message) {
    var errorEl = document.getElementById(rule.error);
    errorEl.textContent = message;
    errorEl.hidden = !message;
    var inputs = rule.el ? [document.getElementById(rule.el)] : form.querySelectorAll('input[name="' + rule.field + '"]');
    Array.prototype.forEach.call(inputs, function (input) {
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
      if (!rule.el) input.setAttribute('aria-describedby', rule.error);
    });
  }

  function validate() {
    var failed = [];
    rules.forEach(function (rule) {
      var message = rule.check();
      showError(rule, message);
      if (message) failed.push(rule);
    });
    return failed;
  }

  // Po pierwszej próbie wysłania błędy aktualizują się na bieżąco.
  form.addEventListener('change', function () { if (attempted) validate(); });
  form.addEventListener('focusout', function () { if (attempted) validate(); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (leadSent) return; // ochrona przed podwójnym kliknięciem / ponownym wysłaniem

    attempted = true;
    var failed = validate();

    if (failed.length) {
      var n = failed.length;
      summary.textContent = 'Popraw ' + n + ' ' + (n === 1 ? 'pole oznaczone' : n < 5 ? 'pola oznaczone' : 'pól oznaczonych') + ' na czerwono.';
      summary.hidden = false;
      var first = failed[0].el ? document.getElementById(failed[0].el) : form.querySelector('input[name="' + failed[0].field + '"]');
      first.focus();
      // Rozszerzenie: które pola blokują – tylko NAZWY pól, nigdy wartości.
      push({
        event: 'form_error',
        form_id: FORM_ID,
        error_field: failed.map(function (r) { return r.field; }).join(',')
      });
      return;
    }

    leadSent = true;
    submitBtn.disabled = true;
    summary.hidden = true;
    form.hidden = true;
    success.hidden = false;
    success.focus();

    push({ event: 'lead_success', form_id: FORM_ID });
  });
})();
