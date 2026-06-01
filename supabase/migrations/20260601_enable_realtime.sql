-- Enable Supabase Realtime on operational tables so cross-session
-- changes are pushed to all connected clients automatically.
--
-- Run this against the production Supabase project via SQL Editor
-- or `supabase db push`.

ALTER PUBLICATION supabase_realtime ADD TABLE payment_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE payment_lines;
ALTER PUBLICATION supabase_realtime ADD TABLE active_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE so_doanh_thu;
