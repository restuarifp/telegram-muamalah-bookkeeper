import { describe, expect, it, vi } from "vitest";

/**
 * Path contoh, bukan folder milik siapa pun: test ini mem-mock config, jadi
 * lokasi penyimpanan yang sebenarnya (NEXTCLOUD_BASE_DIR di .env) tidak boleh
 * ikut bocor ke sini. Spasi di dalamnya sengaja dipertahankan — justru itu yang
 * diuji oleh encodePath. vi.hoisted dipakai supaya satu nilai ini juga bisa
 * dilihat dari dalam factory vi.mock yang di-hoist ke atas berkas.
 */
const { BASE, BASE_ENC } = vi.hoisted(() => ({
  BASE: "/Documents/Akad Muamalah",
  BASE_ENC: "/Documents/Akad%20Muamalah",
}));

vi.mock("../config.js", () => ({
  config: {
    nextcloud: {
      baseUrl: "https://nc.example.com",
      username: "admin",
      password: "rahasia",
      baseDir: BASE,
      templateDir: `${BASE}/Template Akad`,
      folderJenis: { QARDH: "Qardh" },
    },
  },
}));

const {
  encodePath,
  normalisasiPath,
  amankanNamaBerkas,
  urlUnduh,
  daftarBerkas,
  resolveTautanNextcloud,
  TautanTidakValidError,
} = await import("./nextcloud.js");

describe("encodePath", () => {
  it("meng-encode tiap segmen tanpa merusak pemisah path", () => {
    expect(encodePath("/Documents/Akad Muamalah/Template Akad")).toBe(
      "Documents/Akad%20Muamalah/Template%20Akad"
    );
  });

  it("membiarkan '/' sebagai pemisah, bukan %2F", () => {
    expect(encodePath("/a/b/c")).not.toContain("%2F");
  });

  it("meng-encode karakter yang bermakna khusus di URL", () => {
    expect(encodePath("/Akad/[DRAFT] 001-AQ.docx")).toBe("Akad/%5BDRAFT%5D%20001-AQ.docx");
  });
});

describe("normalisasiPath", () => {
  it("selalu mengawali dengan satu garis miring", () => {
    expect(normalisasiPath("Documents/Akad")).toBe("/Documents/Akad");
    expect(normalisasiPath("//Documents//Akad//")).toBe("/Documents/Akad");
  });

  it("membuang segmen '..' agar path tidak bisa keluar dari folder tujuan", () => {
    expect(normalisasiPath("/Documents/../../etc/passwd")).toBe("/Documents/etc/passwd");
  });
});

describe("amankanNamaBerkas", () => {
  it("mengganti karakter yang ditolak WebDAV/Windows", () => {
    expect(amankanNamaBerkas('akad/qardh:v2?.pdf')).toBe("akad-qardh-v2-.pdf");
  });

  it("memberi nama pengganti bila hasilnya kosong", () => {
    expect(amankanNamaBerkas("///")).toMatch(/^dokumen-\d+$/);
  });

  it("memangkas nama yang kelewat panjang", () => {
    expect(amankanNamaBerkas("a".repeat(300)).length).toBe(120);
  });
});

describe("urlUnduh", () => {
  it("menempelkan /download pada link berbagi", () => {
    expect(urlUnduh("https://nc.example.com/s/abc123")).toBe(
      "https://nc.example.com/s/abc123/download"
    );
  });

  it("tidak menghasilkan garis miring dobel", () => {
    expect(urlUnduh("https://nc.example.com/s/abc123/")).toBe(
      "https://nc.example.com/s/abc123/download"
    );
  });
});

const MULTISTATUS = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
  <d:response>
    <d:href>/remote.php/dav/files/admin${BASE_ENC}/Qardh/</d:href>
    <d:propstat>
      <d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/admin${BASE_ENC}/Qardh/sub/</d:href>
    <d:propstat>
      <d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/admin${BASE_ENC}/Qardh/%5BDRAFT%5D%20001-AQ.pdf</d:href>
    <d:propstat>
      <d:prop>
        <d:getcontenttype>application/pdf</d:getcontenttype>
        <d:getcontentlength>18149</d:getcontentlength>
        <d:getlastmodified>Sun, 16 Aug 2026 13:55:15 GMT</d:getlastmodified>
        <d:resourcetype/>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
    <d:propstat>
      <d:prop><oc:tidak-ada/></d:prop>
      <d:status>HTTP/1.1 404 Not Found</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`;

describe("daftarBerkas", () => {
  it("mengurai PROPFIND jadi berkas saja, tanpa folder itu sendiri maupun subfolder", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(MULTISTATUS, { status: 207 }))
    );

    const hasil = await daftarBerkas(`${BASE}/Qardh`);

    expect(hasil).toHaveLength(1);
    expect(hasil[0]).toMatchObject({
      // href yang ter-encode harus kembali jadi path apa adanya, siap dipakai ulang.
      path: `${BASE}/Qardh/[DRAFT] 001-AQ.pdf`,
      nama: "[DRAFT] 001-AQ.pdf",
      ukuran: 18149,
      mimeType: "application/pdf",
    });
    expect(hasil[0].diubahPada?.toISOString()).toBe("2026-08-16T13:55:15.000Z");
    vi.unstubAllGlobals();
  });

  it("menganggap folder yang belum ada sebagai folder kosong", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    await expect(daftarBerkas("/belum/ada")).resolves.toEqual([]);
    vi.unstubAllGlobals();
  });
});

/** Balasan multistatus untuk satu berkas, dipakai memalsukan PROPFIND & SEARCH. */
function satuBerkas(pathEnc: string) {
  return `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
  <d:response>
    <d:href>/remote.php/dav/files/admin${pathEnc}</d:href>
    <d:propstat>
      <d:prop>
        <d:getcontenttype>application/pdf</d:getcontenttype>
        <d:getcontentlength>2048</d:getcontentlength>
        <d:resourcetype/>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`;
}

describe("resolveTautanNextcloud", () => {
  const BERKAS_ENC = `${BASE_ENC}/Template%20Akad/Akad%20Qardh.pdf`;
  const BERKAS = `${BASE}/Template Akad/Akad Qardh.pdf`;

  /** Mencatat tiap permintaan agar bisa diperiksa jalur mana yang dipakai. */
  function stubFetch(handler: (url: string, init: any) => Response) {
    const spy = vi.fn(async (url: any, init: any) => handler(String(url), init));
    vi.stubGlobal("fetch", spy);
    return spy;
  }

  it("menerjemahkan tautan web Files lewat fileid", async () => {
    const spy = stubFetch(() => new Response(satuBerkas(BERKAS_ENC), { status: 207 }));

    const hasil = await resolveTautanNextcloud(
      "https://nc.example.com/apps/files/files/483?dir=/Documents/Akad%20Muamalah"
    );

    expect(hasil.path).toBe(BERKAS);
    expect(hasil.nama).toBe("Akad Qardh.pdf");
    // fileid diterjemahkan lewat DAV SEARCH, bukan ditebak dari parameter dir.
    expect(spy.mock.calls[0][1].method).toBe("SEARCH");
    expect(String(spy.mock.calls[0][1].body)).toContain("<d:literal>483</d:literal>");
    vi.unstubAllGlobals();
  });

  it("menerjemahkan permalink /f/<id>", async () => {
    stubFetch(() => new Response(satuBerkas(BERKAS_ENC), { status: 207 }));
    await expect(resolveTautanNextcloud("https://nc.example.com/f/483")).resolves.toMatchObject({
      path: BERKAS,
    });
    vi.unstubAllGlobals();
  });

  it("menerjemahkan URL WebDAV langsung tanpa perlu SEARCH", async () => {
    const spy = stubFetch(() => new Response(satuBerkas(BERKAS_ENC), { status: 207 }));

    const hasil = await resolveTautanNextcloud(
      `https://nc.example.com/remote.php/dav/files/admin${BERKAS_ENC}`
    );

    expect(hasil.path).toBe(BERKAS);
    expect(spy.mock.calls[0][1].method).toBe("PROPFIND");
    vi.unstubAllGlobals();
  });

  it("menerjemahkan link berbagi lewat daftar share", async () => {
    stubFetch((url) =>
      url.includes("/ocs/")
        ? new Response(
            JSON.stringify({
              ocs: {
                meta: { statuscode: 200, message: "OK" },
                data: [{ id: "1", share_type: 3, token: "tok123", url: "x", path: BERKAS }],
              },
            }),
            { status: 200 }
          )
        : new Response(satuBerkas(BERKAS_ENC), { status: 207 })
    );

    await expect(
      resolveTautanNextcloud("https://nc.example.com/s/tok123")
    ).resolves.toMatchObject({ path: BERKAS });
    vi.unstubAllGlobals();
  });

  it("menerima path mentah", async () => {
    stubFetch(() => new Response(satuBerkas(BERKAS_ENC), { status: 207 }));
    await expect(resolveTautanNextcloud(BERKAS)).resolves.toMatchObject({ path: BERKAS });
    vi.unstubAllGlobals();
  });

  it("menolak tautan dari server lain sebelum menyentuh jaringan", async () => {
    const spy = stubFetch(() => new Response("", { status: 200 }));

    await expect(
      resolveTautanNextcloud("https://drive.google.com/file/d/123/view")
    ).rejects.toThrow(TautanTidakValidError);
    // Penting: ditolak tanpa request, bukan setelah gagal mengambil.
    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("menolak tautan Nextcloud yang tidak memuat penunjuk berkas", async () => {
    await expect(resolveTautanNextcloud("https://nc.example.com/apps/dashboard")).rejects.toThrow(
      /tidak memuat penunjuk berkas/i
    );
  });

  it("menolak teks yang bukan tautan maupun path", async () => {
    await expect(resolveTautanNextcloud("akad qardh")).rejects.toThrow(TautanTidakValidError);
    await expect(resolveTautanNextcloud("   ")).rejects.toThrow(/kosong/i);
  });

  it("menolak fileid yang tidak ketemu, dengan pesan yang bisa ditindaklanjuti", async () => {
    stubFetch(
      () =>
        new Response(
          `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"></d:multistatus>`,
          { status: 207 }
        )
    );
    await expect(resolveTautanNextcloud("https://nc.example.com/f/999")).rejects.toThrow(
      /id 999/
    );
    vi.unstubAllGlobals();
  });
});
