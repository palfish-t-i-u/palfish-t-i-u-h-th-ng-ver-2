# Supabase Storage — bucket `bills`

> Theo dõi: **`docs/TODO.md`** (B-05). Deploy: **`docs/DEPLOY.md`** §3.1 / smoke §4.

Backend endpoint `POST /orders/{id}/bill` upload bill image qua multipart vào bucket
`bills`, sau đó set `don_hang.bill_image = <public URL>`. Trước khi dùng, tạo bucket
+ policy theo các bước dưới.

## 1. Tạo bucket

**Cách A — Dashboard:**

1. Supabase Dashboard → **Storage** → **New bucket**.
2. Name: `bills`. Public bucket: **ON** (read public, write qua service role).
3. Save.

**Cách B — SQL Editor:**

```sql
insert into storage.buckets (id, name, public)
values ('bills', 'bills', true)
on conflict (id) do update set public = excluded.public;
```

## 2. Policies (RLS Storage)

Service role tự bypass RLS → endpoint backend chạy được ngay. Nếu sau này frontend
upload trực tiếp (browser dùng anon key), thêm policy cho phép `authenticated`
upload:

```sql
-- Cho phép user đã đăng nhập upload vào bucket bills
create policy "authenticated upload bills"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'bills');

-- Cho phép user đã đăng nhập update/replace object của chính họ
create policy "authenticated update own bills"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'bills' and owner = auth.uid());

-- Read public (bucket public = true đã tự xử lý; thêm policy cho chắc)
create policy "public read bills"
  on storage.objects for select
  to public
  using (bucket_id = 'bills');
```

## 3. Backward compatibility

- `don_hang.bill_image` vẫn chấp nhận cả base64 (`data:image/...`) lẫn URL.
- Frontend: nếu giá trị bắt đầu `data:` thì render trực tiếp, ngược lại render
  như `<img src={url}>` / link tải.

## 4. Smoke test

```bash
curl -X POST "$API/orders/<order-id>/bill" \
  -H "Authorization: Bearer <jwt>" \
  -F "file=@bill.jpg"
# → {"billImage": "https://....supabase.co/storage/v1/object/public/bills/<id>/<uuid>.jpg", "order": {...}}
```
