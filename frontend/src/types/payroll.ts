export type PayslipStage = "truoc_thue" | "sau_thue";

export interface PayslipListItem {
  id: string;
  code: string;
  name: string | null;
  ky_luong: string;
  stage: PayslipStage;
  review_status: "none" | "requested";
  confirm_status: "none" | "confirmed";
  reviewed_at: string | null;
  confirmed_at: string | null;
  received_at: string;
  updated_at: string;
}

export interface PayslipDetail extends PayslipListItem {
  phieu: Record<string, unknown>;
}
