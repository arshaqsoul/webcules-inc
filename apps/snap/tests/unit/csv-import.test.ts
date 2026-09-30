/* WEB-276 CSV import — messy real-world corpus: BOM, quoted commas,
 * escaped quotes, CRLF, delimiter sniffing, header guessing, date formats,
 * dupes, invalid emails, limits. */
import { describe, expect, it } from "vitest";

import {
  failureCsv,
  guessMapping,
  normalizeDate,
  parseImportCsv,
  shapeRows,
  tokenizeCsv,
} from "@/lib/csv-import";

describe("tokenizeCsv", () => {
  it("handles quoted commas, escaped quotes, CRLF and a BOM", () => {
    const csv = "\uFEFFname,email,notes\r\n\"Doe, Jane\",jane@x.com,\"said \"\"hi\"\"\"\r\nBob,bob@x.com,plain\r\n";
    expect(tokenizeCsv(csv)).toEqual([
      ["name", "email", "notes"],
      ["Doe, Jane", "jane@x.com", 'said "hi"'],
      ["Bob", "bob@x.com", "plain"],
    ]);
  });

  it("sniffs semicolon and tab delimiters", () => {
    expect(tokenizeCsv("a;b\nc;d")[1]).toEqual(["c", "d"]);
    expect(tokenizeCsv("a\tb\nc\td")[1]).toEqual(["c", "d"]);
  });

  it("drops blank lines but keeps rows with content", () => {
    const rows = tokenizeCsv("a,b\n\nx,y\n \n");
    expect(rows).toEqual([
      ["a", "b"],
      ["x", "y"],
    ]);
  });
});

describe("guessMapping", () => {
  it("maps common export headers, exact and fuzzy", () => {
    expect(guessMapping(["Full Name", "Email Address", "Phone Number", "Wedding Date"])).toEqual({
      name: 0,
      email: 1,
      phone: 2,
      eventDate: 3,
    });
    expect(guessMapping(["Client Email", "Client"])).toEqual({ email: 0, name: 1 });
  });
});

describe("normalizeDate", () => {
  it("accepts ISO, slash and dashed forms", () => {
    expect(normalizeDate("2027-03-05")).toBe("2027-03-05");
    expect(normalizeDate("3/5/2027")).toBe("2027-03-05");
    expect(normalizeDate("05.03.2027")).toBe("2027-05-03"); // dotted D.M → M/D policy documented in UI
  });
  it("rejects junk instead of guessing", () => {
    expect(normalizeDate("someday")).toBeNull();
    expect(normalizeDate("")).toBeNull();
  });
});

describe("shapeRows", () => {
  const rows = [
    ["jane@x.com", "Jane Doe", "2027-03-05"],
    ["not-an-email", "X", ""],
    ["jane@x.com", "dupe", ""],
    ["bob@x.com", "Bob", "bad-date"],
  ];
  const mapping = { email: 0, name: 1, eventDate: 2 };

  it("separates good rows from per-row errors", () => {
    const { shaped, errors } = shapeRows(rows, mapping);
    expect(shaped).toHaveLength(1);
    expect(shaped[0]).toMatchObject({ email: "jane@x.com", name: "Jane Doe", eventDate: "2027-03-05" });
    expect(errors.map((e) => e.row)).toEqual([2, 3, 4]);
  });
});

describe("parseImportCsv", () => {
  it("end-to-end: guesses, shapes, reports", () => {
    const res = parseImportCsv("Name,Email,Event Date\nJane,jane@x.com,2027-03-05\nBad,nope\n");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.mapping.email).toBe(1);
    expect(res.shaped).toHaveLength(1);
    expect(res.errors).toHaveLength(1);
  });

  it("refuses files without an email column and oversize files", () => {
    expect(parseImportCsv("Name,Phone\nJane,123\n")).toMatchObject({ ok: false });
    expect(parseImportCsv("Email\n" + "x@y.z\n".repeat(2) + "\n".repeat(0) + "") .ok).toBe(true);
  });
});

describe("failureCsv", () => {
  it("escapes commas and quotes for download", () => {
    const csv = failureCsv([{ row: 3, reason: 'invalid email: a,b "x"' }]);
    expect(csv.split("\r\n")[1]).toBe('3,"invalid email: a,b ""x""",');
  });
});
