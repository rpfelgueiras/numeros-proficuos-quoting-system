/* Shared quote logic for all three design options.
   Everything runs in the browser; the draft is kept in localStorage only
   so a refresh doesn't lose work. Nothing is sent anywhere. */
(function () {
  const COMPANY = {
    name: 'Numeros Proficuos',
    street: 'Rua Joaquim Pinto, 210 - 1.º',
    city: '4815-434 Vizela, Portugal',
    nif: '517 870 444',
    phone: '933 658 520',
    email: 'numerosproficuos@gmail.com',
    web: 'numerosproficuos.pt',
  };

  const CATEGORIES = ['Construção civil', 'Eletricidade', 'Canalizações', 'Ar condicionado', 'Outros'];
  const UNITS = ['un', 'm', 'm²', 'm³', 'h', 'kg', 'vg'];
  const VAT_RATES = [
    { value: 23, label: 'IVA 23%' },
    { value: 13, label: 'IVA 13%' },
    { value: 6, label: 'IVA 6%' },
    { value: 0, label: 'Sem IVA' },
  ];

  const DRAFT_KEY = 'np-quote-draft';
  const SEQ_KEY = 'np-quote-seq';

  const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
  const num = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 3 });

  function parseNum(value) {
    const n = parseFloat(String(value ?? '').replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  function toISO(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function fromISO(iso) {
    const [y, m, d] = String(iso || '').split('-').map(Number);
    return y ? new Date(y, m - 1, d) : null;
  }

  function addDays(iso, days) {
    const d = fromISO(iso) || new Date();
    d.setDate(d.getDate() + days);
    return toISO(d);
  }

  function daysBetween(fromIso, toIso) {
    const a = fromISO(fromIso), b = fromISO(toIso);
    if (!a || !b) return 0;
    return Math.round((b - a) / 86400000);
  }

  function fmtDate(iso, style = 'short') {
    const d = fromISO(iso);
    if (!d) return '';
    return style === 'long'
      ? d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })
      : d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function storage(fn, fallback) {
    try { return fn(window.localStorage); } catch { return fallback; }
  }

  function nextNumber() {
    const year = new Date().getFullYear();
    const seq = storage((s) => {
      const saved = JSON.parse(s.getItem(SEQ_KEY) || '{}');
      const next = saved.year === year ? saved.seq + 1 : 1;
      s.setItem(SEQ_KEY, JSON.stringify({ year, seq: next }));
      return next;
    }, 1);
    return `${year}/${String(seq).padStart(3, '0')}`;
  }

  let lineSeq = 0;
  function newLine(partial = {}) {
    lineSeq += 1;
    return { id: `l${Date.now().toString(36)}${lineSeq}`, desc: '', qty: '1', unit: 'un', price: '', cat: CATEGORIES[0], ...partial };
  }

  function blank() {
    const today = toISO(new Date());
    return {
      number: nextNumber(),
      date: today,
      validUntil: addDays(today, 30),
      vat: 23,
      notes: '',
      customer: { name: '', nif: '', address: '', postal: '', phone: '', email: '' },
      lines: [newLine()],
    };
  }

  // Open any option with #exemplo in the URL to see it filled with a sample quote.
  function sample() {
    const today = toISO(new Date());
    return {
      number: `${new Date().getFullYear()}/014`, date: today, validUntil: addDays(today, 30), vat: 23,
      notes: 'Prazo de execução: 3 semanas após adjudicação.\nPagamento: 40% na adjudicação, restante no fim da obra.',
      customer: { name: 'Maria Ferreira', nif: '231 456 789', address: 'Rua de São Miguel, 48', postal: '4815-512 Vizela', phone: '912 345 678', email: 'maria.ferreira@email.pt' },
      lines: [
        newLine({ cat: 'Construção civil', desc: 'Demolição de azulejo e reboco na casa de banho', qty: '18', unit: 'm²', price: '14,50' }),
        newLine({ cat: 'Construção civil', desc: 'Assentamento de mosaico cerâmico, incluindo cola e betume', qty: '18', unit: 'm²', price: '32' }),
        newLine({ cat: 'Canalizações', desc: 'Substituição da rede de águas em multicamada', qty: '1', unit: 'vg', price: '640' }),
        newLine({ cat: 'Eletricidade', desc: 'Novo circuito para iluminação e tomadas', qty: '6', unit: 'un', price: '45' }),
        newLine({ cat: 'Ar condicionado', desc: 'Instalação de split 12000 BTU, com material', qty: '1', unit: 'un', price: '890' }),
      ],
    };
  }

  function load() {
    if (location.hash === '#exemplo') return sample();
    const saved = storage((s) => JSON.parse(s.getItem(DRAFT_KEY) || 'null'), null);
    if (saved && Array.isArray(saved.lines) && saved.customer) return saved;
    return blank();
  }

  let saveTimer;
  function save(state) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => storage((s) => s.setItem(DRAFT_KEY, JSON.stringify(state))), 250);
  }

  function lineTotal(line) {
    return parseNum(line.qty) * parseNum(line.price);
  }

  function totals(state) {
    const subtotal = state.lines.reduce((sum, l) => sum + lineTotal(l), 0);
    const vat = subtotal * (Number(state.vat) || 0) / 100;
    return { subtotal, vat, total: subtotal + vat };
  }

  function vatLabel(rate) {
    return (VAT_RATES.find((r) => r.value === Number(rate)) || VAT_RATES[0]).label;
  }

  // Chrome and Safari use document.title as the suggested PDF file name.
  function printQuote(state) {
    const previous = document.title;
    const who = state.customer.name.trim();
    document.title = `Orçamento ${state.number.replace('/', '-')}${who ? ' ' + who : ''}`;
    window.addEventListener('afterprint', () => { document.title = previous; }, { once: true });
    window.print();
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const LOGO_SVG = `<svg viewBox="40 35 635 535" role="img" aria-label="Numeros Proficuos"><path fill="currentColor" d="M50 272 L122 238 L340 440 L340 560 L250 560 L125 345 L125 560 L50 560 Z"/><path fill="currentColor" d="M240 100 L340 45 L340 424 L240 332 Z"/><path fill="var(--logo-blue, #1F6DB5)" d="M356 152 L460 204 L460 560 L356 560 Z"/><path fill="currentColor" fill-rule="evenodd" d="M470 210 H548 A117.5 117.5 0 0 1 548 445 H470 Z M470 300 H542 A37.5 37.5 0 0 1 542 375 H470 Z"/></svg>`;

  window.QuoteCore = {
    COMPANY, CATEGORIES, UNITS, VAT_RATES, LOGO_SVG,
    eur: (n) => eur.format(n), fmtNum: (n) => num.format(n),
    parseNum, toISO, addDays, daysBetween, fmtDate,
    blank, load, save, newLine, lineTotal, totals, vatLabel, printQuote, escapeHtml,
  };
})();
