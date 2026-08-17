import { describe, it, expect } from "vitest";
import { hitungSisaSaldo } from "./muamalahService.js";

describe("hitungSisaSaldo", () => {
  it("mengurangi pokok dengan total angsuran", () => {
    const sisa = hitungSisaSaldo(1_000_000n, [{ jumlah: 300_000n }, { jumlah: 200_000n }]);
    expect(sisa).toBe(500_000n);
  });

  it("mengembalikan pokok penuh jika belum ada angsuran", () => {
    expect(hitungSisaSaldo(1_000_000n, [])).toBe(1_000_000n);
  });

  it("tidak pernah negatif meski total angsuran melebihi pokok", () => {
    const sisa = hitungSisaSaldo(1_000_000n, [{ jumlah: 700_000n }, { jumlah: 500_000n }]);
    expect(sisa).toBe(0n);
  });

  it("mengembalikan nol saat angsuran pas sama dengan pokok", () => {
    const sisa = hitungSisaSaldo(1_000_000n, [{ jumlah: 1_000_000n }]);
    expect(sisa).toBe(0n);
  });
});
