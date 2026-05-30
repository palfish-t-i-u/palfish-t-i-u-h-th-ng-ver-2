import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import DashboardTab from "./DashboardTab";
import { server } from "../test/msw/server";

describe("DashboardTab", () => {
  it("renders dashboard sections and revenue ranking from ledger data", async () => {
    server.use(
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
    expect(screen.getByText("Bảng nhiệm vụ & thưởng tuần")).toBeInTheDocument();
    expect(screen.getByText("Bảng sự kiện nội bộ")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("Trần Mỹ Linh").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("86 tr").length).toBeGreaterThan(0);
  });
});
