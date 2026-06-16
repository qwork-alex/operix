function pdfEscapeText(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r/g, "")
    .replace(/\n/g, "\\n");
}

function toAscii(str: string) {
  return Buffer.from(str, "binary");
}

export function buildSimplePdf(params: {
  title: string;
  lines: string[];
  meta?: { author?: string; subject?: string };
}) {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const marginLeft = 48;
  const marginTop = 56;
  const fontSizeTitle = 16;
  const fontSizeBody = 11;
  const lineHeight = 14;

  const contentLines: string[] = [];
  contentLines.push("BT");
  contentLines.push("/F1 " + fontSizeTitle + " Tf");
  contentLines.push(`${marginLeft} ${pageHeight - marginTop} Td`);
  contentLines.push(`(${pdfEscapeText(params.title)}) Tj`);
  contentLines.push("0 -22 Td");
  contentLines.push("/F1 " + fontSizeBody + " Tf");
  for (const raw of params.lines) {
    const t = raw == null ? "" : String(raw);
    const safe = pdfEscapeText(t).slice(0, 240);
    contentLines.push(`(${safe}) Tj`);
    contentLines.push(`0 -${lineHeight} Td`);
  }
  contentLines.push("ET");
  const contentStream = contentLines.join("\n");

  const parts: string[] = [];
  let offset = 0;
  const objOffsets: number[] = [0];

  const push = (chunk: string, objIndex?: number) => {
    if (typeof objIndex === "number") objOffsets[objIndex] = offset;
    parts.push(chunk);
    offset += Buffer.byteLength(chunk, "utf8");
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n", 1);
  push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n", 2);
  push(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " +
      pageWidth +
      " " +
      pageHeight +
      "] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    3,
  );
  push("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n", 4);
  push(
    "5 0 obj\n<< /Length " +
      Buffer.byteLength(contentStream, "utf8") +
      " >>\nstream\n" +
      contentStream +
      "\nendstream\nendobj\n",
    5,
  );

  const xrefOffset = offset;
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i += 1) {
    xref += String(objOffsets[i]).padStart(10, "0") + " 00000 n \n";
  }
  const trailer = "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF\n";

  return Buffer.concat([Buffer.from(parts.join(""), "utf8"), Buffer.from(xref, "utf8"), Buffer.from(trailer, "utf8")]);
}
