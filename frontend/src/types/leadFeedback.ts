/** Feedback lead — sale gửi bằng chứng + ghi chú về chất lượng lead; MKT nhận xét lại. */

export interface LeadFeedbackImage {
  url: string;
}

export type LeadFeedbackStatus = "wait" | "done";

export interface LeadFeedback {
  id: string;
  created_at: string;
  sale_email: string;
  sale_name: string | null;
  phone: string;
  uid: string | null;
  customer_name: string | null;
  lead_source: string | null; // key LEAD_SOURCES (quang_cao...)
  lead_channel: string | null; // value/code kênh
  lead_id: string | null;
  sale_note: string;
  sale_images: LeadFeedbackImage[];
  status: LeadFeedbackStatus;
  mkt_note: string | null;
  mkt_images: LeadFeedbackImage[];
  mkt_by: string | null;
  mkt_at: string | null;
}

export interface LeadFeedbackListResponse {
  items: LeadFeedback[];
  can_review: boolean; // team MKT — được điền Block 3 + xem hết
  can_create: boolean; // được tạo feedback (sale)
}

export interface CreateLeadFeedbackBody {
  phone: string;
  sale_note: string;
  uid?: string | null;
  customer_name?: string | null;
  lead_source?: string | null;
  lead_channel?: string | null;
  lead_id?: string | null;
}
