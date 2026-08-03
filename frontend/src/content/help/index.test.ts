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
    const topic = getHelpTopic("paymentRequests", "tao-lan-tt-chuan");
    expect(topic).toBeDefined();
    expect(topic?.title).toBe("Tạo lần thanh toán (TT) chuẩn");
    expect(topic?.order).toBe(2);
    expect(topic?.audience).toEqual(["sale"]);
    expect(topic?.body).toContain("## Các bước");
    expect(topic?.body).not.toContain("---");
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
