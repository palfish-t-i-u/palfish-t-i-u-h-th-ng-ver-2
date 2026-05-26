// country-combo.jsx — searchable country code picker

const COUNTRIES = [
  { code: 'VN', name: 'Việt Nam',           dial: '+84',  flag: '🇻🇳' },
  { code: 'US', name: 'United States',      dial: '+1',   flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom',     dial: '+44',  flag: '🇬🇧' },
  { code: 'CN', name: 'China',              dial: '+86',  flag: '🇨🇳' },
  { code: 'JP', name: 'Japan',              dial: '+81',  flag: '🇯🇵' },
  { code: 'KR', name: 'South Korea',        dial: '+82',  flag: '🇰🇷' },
  { code: 'TH', name: 'Thailand',           dial: '+66',  flag: '🇹🇭' },
  { code: 'SG', name: 'Singapore',          dial: '+65',  flag: '🇸🇬' },
  { code: 'MY', name: 'Malaysia',           dial: '+60',  flag: '🇲🇾' },
  { code: 'ID', name: 'Indonesia',          dial: '+62',  flag: '🇮🇩' },
  { code: 'PH', name: 'Philippines',        dial: '+63',  flag: '🇵🇭' },
  { code: 'IN', name: 'India',              dial: '+91',  flag: '🇮🇳' },
  { code: 'AU', name: 'Australia',          dial: '+61',  flag: '🇦🇺' },
  { code: 'NZ', name: 'New Zealand',        dial: '+64',  flag: '🇳🇿' },
  { code: 'CA', name: 'Canada',             dial: '+1',   flag: '🇨🇦' },
  { code: 'DE', name: 'Germany',            dial: '+49',  flag: '🇩🇪' },
  { code: 'FR', name: 'France',             dial: '+33',  flag: '🇫🇷' },
  { code: 'IT', name: 'Italy',              dial: '+39',  flag: '🇮🇹' },
  { code: 'ES', name: 'Spain',              dial: '+34',  flag: '🇪🇸' },
  { code: 'NL', name: 'Netherlands',        dial: '+31',  flag: '🇳🇱' },
  { code: 'CH', name: 'Switzerland',        dial: '+41',  flag: '🇨🇭' },
  { code: 'SE', name: 'Sweden',             dial: '+46',  flag: '🇸🇪' },
  { code: 'NO', name: 'Norway',             dial: '+47',  flag: '🇳🇴' },
  { code: 'FI', name: 'Finland',            dial: '+358', flag: '🇫🇮' },
  { code: 'DK', name: 'Denmark',            dial: '+45',  flag: '🇩🇰' },
  { code: 'PL', name: 'Poland',             dial: '+48',  flag: '🇵🇱' },
  { code: 'RU', name: 'Russia',             dial: '+7',   flag: '🇷🇺' },
  { code: 'TR', name: 'Türkiye',            dial: '+90',  flag: '🇹🇷' },
  { code: 'AE', name: 'United Arab Emirates', dial: '+971', flag: '🇦🇪' },
  { code: 'SA', name: 'Saudi Arabia',       dial: '+966', flag: '🇸🇦' },
  { code: 'IL', name: 'Israel',             dial: '+972', flag: '🇮🇱' },
  { code: 'EG', name: 'Egypt',              dial: '+20',  flag: '🇪🇬' },
  { code: 'ZA', name: 'South Africa',       dial: '+27',  flag: '🇿🇦' },
  { code: 'NG', name: 'Nigeria',            dial: '+234', flag: '🇳🇬' },
  { code: 'BR', name: 'Brazil',             dial: '+55',  flag: '🇧🇷' },
  { code: 'AR', name: 'Argentina',          dial: '+54',  flag: '🇦🇷' },
  { code: 'MX', name: 'Mexico',             dial: '+52',  flag: '🇲🇽' },
  { code: 'CL', name: 'Chile',              dial: '+56',  flag: '🇨🇱' },
  { code: 'PE', name: 'Peru',               dial: '+51',  flag: '🇵🇪' },
  { code: 'CO', name: 'Colombia',           dial: '+57',  flag: '🇨🇴' },
  { code: 'HK', name: 'Hong Kong',          dial: '+852', flag: '🇭🇰' },
  { code: 'TW', name: 'Taiwan',             dial: '+886', flag: '🇹🇼' },
  { code: 'MO', name: 'Macao',              dial: '+853', flag: '🇲🇴' },
  { code: 'KH', name: 'Cambodia',           dial: '+855', flag: '🇰🇭' },
  { code: 'LA', name: 'Laos',               dial: '+856', flag: '🇱🇦' },
  { code: 'MM', name: 'Myanmar',            dial: '+95',  flag: '🇲🇲' },
  { code: 'BD', name: 'Bangladesh',         dial: '+880', flag: '🇧🇩' },
  { code: 'PK', name: 'Pakistan',           dial: '+92',  flag: '🇵🇰' },
  { code: 'IR', name: 'Iran',               dial: '+98',  flag: '🇮🇷' },
];

function CountryCombo({ value, onChange }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [focusIdx, setFocusIdx] = React.useState(0);
  const ref = React.useRef(null);
  const inputRef = React.useRef(null);

  const country = COUNTRIES.find(c => c.code === value) || COUNTRIES[0];

  React.useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  React.useEffect(() => {
    if (open) { setQuery(''); setFocusIdx(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.dial.includes(q) ||
      c.code.toLowerCase().includes(q)
    );
  }, [query]);

  const pick = (c) => { onChange(c.code); setOpen(false); };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter')   { e.preventDefault(); filtered[focusIdx] && pick(filtered[focusIdx]); }
    else if (e.key === 'Escape')  { setOpen(false); }
  };

  return (
    <div className="cc-combo" ref={ref}>
      <button type="button" className={`cc-trigger ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}>
        <span style={{ fontSize: 16, lineHeight: 1 }}>{country.flag}</span>
        <span className="cc-dial">{country.dial}</span>
        <Icons.ChevronDown size={14} stroke="var(--text-3)" />
      </button>
      {open && (
        <div className="cc-pop">
          <div className="cc-search">
            <Icons.Search size={14} stroke="var(--text-3)" />
            <input
              ref={inputRef}
              placeholder="Tìm theo tên hoặc đầu số (VD: viet, 84)"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setFocusIdx(0); }}
              onKeyDown={onKey}
            />
          </div>
          <div className="cc-list">
            {filtered.length === 0 && (
              <div style={{ padding: 12, color: 'var(--text-3)', fontSize: 12, textAlign: 'center' }}>
                Không tìm thấy quốc gia.
              </div>
            )}
            {filtered.map((c, i) => (
              <div
                key={c.code}
                className={`cc-opt ${i === focusIdx ? 'focused' : ''} ${c.code === value ? 'focused' : ''}`}
                onMouseEnter={() => setFocusIdx(i)}
                onClick={() => pick(c)}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>{c.flag}</span>
                <span className="cc-opt-name">{c.name}</span>
                <span className="cc-opt-dial">{c.dial}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

window.CountryCombo = CountryCombo;
window.COUNTRIES = COUNTRIES;
