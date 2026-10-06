import { describe, expect, it } from "vitest";
import { parseCsv } from "@/server/domain/csv";

describe("parseCsv", () => {
  it("handles quotes, embedded commas, escaped quotes, CRLF, blank lines and a BOM", () => {
    expect(parseCsv('﻿a,b,c\r\n"x, y","he said ""hi""",\r\n\r\nlast,row,3\n')).toEqual([
      ["a", "b", "c"], ["x, y", 'he said "hi"', ""], ["last", "row", "3"],
    ]);
  });
  it("keeps newlines inside quoted fields and rejects an unclosed quote", () => {
    expect(parseCsv('a\n"line1\nline2"')).toEqual([["a"], ["line1\nline2"]]);
    expect(() => parseCsv('a,"open')).toThrow(/Unclosed quote/);
  });
});
