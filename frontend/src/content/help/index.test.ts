import { describe, it, expect } from "vitest";
import { listHelpModules, getHelpModule, getHelpTopic, hasHelpModule } from "./index";

describe("content/help/index.ts", () => {
  it("discovers modules from the file tree", () => {
    const modules = listHelpModules();
    const slugs = modules.map((m) => m.slug);
    expect(slugs).toContain("paymentRequests");
    expect(slugs).toContain("reconciliation");
  });

  it("parses frontmatter title/order/audience correctly", () => {
    const topic = getHelpTopic("paymentRequests", "quan-ly-lan-thanh-toan");
    expect(topic).toBeDefined();
    expect(topic?.title).toBe("Cách tạo và quản lý lần TT (mọi trường hợp)");
    expect(topic?.order).toBe(2);
    expect(topic?.audience).toEqual(["sale", "ke-toan"]);
    expect(topic?.body).toContain("## Tạo lần thanh toán mới");
    // frontmatter fence (dòng "---" đứng riêng) phải bị strip khỏi body;
    // KHÔNG dùng toContain("---") vì cú pháp bảng markdown (|---|) cũng chứa "---".
    expect(topic?.body).not.toMatch(/^---$/m);
  });

  it("sorts topics within a module by order", () => {
    const mod = getHelpModule("paymentRequests");
    expect(mod).toBeDefined();
    const orders = mod!.topics.map((t) => t.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("hasHelpModule reflects presence in the tree", () => {
    expect(hasHelpModule("paymentRequests")).toBe(true);
    expect(hasHelpModule("this-module-does-not-exist")).toBe(false);
  });

  it("getHelpTopic returns undefined for unknown slugs", () => {
    expect(getHelpTopic("paymentRequests", "does-not-exist")).toBeUndefined();
    expect(getHelpTopic("does-not-exist", "does-not-exist")).toBeUndefined();
  });
});
