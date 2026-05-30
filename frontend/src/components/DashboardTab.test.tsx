import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import DashboardTab from "./DashboardTab";
import { server } from "../test/msw/server";

describe("DashboardTab", () => {
  it("renders dashboard sections from the gamification API contract", async () => {
    server.use(
      http.get("http://localhost:8000/api/v1/dashboard/summary", () =>
        HttpResponse.json({
          top_today: [
            { id: "1", name: "Trần Mỹ Linh", revenue: 86_000_000 },
            { id: "2", name: "Phạm Quốc Anh", revenue: 72_500_000 },
          ],
          top_month: [
            { id: "1", name: "Đặng Hoàng Sơn", revenue: 320_000_000 },
            { id: "2", name: "Trần Mỹ Linh", revenue: 280_000_000 },
          ],
          tasks: [
            {
              id: "task-1",
              title: "Team đạt 100% KPI",
              description: "Toàn team chạm mốc KPI tháng",
              reward: "+1.000.000đ",
            },
          ],
          events: [
            {
              id: "event-1",
              title: "Team Building Tháng 6",
              date: "2026-06-15",
              description: "Hoạt động gắn kết team",
            },
          ],
          commission: { status: "coming_soon", amount: 0 },
          current_user: {
            rank: 2,
            name: "Trần Mỹ Linh",
            revenue: 280_000_000,
            total_sales: 168,
            next_rank_name: "Đặng Hoàng Sơn",
            next_rank_revenue: 320_000_000,
            gap: 40_000_000,
          },
        })
      ),
      http.get("http://localhost:8000/revenue/ledger", () =>
        HttpResponse.json({
          rows: [
            {
              id: "1",
              ngayTienVe: new Date().toISOString().slice(0, 10),
              saleCrmName: "Trần Mỹ Linh",
              team: "Cá Gánh Team",
              soTienVnd: 86_000_000,
            },
          ],
          count: 1,
          offset: 0,
          limit: 1000,
          hasMore: false,
        })
      )
    );

    render(<DashboardTab />);

    expect(screen.getByText("Đang phát triển")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("Trần Mỹ Linh").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("Vị trí của bạn")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText(/\/ 168 sales/)).toBeInTheDocument();
    expect(screen.getByText(/để vượt Đặng Hoàng Sơn/)).toBeInTheDocument();
    expect(screen.getByText("Team đạt 100% KPI")).toBeInTheDocument();
    expect(screen.getByText("Team Building Tháng 6")).toBeInTheDocument();
    expect(screen.getAllByText("86 tr").length).toBeGreaterThan(0);
  });
});
