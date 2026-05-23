// Extracts sale hierarchy from the source xlsx and writes:
//   - docs/team_hierarchy.json   (structured tree)
//   - docs/team_hierarchy.md     (human-readable for Kem)
// Logic theo PDF "Dự án: Tối ưu luồng nghiệp vụ" (21/05):
//   - Tên định danh = cột "Sale" (tên trên CRM, độc nhất).
//   - depart7_name = team chính.
//   - Nếu depart7 rỗng & depart6 = "Online"/"ONLINE" → team = "HCM (Online)".
//   - depart8_name = sub-team (chỉ Inhouse 1 mới có do quy mô lớn).
// Seed/API: scripts/seed_nhan_su_sale.py + backend/vn_staff.py bỏ sale Thailand (depart6 ~ Thailand, team Tele sale / P'AU / P'TEE).

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const SRC = 'd:\\File làm việc\\automation\\docs dự án sao kê\\ds gói học và tên sale.xlsx';
const OUT_DIR = path.resolve(__dirname, '..', 'docs');
// NOTE: dùng xlsx từ frontend/node_modules. Chạy:
//   cd frontend && node ../scripts/extract_hierarchy.cjs

const wb = XLSX.readFile(SRC);
const ws = wb.Sheets[wb.SheetNames[0]];
const arr = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
const headers = arr[0];

// Use the SECOND "Sale" block (cột "Sale" thứ 2, depart6/7/8 sau đó) — đây là phân loại hiện tại của sale.
const idxSale = headers.lastIndexOf('Sale');
const findAfter = (name, after) => { for (let i = after; i < headers.length; i++) if (headers[i] === name) return i; return -1; };
const i6 = findAfter('depart6_name', idxSale);
const i7 = findAfter('depart7_name', idxSale);
const i8 = findAfter('depart8_name', idxSale);

const saleMap = new Map(); // sale -> { d6:Set, d7:Set, d8:Set, count }
for (let r = 1; r < arr.length; r++) {
  const row = arr[r];
  if (!row) continue;
  const sale = (row[idxSale] || '').toString().trim();
  if (!sale) continue;
  if (!saleMap.has(sale)) saleMap.set(sale, { d6: new Set(), d7: new Set(), d8: new Set(), count: 0 });
  const cur = saleMap.get(sale);
  if (row[i6]) cur.d6.add(row[i6]);
  if (row[i7]) cur.d7.add(row[i7]);
  if (row[i8]) cur.d8.add(row[i8]);
  cur.count++;
}

function pickTeam(info) {
  const d7 = [...info.d7].filter(Boolean);
  const d6 = [...info.d6].filter(Boolean);
  if (d7.length) return d7[0];
  if (d6.some((x) => /online/i.test(x))) return 'HCM (Online)';
  return d6[0] || 'Khác / Chưa phân loại';
}

const tree = {}; // team -> subteam ('' nếu không có) -> array sale
const flat = [];
for (const [sale, info] of saleMap) {
  const team = pickTeam(info);
  const sub = [...info.d8].filter(Boolean)[0] || '';
  if (!tree[team]) tree[team] = {};
  if (!tree[team][sub]) tree[team][sub] = [];
  const rec = {
    sale,
    team,
    sub_team: sub,
    depart6: [...info.d6].filter(Boolean),
    depart7: [...info.d7].filter(Boolean),
    depart8: [...info.d8].filter(Boolean),
    order_count_2y: info.count,
  };
  tree[team][sub].push(rec);
  flat.push(rec);
}

// Sort each leaf by order_count desc.
for (const t of Object.keys(tree)) for (const s of Object.keys(tree[t])) tree[t][s].sort((a, b) => b.order_count_2y - a.order_count_2y);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'team_hierarchy.json'), JSON.stringify({ generated_at: new Date().toISOString(), source_file: SRC, logic: 'team = depart7 || (depart6 ~ /online/i ? "HCM (Online)" : depart6); sub_team = depart8 (Inhouse 1)', total_sales: saleMap.size, tree }, null, 2));

// Markdown report
const lines = [];
lines.push('# Cây nhân sự Sale (rút từ Metabase remaining-lesson-vn)');
lines.push('');
lines.push('> File này tự sinh từ `_extract_hierarchy.cjs` để Minh giải thích cấu trúc team cho Kem.');
lines.push('> Nguồn: `' + path.basename(SRC) + '` (cột `Sale` + `depart6/7/8` lần xuất hiện thứ 2).');
lines.push('');
lines.push('## Quy tắc phân team (theo PDF Thu Hiền, ngày 21/05)');
lines.push('');
lines.push('1. **Tên định danh** = cột `Sale` (tên trên CRM — đảm bảo độc nhất theo quy định tổng bộ).');
lines.push('2. **Team chính** = `depart7_name`.');
lines.push('3. Nếu `depart7_name` rỗng → check `depart6_name`. Nếu là `Online/ONLINE` thì gán team = **HCM (Online)**; còn lại lấy luôn `depart6_name` (vd. "HN Inhouse", "HN Offline Store", "Group KL", "Marketing", "Sales").');
lines.push('4. **Sub-team** = `depart8_name`. Hiện tại chỉ team **Inhouse 1** (HN) đủ lớn để có sub-team (`Team 1..5`, `Sales`).');
lines.push('');
lines.push('## Tổng quan');
lines.push('');
lines.push(`- Tổng số sale phân loại được: **${saleMap.size}**`);
const teamCount = Object.keys(tree).length;
lines.push(`- Tổng số team cấp 1: **${teamCount}**`);
lines.push('');

// Sort teams by total orders desc.
const teamTotals = Object.entries(tree).map(([t, subs]) => {
  let total = 0, salesN = 0;
  for (const s of Object.keys(subs)) { total += subs[s].reduce((a, r) => a + r.order_count_2y, 0); salesN += subs[s].length; }
  return { team: t, total, salesN };
}).sort((a, b) => b.total - a.total);

lines.push('| # | Team | Số sale | Tổng order 2 năm |');
lines.push('|---|------|---------|------------------|');
teamTotals.forEach((t, i) => lines.push(`| ${i + 1} | ${t.team} | ${t.salesN} | ${t.total.toLocaleString()} |`));
lines.push('');

lines.push('## Chi tiết theo team');
lines.push('');
for (const { team } of teamTotals) {
  const subs = tree[team];
  const subKeys = Object.keys(subs).sort();
  const totalOrders = subKeys.reduce((a, s) => a + subs[s].reduce((b, r) => b + r.order_count_2y, 0), 0);
  const salesN = subKeys.reduce((a, s) => a + subs[s].length, 0);
  lines.push(`### ${team}  _(${salesN} sale, ${totalOrders.toLocaleString()} order)_`);
  lines.push('');
  for (const sub of subKeys) {
    const list = subs[sub];
    const label = sub ? `**Sub-team: ${sub}**` : '_(không có sub-team)_';
    lines.push(`- ${label} — ${list.length} sale`);
    for (const r of list) lines.push(`  - ${r.sale} \`(${r.order_count_2y} order)\``);
  }
  lines.push('');
}

fs.writeFileSync(path.join(OUT_DIR, 'team_hierarchy.md'), lines.join('\n'), 'utf8');

console.log('Wrote:');
console.log(' -', path.join(OUT_DIR, 'team_hierarchy.json'));
console.log(' -', path.join(OUT_DIR, 'team_hierarchy.md'));
console.log('Sales:', saleMap.size, '| Teams:', teamCount);
