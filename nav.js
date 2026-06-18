// ── Dropdown: close when clicking outside
document.addEventListener('click', function(e) {
  if (!e.target.closest('.nav-dropdown')) {
    document.querySelectorAll('.nav-dropdown.open').forEach(function(d) {
      d.classList.remove('open');
    });
  }
});

// ── FAQ Accordion
document.querySelectorAll('.faq-q').forEach(function(q) {
  q.addEventListener('click', function() {
    var item = this.closest('.faq-item');
    var accordion = item.closest('.faq-accordion, [itemtype*="FAQPage"]');
    if (accordion) {
      accordion.querySelectorAll('.faq-item.open').forEach(function(other) {
        if (other !== item) other.classList.remove('open');
      });
    }
    item.classList.toggle('open');
  });
});

// ── Page fade-out on navigation
document.addEventListener('click', function(e) {
  var link = e.target.closest('a[href]');
  if (!link) return;
  var href = link.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('javascript') || href.startsWith('mailto') ||
      link.target === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (href.startsWith('http') && !href.startsWith(window.location.origin)) return;
  e.preventDefault();
  document.body.style.opacity = '0';
  document.body.style.transform = 'translateY(-8px)';
  document.body.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
  setTimeout(function() { window.location = href; }, 230);
}, true);

// ── Scroll-reveal via IntersectionObserver
(function() {
  if (!window.IntersectionObserver) return;

  var io = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -28px 0px' });

  function initReveal() {
    var sels = [
      '.snap-card', '.hm-cell', '.lb-row', '.coin-tile',
      '.read-card', '.tool-tile', '.tip-card',
      '.trust-item', '.audience-card', '.stat-card',
      '.calc-card', '.quiz-box', '.ws-head',
      '.sector-card', '.watch-card', '.edu-card',
      '.related-card', '.example-box'
    ];
    sels.forEach(function(sel) {
      document.querySelectorAll(sel).forEach(function(el) {
        if (!el.classList.contains('reveal')) {
          el.classList.add('reveal');
          io.observe(el);
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReveal);
  } else {
    initReveal();
  }
})();

// ── Number counter animation (use data-count="42.5" data-prefix="₹" data-suffix="Cr")
(function() {
  if (!window.IntersectionObserver) return;

  function animateCount(el) {
    var target = parseFloat(el.dataset.count);
    if (isNaN(target)) return;
    var suffix = el.dataset.suffix || '';
    var prefix = el.dataset.prefix || '';
    var decimals = (String(el.dataset.count).split('.')[1] || '').length;
    var duration = 1400;
    var startTs = null;
    function step(ts) {
      if (!startTs) startTs = ts;
      var progress = Math.min((ts - startTs) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = prefix + (target * eased).toFixed(decimals) + suffix;
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  var co = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        animateCount(entry.target);
        co.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  function initCounters() {
    document.querySelectorAll('[data-count]').forEach(function(el) {
      co.observe(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCounters);
  } else {
    initCounters();
  }
})();
