// Close dropdown when clicking anywhere outside it
document.addEventListener('click', function(e) {
  if (!e.target.closest('.nav-dropdown')) {
    document.querySelectorAll('.nav-dropdown.open').forEach(function(d) {
      d.classList.remove('open');
    });
  }
});

// FAQ Accordion
document.querySelectorAll('.faq-q').forEach(function(q) {
  q.addEventListener('click', function() {
    var item = this.closest('.faq-item');
    var isOpen = item.classList.contains('open');
    // Close all others in the same accordion
    var accordion = item.closest('.faq-accordion, [itemtype*="FAQPage"]');
    if (accordion) {
      accordion.querySelectorAll('.faq-item.open').forEach(function(other) {
        if (other !== item) other.classList.remove('open');
      });
    }
    item.classList.toggle('open');
  });
});
