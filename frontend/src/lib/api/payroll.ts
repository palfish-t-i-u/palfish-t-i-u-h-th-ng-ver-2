import { api } from "../api";
import type { PayslipDetail, PayslipListItem } from "../../types/payroll";

export const listPayslips = async (kyLuong?: string): Promise<PayslipListItem[]> => {
  const res = await api.get("/api/payroll/payslips", {
    params: kyLuong ? { ky_luong: kyLuong } : {},
  });
  return res.data.payslips;
};

export const getPayslip = async (id: string): Promise<PayslipDetail> => {
  const res = await api.get(`/api/payroll/payslips/${id}`);
  return res.data.payslip;
};

export const confirmPayslip = async (id: string): Promise<PayslipListItem> => {
  const res = await api.patch(`/api/payroll/payslips/${id}/confirm`);
  return res.data.payslip;
};

export const requestReview = async (id: string): Promise<PayslipListItem> => {
  const res = await api.patch(`/api/payroll/payslips/${id}/review`);
  return res.data.payslip;
};
