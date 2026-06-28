import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useProvinceWardSelect } from "./VietnamAddressFields";

describe("useProvinceWardSelect (static data)", () => {
  it("returns all 34 provinces immediately, no loading state", () => {
    const { result } = renderHook(() => useProvinceWardSelect(""));
    expect(result.current.provinces.length).toBe(34);
    expect(result.current.loadingWards).toBe(false);
    expect(result.current.wards).toEqual([]);
  });

  it("returns wards instantly when province selected", () => {
    const hn = "Thành phố Hà Nội";
    const { result } = renderHook(() => useProvinceWardSelect(hn));
    expect(result.current.wards.length).toBeGreaterThan(50);
    expect(result.current.loadingWards).toBe(false);
  });

  it("returns empty wards for unknown province (legacy values preserved by Combobox)", () => {
    const { result } = renderHook(() => useProvinceWardSelect("Tỉnh Hà Tây"));
    expect(result.current.wards).toEqual([]);
    expect(result.current.loadingWards).toBe(false);
  });

  it("does NOT fire any network request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderHook(() => useProvinceWardSelect("Thành phố Hà Nội"));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
