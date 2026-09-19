import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseDocument,
  parseEntry,
  splitEntries,
  splitReferenceList,
} from "../src/lib/citations/parse.ts";

/**
 * The parser decides what the whole feature reports, so these tests pin both
 * directions: what it must find, and what it must leave alone. A false positive
 * here sends a user hunting for a problem that does not exist.
 */

describe("splitReferenceList", () => {
  it("separates the list from the prose", () => {
    const { body, listHeading, listText } = splitReferenceList(
      "The argument runs as follows.\n\nReferences\n\nOkonkwo, A. (2021). A paper.",
    );

    assert.equal(listHeading, "References");
    assert.equal(body, "The argument runs as follows.");
    assert.ok(listText.startsWith("Okonkwo"));
  });

  it("accepts every style's heading", () => {
    for (const heading of ["Works Cited", "Bibliography", "Reference List"]) {
      const { listHeading } = splitReferenceList(`Body.\n\n${heading}\n\nSmith, J. (2020). X.`);
      assert.equal(listHeading, heading);
    }
  });

  it("takes the last heading, so a table of contents does not win", () => {
    const { body } = splitReferenceList(
      "Contents\n\nReferences\n\nIntroduction\n\nThe body of the essay.\n\nReferences\n\nSmith, J. (2020). X.",
    );
    assert.ok(body.includes("The body of the essay."));
  });

  it("reports no list when the document has none", () => {
    const { listHeading, listText, body } = splitReferenceList("Just prose here.");
    assert.equal(listHeading, null);
    assert.equal(listText, "");
    assert.equal(body, "Just prose here.");
  });
});

describe("splitEntries", () => {
  it("splits blank-line separated entries", () => {
    const entries = splitEntries(
      "Okonkwo, A. (2021). One. Journal, 1(1), 1-2.\n\nSilva, M. (2019). Two. Journal, 2(1), 3-4.",
    );
    assert.equal(entries.length, 2);
  });

  it("rejoins a hanging-indent entry that wrapped across lines", () => {
    const entries = splitEntries(
      [
        "Okonkwo, A., & Silva, M. (2021). Working memory under load.",
        "    Journal of Cognitive Science, 44(2), 113-129.",
        "Silva, M. (2019). Attention and recall. Memory Studies, 12(1), 3-4.",
      ].join("\n"),
    );

    assert.equal(entries.length, 2);
    assert.ok(entries[0]!.includes("Journal of Cognitive Science"));
    assert.ok(entries[1]!.startsWith("Silva"));
  });

  it("returns nothing for an empty list", () => {
    assert.deepEqual(splitEntries("   \n  "), []);
  });
});

describe("parseEntry", () => {
  it("reads the surnames and the year from an APA entry", () => {
    const entry = parseEntry(
      "Okonkwo, A., & Silva, M. (2021). Working memory under load. Journal of Cognitive Science, 44(2), 113-129. https://doi.org/10.1000/x",
      0,
    );

    assert.deepEqual(entry.authors, ["okonkwo", "silva"]);
    assert.equal(entry.year, "2021");
    assert.equal(entry.hasLink, true);
  });

  it("reads an MLA entry, where the year sits later in the entry", () => {
    const entry = parseEntry(
      'Okonkwo, Amara, and Mateo Silva. "Working Memory under Load." Journal of Cognitive Science, vol. 44, no. 2, 2021, pp. 113-29.',
      1,
    );

    // MLA spells given names out, so "Amara" is indistinguishable from a
    // surname. Only the first author is a matching key, and it is right.
    assert.equal(entry.authors[0], "okonkwo");
    assert.ok(entry.authors.includes("silva"));
    assert.equal(entry.year, "2021");
    assert.equal(entry.hasLink, false);
  });

  it("strips a leading number from a numbered list", () => {
    const entry = parseEntry("[1] Okonkwo, A. (2021). A paper. Journal, 1(1), 1-2.", 0);
    assert.deepEqual(entry.authors, ["okonkwo"]);
  });
});

describe("parseDocument", () => {
  const DOC = [
    "Memory consolidates during sleep (Walker et al., 2007).",
    "Okonkwo and Silva (2021) found the same effect under load.",
    "A later replication disagreed (Silva, 2019; Tan & Mbeki, 2020).",
    "",
    "References",
    "",
    "Okonkwo, A., & Silva, M. (2021). Working memory under load. Journal, 44(2), 113-129.",
    "",
    "Walker, M. (2007). Sleep and memory. Neuron, 44(1), 1-10.",
  ].join("\n");

  it("finds every in-text citation exactly once", () => {
    const parsed = parseDocument(DOC);
    const raw = parsed.citations.map((citation) => citation.raw);

    assert.equal(parsed.citations.length, 4, raw.join(" | "));
    assert.ok(raw.some((value) => value.includes("Walker")));
    assert.ok(raw.some((value) => value.includes("Okonkwo and Silva")));
    assert.ok(raw.some((value) => value.includes("Silva, 2019")));
    assert.ok(raw.some((value) => value.includes("Tan")));
  });

  it("prefers the narrative reading over the bare year inside it", () => {
    const parsed = parseDocument("Okonkwo and Silva (2021) found the effect.");
    assert.equal(parsed.citations.length, 1);
    assert.equal(parsed.citations[0]!.kind, "narrative");
    assert.deepEqual(parsed.citations[0]!.authors, ["okonkwo", "silva"]);
  });

  it("splits a multi-work bracket into separate citations", () => {
    const parsed = parseDocument("Two studies agree (Silva, 2019; Tan & Mbeki, 2020).");
    assert.equal(parsed.citations.length, 2);
    assert.equal(parsed.citations[0]!.year, "2019");
    assert.equal(parsed.citations[1]!.year, "2020");
  });

  it("records et al. without treating it as a surname", () => {
    const parsed = parseDocument("Sleep matters (Walker et al., 2007).");
    assert.equal(parsed.citations[0]!.etAl, true);
    assert.deepEqual(parsed.citations[0]!.authors, ["walker"]);
  });

  it("reads an MLA citation that carries a page instead of a year", () => {
    const parsed = parseDocument("The narrator says otherwise (Okonkwo and Silva 118).");
    assert.equal(parsed.citations.length, 1);
    assert.deepEqual(parsed.citations[0]!.authors, ["okonkwo", "silva"]);
    assert.equal(parsed.citations[0]!.year, null);
  });

  it("leaves cross-references alone", () => {
    for (const aside of [
      "The results are shown in (Table 2).",
      "See the diagram (Figure 3).",
      "The effect was significant (p < 0.05).",
      "Participants were recruited locally (n = 240).",
    ]) {
      assert.deepEqual(parseDocument(aside).citations, [], aside);
    }
  });

  it("drops the introductory words from a citation", () => {
    const parsed = parseDocument("Others disagree (see Okonkwo, 2021).");
    assert.equal(parsed.citations.length, 1);
    assert.deepEqual(parsed.citations[0]!.authors, ["okonkwo"]);
  });

  it("finds numbered citations, which none of the supported styles use", () => {
    const parsed = parseDocument("This has been shown repeatedly [12].");
    assert.equal(parsed.citations.length, 1);
    assert.equal(parsed.citations[0]!.kind, "numeric");
  });

  it("does not look for citations inside the reference list", () => {
    const parsed = parseDocument(DOC);
    assert.ok(!parsed.body.includes("Neuron"));
    assert.equal(parsed.entries.length, 2);
  });
});
