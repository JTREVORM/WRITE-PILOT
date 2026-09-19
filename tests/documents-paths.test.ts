import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDocumentPath,
  isOwnedPath,
  safeFilename,
} from "../src/lib/documents/paths.ts";

const USER = "11111111-1111-1111-1111-111111111111";
const DOC = "22222222-2222-2222-2222-222222222222";

/**
 * The object path is the access control, not a naming convention: the storage
 * policies match on its second segment. A filename that escapes its folder
 * would be one user reading another's files.
 */

describe("safeFilename", () => {
  it("keeps an ordinary name intact", () => {
    assert.equal(safeFilename("Essay Draft 2.docx"), "Essay-Draft-2.docx");
  });

  it("strips a traversal attempt down to its last segment", () => {
    assert.equal(safeFilename("../../etc/passwd"), "passwd");
    assert.equal(safeFilename("..\\..\\windows\\system32"), "system32");
  });

  it("removes separators wherever they appear", () => {
    assert.ok(!safeFilename("a/b/c.txt").includes("/"));
    assert.ok(!safeFilename("a\\b\\c.txt").includes("\\"));
  });

  it("removes control characters", () => {
    assert.equal(safeFilename("essay\u0000\u001f.txt"), "essay.txt");
  });

  it("never returns an empty name", () => {
    assert.equal(safeFilename(""), "document");
    assert.equal(safeFilename("..."), "document");
    assert.equal(safeFilename(null), "document");
  });

  it("truncates a long name but keeps its extension", () => {
    const name = `${"a".repeat(400)}.docx`;
    const result = safeFilename(name);

    assert.ok(result.length <= 120);
    assert.ok(result.endsWith(".docx"));
  });

  it("does not invent an extension when there is none to keep", () => {
    const result = safeFilename("b".repeat(400));
    assert.equal(result.length, 120);
    assert.ok(!result.includes("."));
  });
});

describe("buildDocumentPath", () => {
  it("puts the file under the owner's own folder", () => {
    assert.equal(
      buildDocumentPath({ userId: USER, documentId: DOC, filename: "essay.pdf" }),
      `users/${USER}/documents/${DOC}/essay.pdf`,
    );
  });

  it("cannot be walked out of by a hostile filename", () => {
    const path = buildDocumentPath({
      userId: USER,
      documentId: DOC,
      filename: "../../../other-user/secret.pdf",
    });

    assert.equal(path, `users/${USER}/documents/${DOC}/secret.pdf`);
    assert.ok(isOwnedPath(path, USER));
  });
});

describe("isOwnedPath", () => {
  it("accepts a path in the user's own folder", () => {
    assert.equal(isOwnedPath(`users/${USER}/documents/${DOC}/a.pdf`, USER), true);
  });

  it("rejects another user's folder", () => {
    assert.equal(isOwnedPath(`users/${DOC}/documents/${DOC}/a.pdf`, USER), false);
  });

  it("rejects traversal, an empty path and a bare prefix", () => {
    assert.equal(isOwnedPath(`users/${USER}/documents/../../x`, USER), false);
    assert.equal(isOwnedPath("", USER), false);
    assert.equal(isOwnedPath(`users/${USER}`, USER), false);
  });

  it("rejects a path in another bucket's shape", () => {
    assert.equal(isOwnedPath(`public/${USER}/documents/x/a.pdf`, USER), false);
  });
});
