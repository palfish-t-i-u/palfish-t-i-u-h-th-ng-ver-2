// date-filter.jsx — searchable date range picker (with quick presets)

function DateRangeFilter({ value, onChange }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const hasFilter = !!(value?.from || value?.to);
  const fmt = (s) => s ? s.split('-').reverse().join('/') : '';

  const setPreset = (preset) => {
    const today = new Date('2026-05-26T22:30:00+07:00');
    const iso = (d) => d.toISOString().slice(0, 10);
    if (preset === 'today') {
      const t = iso(today); onChange({ from: t, to: t, preset });
    } else if (preset === '7d') {
      const from = new Date(today); from.setDate(today.getDate() - 6);
      onChange({ from: iso(from), to: iso(today), preset });
    } else if (preset === '30d') {
      const from = new Date(today); from.setDate(today.getDate() - 29);
      onChange({ from: iso(from), to: iso(today), preset });
    } else if (preset === 'thismonth') {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      onChange({ from: iso(from), to: iso(today), preset });
    } else if (preset === 'all') {
      onChange({ from: '', to: '', preset: 'all' });
    }
  };

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className={`date-filter ${hasFilter ? 'active' : ''}`} onClick={() => setOpen(!open)}>
        <Icons.Clock size={13} />
        {!hasFilter && 'Khoảng thời gian'}
        {hasFilter && `${fmt(value.from) || '…'} → ${fmt(value.to) || 'nay'}`}
        <Icons.ChevronDown size={13} />
      </button>
      {open && (
        <div className="date-pop">
          <div className="info-label">Khoảng nhanh</div>
          <div className="quick-row">
            {[
              ['today', 'Hôm nay'],
              ['7d', '7 ngày'],
              ['30d', '30 ngày'],
              ['thismonth', 'Tháng này'],
              ['all', 'Toàn bộ'],
            ].map(([k, label]) => (
              <button
                key={k}
                className={`quick ${value?.preset === k ? 'active' : ''}`}
                onClick={() => setPreset(k)}
              >{label}</button>
            ))}
          </div>
          <div className="info-label" style={{ marginTop: 6 }}>Tuỳ chỉnh</div>
          <div className="range-inputs">
            <input
              type="date"
              value={value?.from || ''}
              onChange={(e) => onChange({ ...value, from: e.target.value, preset: 'custom' })}
            />
            <input
              type="date"
              value={value?.to || ''}
              onChange={(e) => onChange({ ...value, to: e.target.value, preset: 'custom' })}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <button className="btn btn-outline btn-sm" onClick={() => onChange({ from: '', to: '', preset: 'all' })}>
              Xoá lọc
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setOpen(false)}>
              <Icons.Check size={13} /> Áp dụng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

window.DateRangeFilter = DateRangeFilter;
