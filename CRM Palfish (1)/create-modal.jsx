// create-modal.jsx — create new Payment Request

function CreatePrModal({ open, onClose, onCreate }) {
  const [form, setForm] = React.useState({
    uid: '', name: '', country: 'VN', phone: '',
    address: '', ward: '', province: '',
    target: '', note: '',
  });

  React.useEffect(() => {
    if (open) setForm({
      uid: '', name: '', country: 'VN', phone: '',
      address: '', ward: '', province: '',
      target: '', note: '',
    });
  }, [open]);

  if (!open) return null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const targetNum = parseInt(String(form.target).replace(/\D/g, ''), 10) || 0;
  const canSubmit = form.uid && form.name && form.phone && targetNum > 0;

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ width: 'min(680px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>Tạo Payment Request mới</h3>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Bước 1 · Điền thông tin khách &amp; tổng tiền dự kiến → hệ thống xuất PR-ID
            </div>
          </div>
          <button className="drawer-close" onClick={onClose}><Icons.Close size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="field-row">
            <div className="field">
              <label>UID CRM <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input placeholder="VD: 3213123123" value={form.uid} onChange={(e) => set('uid', e.target.value)} />
            </div>
            <div className="field">
              <label>Tên khách hàng <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input placeholder="Họ và tên" value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Số điện thoại <span style={{ color: 'var(--danger)' }}>*</span></label>
              <div className="phone-row">
                <CountryCombo value={form.country} onChange={(v) => set('country', v)} />
                <input
                  className="phone-input"
                  placeholder="9xx xxx xxx"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value.replace(/[^\d]/g, ''))}
                />
              </div>
            </div>
            <div className="field">
              <label>Tổng tiền dự kiến <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                placeholder="VD: 12.000.000"
                value={form.target}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d]/g, '');
                  set('target', v ? Number(v).toLocaleString('vi-VN') : '');
                }}
              />
            </div>
          </div>

          <div className="field">
            <label>Địa chỉ khách hàng</label>
            <div className="addr-row" style={{ marginBottom: 8 }}>
              <input
                placeholder="Tỉnh / Thành phố"
                value={form.province}
                onChange={(e) => set('province', e.target.value)}
              />
              <input
                placeholder="Phường / Xã"
                value={form.ward}
                onChange={(e) => set('ward', e.target.value)}
              />
            </div>
            <input
              placeholder="Số nhà, đường (VD: 119 Phúc Xá)"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
            />
          </div>

          <div className="field">
            <label>Ghi chú</label>
            <textarea
              placeholder="Ghi chú nội bộ về thoả thuận với khách (số đợt, deadline, ...)"
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
            />
          </div>

          <div style={{
            background: 'var(--primary-50)', border: '1px solid var(--primary-100)',
            borderRadius: 10, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <Icons.AlertCircle size={16} stroke="var(--primary-700)" />
            <div style={{ fontSize: 12, color: 'var(--primary-700)', lineHeight: 1.5 }}>
              Sau khi tạo, hệ thống sẽ sinh <strong>PR-ID</strong> và mở thẳng trang chi tiết để bạn tạo lần thanh toán đầu tiên
              (chuyển khoản QR, tiền mặt, quẹt thẻ hoặc trả góp).
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-outline" onClick={onClose}>Huỷ</button>
          <button
            className="btn btn-primary"
            disabled={!canSubmit}
            style={!canSubmit ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
            onClick={() => canSubmit && onCreate({ ...form, target: targetNum })}
          >
            <Icons.Plus size={14} /> Tạo PR-ID &amp; mở chi tiết
          </button>
        </div>
      </div>
    </div>
  );
}

// QR view modal (the actual QR code popup the sales person would screenshot for the customer)
function QrViewModal({ qr, pr, onClose }) {
  if (!qr || !pr) return null;
  const { VND, fmtPhone } = window.MockData;
  const country = window.COUNTRIES.find(c => c.code === (pr.country || 'VN')) || { dial: '+84', flag: '🇻🇳' };
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ width: 'min(540px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>QR thanh toán · Lần #{qr.idx}</h3>
          <button className="drawer-close" onClick={onClose}><Icons.Close size={16} /></button>
        </div>
        <div className="modal-body" style={{ gap: 18 }}>
          <div className="qr-detail-card">
            <div className="qr-big">
              <svg viewBox="0 0 24 24" width="170" height="170" fill="none" style={{ color: 'var(--text)' }}>
                <rect x="2" y="2" width="6" height="6" stroke="currentColor" strokeWidth="1" fill="none" />
                <rect x="4" y="4" width="2" height="2" fill="currentColor" />
                <rect x="16" y="2" width="6" height="6" stroke="currentColor" strokeWidth="1" fill="none" />
                <rect x="18" y="4" width="2" height="2" fill="currentColor" />
                <rect x="2" y="16" width="6" height="6" stroke="currentColor" strokeWidth="1" fill="none" />
                <rect x="4" y="18" width="2" height="2" fill="currentColor" />
                {Array.from({ length: 60 }).map((_, i) => {
                  const x = i * 7919 % 20;
                  const y = i * 4099 % 20;
                  if (x < 6 && y < 6 || x > 14 && y < 6 || x < 6 && y > 14) return null;
                  return <rect key={i} x={2 + x} y={2 + y} width="1" height="1" fill="currentColor" />;
                })}
              </svg>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <div className="info-label">Khách hàng</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{pr.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{country.flag} {country.dial} {fmtPhone(pr.phone)}</div>
              </div>
              <div>
                <div className="info-label">Số tiền</div>
                <div className="info-value money">{VND(qr.amount)}</div>
              </div>
              <div>
                <div className="info-label">Nội dung CK</div>
                <div style={{
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 13,
                  background: 'var(--primary-50)', color: 'var(--primary-700)',
                  border: '1px solid var(--primary-100)',
                  padding: '6px 9px', borderRadius: 7,
                  display: 'inline-block', fontWeight: 600,
                }}>{qr.code}</div>
              </div>
              <div>
                <div className="info-label">Ngân hàng nhận</div>
                <div className="info-value">{qr.bank} · PalFish Vietnam Co., Ltd</div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }}>
              <Icons.Copy size={14} /> Copy nội dung CK
            </button>
            <button className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }}>
              <Icons.Download size={14} /> Tải ảnh QR
            </button>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-outline" onClick={onClose}>Đóng</button>
          <button className="btn btn-primary"><Icons.Upload size={14} /> Up biên lai</button>
        </div>
      </div>
    </div>
  );
}

window.CreatePrModal = CreatePrModal;
window.QrViewModal = QrViewModal;
