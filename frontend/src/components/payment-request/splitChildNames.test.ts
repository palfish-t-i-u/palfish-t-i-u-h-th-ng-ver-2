import { describe, it, expect } from "vitest";
import { splitChildNames } from "./paymentRequestUtils";

describe("splitChildNames", () => {
  it("tách các delimiter thường gặp → 2 tên", () => {
    for (const raw of [
      "Lê Bảo Châu - Lê Bảo Khánh",
      "Lê Bảo Châu & Lê Bảo Khánh",
      "Lê Bảo Châu và Lê Bảo Khánh",
      "Lê Bảo Châu VÀ Lê Bảo Khánh",
      "Lê Bảo Châu + Lê Bảo Khánh",
      "Lê Bảo Châu, Lê Bảo Khánh",
      "Lê Bảo Châu / Lê Bảo Khánh",
      "Lê Bảo Châu and Lê Bảo Khánh",
    ]) {
      expect(splitChildNames(raw)).toEqual(["Lê Bảo Châu", "Lê Bảo Khánh"]);
    }
  });
  it("1 tên không delimiter → giữ nguyên", () => {
    expect(splitChildNames("Kim Ji Yong")).toEqual(["Kim Ji Yong"]);
  });
  it("KHÔNG tách gạch nối dính (tên nước ngoài)", () => {
    expect(splitChildNames("Anne-Marie")).toEqual(["Anne-Marie"]);
  });
  it("tách slash cả khi dính lẫn có space", () => {
    expect(splitChildNames("Lê Bảo Châu/Lê Bảo Khánh")).toEqual(["Lê Bảo Châu", "Lê Bảo Khánh"]);
    expect(splitChildNames("Lê Bảo Châu / Lê Bảo Khánh")).toEqual(["Lê Bảo Châu", "Lê Bảo Khánh"]);
  });
  it("golden — 6 case THẬT trong DB production (2026-07-12)", () => {
    expect(splitChildNames("Lê Bảo Châu - Lê Bảo Khánh")).toEqual(["Lê Bảo Châu", "Lê Bảo Khánh"]);
    expect(splitChildNames("Đỗ Vũ Cát Tường & Đỗ Gia Huy")).toEqual(["Đỗ Vũ Cát Tường", "Đỗ Gia Huy"]);
    expect(splitChildNames("Bảo, Bối")).toEqual(["Bảo", "Bối"]);
    expect(splitChildNames("Bé Phúc Khang và Khôi Nguyên")).toEqual(["Bé Phúc Khang", "Khôi Nguyên"]);
    expect(splitChildNames("Nguyễn Bảo Nhi và Nguyễn Bảo Nguyên")).toEqual(["Nguyễn Bảo Nhi", "Nguyễn Bảo Nguyên"]);
    expect(splitChildNames("Võ Văn Bách và Võ Xuân Châm,")).toEqual(["Võ Văn Bách", "Võ Xuân Châm"]);
  });
  it("rỗng / null / khoảng trắng → []", () => {
    expect(splitChildNames("")).toEqual([]);
    expect(splitChildNames(null)).toEqual([]);
    expect(splitChildNames("   ")).toEqual([]);
  });
  it("bỏ phần rỗng, gộp space thừa, dedupe", () => {
    expect(splitChildNames("Châu -  ")).toEqual(["Châu"]);
    expect(splitChildNames("Châu  Bảo  -  Khánh")).toEqual(["Châu Bảo", "Khánh"]);
    expect(splitChildNames("Châu & Châu")).toEqual(["Châu"]);
  });
  it("mix delimiter", () => {
    expect(splitChildNames("A - B & C, D")).toEqual(["A", "B", "C", "D"]);
  });
  it("cap 6 tên", () => {
    expect(splitChildNames("a - b - c - d - e - f - g - h")).toHaveLength(6);
  });
});
