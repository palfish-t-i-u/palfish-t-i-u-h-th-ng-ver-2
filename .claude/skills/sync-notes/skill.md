---
name: sync-notes
description: "Đồng bộ thông tin với repo palfish-internal-notes (cross-machine sync). Dùng khi: đầu session cần nạp context từ máy khác, cuối session cần ghi lại thông tin, hoặc user bảo 'sync notes' / 'cập nhật internal notes' / 'lấy note' / 'nối tiếp từ máy kia'."
---

## Repo location

- Local: `D:\File làm việc\automation\palfish-internal-notes`
- GitHub: `GiganticBakery/palfish-internal-notes` (PRIVATE)
- Nếu chưa clone: `gh repo clone GiganticBakery/palfish-internal-notes "D:\File làm việc\automation\palfish-internal-notes"`

## Mode: PULL (đầu session / nạp context)

1. `cd` vào repo internal-notes, chạy `git pull`
2. Đọc `README.md` — section "Tình hình chốt ngày" là tổng quan mới nhất
3. Đọc note liên quan đến topic user đang cần (dựa vào section "Nội dung" trong README)
4. Từ note, xác định file code / plan / learnings liên quan trong repo GMV → đọc thêm nếu cần
5. Tóm tắt cho user: "Đã nạp context từ internal notes — [tóm tắt 2-3 dòng]"

## Mode: PUSH (cuối session / ghi thông tin)

1. Xác định thông tin mới cần sync: quyết định, trạng thái task, bàn giao, root cause, bẫy kỹ thuật, theo dõi tiếp
2. `cd` vào repo internal-notes, chạy `git pull` (tránh conflict)
3. Tạo/cập nhật file note theo quy ước:
   - Tên file: `{topic}-{YYYY-MM-DD}.md`
   - Dòng đầu: `# Tiêu đề mô tả (YYYY-MM-DD)`
   - Dòng 2: `**Dự án:** \`gmv\``
   - Nội dung: **NGỮ CẢNH ĐẦY ĐỦ** — không chỉ ghi sự kiện mà phải ghi: điều tra đã làm gì, kết luận ra sao, quyết định nào đã chốt, bẫy kỹ thuật, việc theo dõi tiếp. Viết đủ để Claude máy khác đọc vào là nối tiếp được mà không cần hỏi lại.
   - Tham chiếu code: relative path từ root repo code (`backend/activation_routes.py:1499`)
4. Cập nhật `README.md`:
   - Section "Nội dung": thêm/sửa dòng mô tả note (1 dòng, tóm tắt nội dung + trạng thái)
   - Section "Tình hình chốt ngày X": thêm/sửa bullet cho từng việc (trạng thái + chi tiết link note)
5. `git add` các file đã sửa, commit, push
6. Báo user: "Đã sync lên internal-notes — [tóm tắt]"

## Quy tắc KHÔNG làm

- KHÔNG commit dữ liệu nhạy cảm: lương thô, HRIS dump, thông tin khách hàng, credentials
- KHÔNG ghi note trống / chỉ có tiêu đề — phải có ngữ cảnh đầy đủ hoặc không ghi
- KHÔNG force push hoặc rebase interactive trên repo này
- KHÔNG xoá note cũ — chỉ thêm mới hoặc cập nhật (history là giá trị)
