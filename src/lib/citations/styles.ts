/**
 * The citation styles WritePilot checks against.
 *
 * Each style carries three things that must never drift apart: the label a user
 * picks in the interface, the heading its reference list is normally given, and
 * the rules the model is asked to check. Keeping them in one record means the
 * prompt cannot describe APA while the screen says Harvard.
 *
 * The rules are deliberately the *checkable* ones. Real style manuals run to
 * hundreds of pages, and a checker that pretends to enforce all of them from
 * plain text would be lying — italics, hanging indents and small caps do not
 * survive text extraction at all. What is here is what can be judged from the
 * characters on the page.
 */

export type CitationStyleKey = "apa7" | "mla9" | "chicago" | "harvard";

export interface CitationStyle {
  key: CitationStyleKey;
  label: string;
  /** One line, shown beside the style in the picker. */
  description: string;
  /** What this style calls its reference list. */
  listHeading: string;
  /** Headings accepted when finding the list in a document, lowercased. */
  headingAliases: readonly string[];
  /** The shape of an in-text citation, for the interface and the prompt. */
  inTextExample: string;
  /** A correctly formatted journal article entry, used as the model's anchor. */
  referenceExample: string;
  /** Style-specific rules the model is asked to apply. */
  rules: readonly string[];
}

export const CITATION_STYLES: readonly CitationStyle[] = [
  {
    key: "apa7",
    label: "APA 7",
    description: "Psychology, education, and most social sciences.",
    listHeading: "References",
    headingAliases: ["references", "reference list"],
    inTextExample: "(Okonkwo & Silva, 2021)",
    referenceExample:
      "Okonkwo, A., & Silva, M. (2021). Working memory under load. " +
      "Journal of Cognitive Science, 44(2), 113–129. https://doi.org/10.1000/jcs.2021.44",
    rules: [
      "Author entries are surname first, then initials with full stops: Okonkwo, A.",
      "Use an ampersand before the final author, not the word 'and'.",
      "The year goes in parentheses directly after the authors.",
      "Only the first word of an article title, and proper nouns, are capitalised.",
      "Journal titles keep headline capitalisation; the volume is followed by the issue in parentheses.",
      "A DOI is given as a full https://doi.org/ link when the source has one.",
      "Three or more authors are cited in text as the first author followed by 'et al.'",
    ],
  },
  {
    key: "mla9",
    label: "MLA 9",
    description: "Literature, languages and the humanities.",
    listHeading: "Works Cited",
    headingAliases: ["works cited", "work cited"],
    inTextExample: "(Okonkwo and Silva 118)",
    referenceExample:
      "Okonkwo, Amara, and Mateo Silva. \"Working Memory under Load.\" " +
      "Journal of Cognitive Science, vol. 44, no. 2, 2021, pp. 113–29.",
    rules: [
      "Author names are given in full, not as initials; only the first author is inverted.",
      "Two authors are joined by 'and'; three or more use the first author followed by 'et al.'",
      "Article titles are in quotation marks with headline capitalisation.",
      "Volume and issue are spelled as 'vol.' and 'no.', and the page range as 'pp.'",
      "The year sits inside the container information, not directly after the author.",
      "In-text citations give the author and a page number, with no comma between them, and no year.",
    ],
  },
  {
    key: "chicago",
    label: "Chicago (author–date)",
    description: "History, business and the author–date sciences.",
    listHeading: "References",
    headingAliases: ["references", "bibliography", "works cited"],
    inTextExample: "(Okonkwo and Silva 2021, 118)",
    referenceExample:
      "Okonkwo, Amara, and Mateo Silva. 2021. \"Working Memory under Load.\" " +
      "Journal of Cognitive Science 44 (2): 113–29.",
    rules: [
      "Author names are given in full; only the first author is inverted.",
      "The year follows the author block as a bare number with a full stop, not in parentheses.",
      "Article titles are in quotation marks with headline capitalisation.",
      "The issue number goes in parentheses after the volume, followed by a colon and the page range.",
      "In-text citations give author, year, then the page after a comma.",
    ],
  },
  {
    key: "harvard",
    label: "Harvard",
    description: "Widely used in UK and Australian institutions.",
    listHeading: "Reference List",
    headingAliases: ["reference list", "references", "bibliography"],
    inTextExample: "(Okonkwo and Silva, 2021)",
    referenceExample:
      "Okonkwo, A. and Silva, M. (2021) 'Working memory under load', " +
      "Journal of Cognitive Science, 44(2), pp. 113–129.",
    rules: [
      "Author entries are surname first, then initials; authors are joined by 'and'.",
      "The year goes in parentheses after the authors.",
      "Article titles are in single quotation marks with sentence capitalisation.",
      "The page range is introduced by 'pp.'",
      "Harvard is not a single manual — institutions vary, so only flag departures that every Harvard guide agrees on.",
    ],
  },
];

const BY_KEY = new Map(CITATION_STYLES.map((style) => [style.key, style]));

export function getCitationStyle(key: string): CitationStyle {
  return BY_KEY.get(key as CitationStyleKey) ?? CITATION_STYLES[0];
}

export function isCitationStyle(value: unknown): value is CitationStyleKey {
  return typeof value === "string" && BY_KEY.has(value as CitationStyleKey);
}

/** Every heading any style might give its list, for finding it in a document. */
export const ALL_LIST_HEADINGS: readonly string[] = [
  ...new Set(CITATION_STYLES.flatMap((style) => style.headingAliases)),
];

/**
 * The standing limits of this tool, shown wherever a result is.
 *
 * A citation checker that let a user believe it had verified their sources
 * would be actively dangerous: it reads the text it was given and nothing else.
 */
export const CITATION_LIMITS = [
  "This checks how citations are written, not whether the sources exist or say what you say they say.",
  "Formatting that depends on italics, indentation or small caps cannot be checked from extracted text.",
  "Institutions vary their house style. Where your department's guide differs, follow your department.",
] as const;
