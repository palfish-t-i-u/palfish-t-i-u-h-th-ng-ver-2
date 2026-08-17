#!/usr/bin/env node
/**
 * bq-schema-watch.js — Phát hiện thay đổi schema các bảng/view BQ mà scripts phiếu lương phụ thuộc,
 * KHÔNG cần chờ Chung báo. So schema LIVE (bq INFORMATION_SCHEMA) với baseline đã lưu.
 *
 * Vì scripts (BangLuong/BangTinhThue) bám TÊN CỘT, mỗi lần Chung xoá/đổi cột là có nguy cơ gãy.
 * Chạy lệnh này trước/sau khi Chung đụng bảng để biết chính xác cột nào đổi → sửa script tương ứng.
 *
 * DÙNG:
 *   node bq-schema-watch.js          # in diff so với baseline (cột XOÁ/THÊM/ĐỔI KIỂU)
 *   node bq-schema-watch.js --save   # cập nhật baseline = schema hiện tại (sau khi đã sửa xong)
 *
 * CẦN: bq CLI đã auth (gcloud), quyền đọc pf-salary.
 *   (Sandbox git-bash: prefix CLOUDSDK_PYTHON=<python thật> nếu `bq` báo "Python was not found".)
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT = 'pf-salary';
// Bảng/view theo dataset mà scripts phụ thuộc. Thêm bảng mới vào đây khi cần theo dõi.
const WATCH = {
  payroll: [
    'C_view_bang_luong_truoc_thue',            // nguồn chính BangLuong + BangTinhThue
    'C_view_bang_luong_co_ban_theo_ngay_cong', // join cb
    'C_raw_staff_info_merged',                 // join s (NPT)
    'C_view_bang_tro_cap_bao_hiem',            // trợ cấp/BH
    'C_view_bang_thuong_com',                  // COM chi tiết (dự phòng)
  ],
  // palfish_gmv_public: ['C_v_so_doanh_thu_dedup'],  // bật nếu cần theo dõi nguồn GMV
};
const BASELINE = path.join(__dirname, 'bq-schema-baseline.json');

function fetchDataset(dataset, tables) {
  const list = tables.map(t => `"${t}"`).join(',');
  const sql =
    `SELECT table_name, column_name, data_type ` +
    `FROM \`${PROJECT}.${dataset}.INFORMATION_SCHEMA.COLUMNS\` ` +
    `WHERE table_name IN (${list}) ORDER BY table_name, ordinal_position`;
  // Truyền SQL qua stdin để tránh lỗi quote backtick khi qua shell.
  // --max_rows lớn: bq query mặc định CẮT ở 100 dòng → nhiều bảng sẽ mất cột cuối.
  const out = execSync('bq query --use_legacy_sql=false --format=json --max_rows=1000000', {
    input: sql, encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024,
  });
  const rows = JSON.parse(out || '[]');
  const schema = {};
  for (const r of rows) {
    const key = dataset + '.' + r.table_name;
    (schema[key] = schema[key] || {})[r.column_name] = r.data_type;
  }
  return schema;
}

function fetchSchema() {
  let schema = {};
  for (const [dataset, tables] of Object.entries(WATCH)) {
    Object.assign(schema, fetchDataset(dataset, tables));
  }
  return schema;
}

function main() {
  const cur = fetchSchema();

  if (process.argv.includes('--save')) {
    fs.writeFileSync(BASELINE, JSON.stringify(cur, null, 2) + '\n', 'utf-8');
    console.log('✅ Đã lưu baseline (' + Object.keys(cur).length + ' bảng):', BASELINE);
    return;
  }

  let base;
  try { base = JSON.parse(fs.readFileSync(BASELINE, 'utf-8')); }
  catch (e) { console.log('Chưa có baseline. Chạy trước: node bq-schema-watch.js --save'); return; }

  const keys = Array.from(new Set([...Object.keys(base), ...Object.keys(cur)]));
  let changed = false;
  for (const k of keys.sort()) {
    const b = base[k], c = cur[k];
    if (b && !c) { changed = true; console.log(`\n### ${k}\n  ⚠️  BẢNG BIẾN MẤT`); continue; }
    if (!b && c) { changed = true; console.log(`\n### ${k}\n  🆕 BẢNG MỚI: ${Object.keys(c).join(', ')}`); continue; }
    const removed = Object.keys(b).filter(x => !(x in c));
    const added   = Object.keys(c).filter(x => !(x in b));
    const retyped = Object.keys(c).filter(x => (x in b) && b[x] !== c[x]).map(x => `${x}: ${b[x]}→${c[x]}`);
    if (removed.length || added.length || retyped.length) {
      changed = true;
      console.log(`\n### ${k}`);
      if (removed.length) console.log('  ❌ XOÁ     :', removed.join(', '));
      if (added.length)   console.log('  ➕ THÊM    :', added.join(', '));
      if (retyped.length) console.log('  ✏️  ĐỔI KIỂU:', retyped.join('; '));
    }
  }

  if (!changed) {
    console.log('✅ Không có thay đổi schema so với baseline.');
  } else {
    console.log('\n→ Cột XOÁ/ĐỔI KIỂU = nguy cơ gãy script. Sửa scripts tham chiếu cột đó, rồi chạy --save.');
    process.exitCode = 1;
  }
}

main();
