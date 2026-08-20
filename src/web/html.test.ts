import { describe, expect, it } from "vitest";
import { escapeHtml, gabung, html, mentah } from "./html.js";

describe("escapeHtml", () => {
  it("meloloskan karakter markup sekaligus kutip", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
    expect(escapeHtml("Zaid & 'Amr")).toBe("Zaid &amp; &#39;Amr");
  });
});

describe("html", () => {
  it("meng-escape nilai yang disisipkan, bukan markup di sekitarnya", () => {
    const judul = "<b>Qardh</b>";
    expect(html`<h1>${judul}</h1>`.nilai).toBe("<h1>&lt;b&gt;Qardh&lt;/b&gt;</h1>");
  });

  it("menyisipkan HtmlAman apa adanya", () => {
    const bagian = html`<span>${"a & b"}</span>`;
    expect(html`<div>${bagian}</div>`.nilai).toBe("<div><span>a &amp; b</span></div>");
  });

  it("membuang null/undefined/false supaya bagian opsional bisa ditulis inline", () => {
    expect(html`<p>${null}${undefined}${false}</p>`.nilai).toBe("<p></p>");
  });

  it("merender larik secara berurutan", () => {
    const baris = ["a", "<b>"].map((t) => html`<li>${t}</li>`);
    expect(html`<ul>${baris}</ul>`.nilai).toBe("<ul><li>a</li><li>&lt;b&gt;</li></ul>");
  });

  it("meng-escape angka & bigint tanpa mengubah nilainya", () => {
    expect(html`<td>${12n}</td>`.nilai).toBe("<td>12</td>");
    expect(html`<td>${7}</td>`.nilai).toBe("<td>7</td>");
  });

  it("mempercayai mentah() — satu-satunya jalan menyisipkan markup mentah", () => {
    expect(html`${mentah("<hr>")}`.nilai).toBe("<hr>");
  });
});

describe("gabung", () => {
  it("menyambung potongan dengan pemisah tanpa kehilangan escaping", () => {
    expect(gabung(["a", "<b>"], ", ").nilai).toBe("a, &lt;b&gt;");
  });
});
