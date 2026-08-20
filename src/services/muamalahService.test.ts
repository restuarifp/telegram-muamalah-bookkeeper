import { describe, it, expect } from "vitest";
import { hitungSisaSaldo } from "./muamalahService.js";

describe("hitungSisaSaldo", () => {
  it("mengurangi pokok dengan total angsuran", () => {
    const sisa = hitungSisaSaldo({ pokok: 1_000_000n }, [
      { jumlah: 300_000n },
      { jumlah: 200_000n },
    ]);
    expect(sisa).toBe(500_000n);
  });

  it("mengembalikan pokok penuh jika belum ada angsuran", () => {
    expect(hitungSisaSaldo({ pokok: 1_000_000n }, [])).toBe(1_000_000n);
  });

  it("tidak pernah negatif meski total angsuran melebihi pokok", () => {
    const sisa = hitungSisaSaldo({ pokok: 1_000_000n }, [
      { jumlah: 700_000n },
      { jumlah: 500_000n },
    ]);
    expect(sisa).toBe(0n);
  });

  it("mengembalikan nol saat angsuran pas sama dengan pokok", () => {
    const sisa = hitungSisaSaldo({ pokok: 1_000_000n }, [{ jumlah: 1_000_000n }]);
    expect(sisa).toBe(0n);
  });

  it("menghitung margin sebagai bagian dari kewajiban (murabahah)", () => {
    // Harga pokok 10jt + margin 2jt = harga jual 12jt.
    const akad = { pokok: 10_000_000n, margin: 2_000_000n };
    expect(hitungSisaSaldo(akad, [])).toBe(12_000_000n);
    expect(hitungSisaSaldo(akad, [{ jumlah: 5_000_000n }])).toBe(7_000_000n);
  });

  it("belum menganggap lunas saat pembayaran baru menutup harga pokoknya", () => {
    // Inti perbedaan murabahah: membayar sebesar pokok saja bukan pelunasan,
    // dan kalau ini keliru, catatAngsuran() akan menandai transaksi SELESAI
    // padahal marginnya belum dibayar.
    const sisa = hitungSisaSaldo({ pokok: 10_000_000n, margin: 2_000_000n }, [
      { jumlah: 10_000_000n },
    ]);
    expect(sisa).toBe(2_000_000n);
  });

  it("memperlakukan margin null sama dengan tanpa margin", () => {
    expect(hitungSisaSaldo({ pokok: 1_000_000n, margin: null }, [])).toBe(1_000_000n);
  });
});
