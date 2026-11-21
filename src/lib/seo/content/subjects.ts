// src/lib/seo/content/subjects.ts
//
// Public subject landing pages (/icse-class-10/[subject]). One entry per
// subject BoardEdge can actually mark — seven, matching the corpus — never one
// per keyword variation. A subject is added here when its papers are imported,
// not before.
//
// Where the content comes from, so it can be kept true:
//   • `coverage` was counted against the live questions table on 2026-11-20
//     (questions.chapter, questions.is_subjective, questions.year); Economics
//     was added on 2026-11-22, and the other six rechecked then. Hardcoded,
//     like CORPUS on the landing page, so these pages stay static prerenders.
//     Recount when papers are imported.
//   • `markLeaks` restates, for students, the subject protocols the grader is
//     bound by (src/lib/prompts/examiner-prompt.ts). If a protocol changes,
//     change the matching leak here — the page must describe how BoardEdge
//     actually marks.
//   • Paper numbering is the ICSE Class 10 structure (Science Papers 1–3,
//     History, Civics & Geography Papers 1–2, English Paper 2, and Economics
//     as a Group II elective).
//
// No marking-scheme text or model answers ever appear on these pages: answer
// keys only reach a student after they have attempted the question.

export interface SubjectLeak {
  title: string;
  body: string;
}

export interface SubjectFaq {
  question: string;
  answer: string;
}

export interface SubjectPage {
  slug: string;
  /** Exactly as stored in public.subjects.name, used for /evaluate links. */
  name: string;
  paper: string;
  metaTitle: string;
  metaDescription: string;
  intro: string;
  coverage: {
    questions: number;
    written: number;
    years: number[];
    /** [chapter, questions], most-examined first. */
    chapters: [string, number][];
    /** For long tails (Literature): how many texts are folded into "others". */
    chapterNote?: string;
  };
  markLeaks: SubjectLeak[];
  faqs: SubjectFaq[];
  updated: string;
}

const UPDATED = "2026-11-20";

export const SUBJECT_PAGES: SubjectPage[] = [
  // ─── Physics ───────────────────────────────────────────────────────────────
  {
    slug: "physics",
    name: "Physics",
    paper: "Science Paper 1",
    metaTitle: "ICSE Class 10 Physics Past Papers With Marking Schemes",
    metaDescription:
      "375 ICSE Class 10 Physics past-paper questions (2018–2025) with official marking schemes. Write an answer and see which steps, units and conditions earn marks.",
    intro:
      "ICSE Physics marks are won and lost in the working. A numerical with the right final figure can still drop marks for a missing formula step or unit, and a definition can lose its mark for one missing condition. BoardEdge holds real Physics past-paper questions with the official CISCE scheme for each, and marks your answer step by step against it.",
    coverage: {
      questions: 375,
      written: 254,
      years: [2018, 2019, 2020, 2024, 2025],
      chapters: [
        ["Electricity & Magnetism", 91],
        ["Light", 89],
        ["Force, Work, Power & Energy", 80],
        ["Heat", 42],
        ["Sound", 40],
        ["Modern Physics", 33],
      ],
    },
    markLeaks: [
      {
        title: "Skipping steps in numericals",
        body: "Numericals are step-marked. The scheme expects the formula, the substitution of values, and the final answer as separate visible steps. Jumping straight to the answer can cost the method marks even when the figure is right.",
      },
      {
        title: "Missing or wrong units",
        body: "A quantity without its unit is incomplete, and writing J where the answer is in W, or N where it is in kg, is a unit error rather than a slip. Expect to lose up to a mark per sub-question.",
      },
      {
        title: "Dropping the condition from a law",
        body: "Definitions and laws are marked against textbook wording, and the qualifying clause carries the mark. The principle of moments without “in equilibrium”, or a gas law without “for a given mass of gas”, is not the full statement.",
      },
      {
        title: "Inconsistent symbols",
        body: "Use the conventional symbol for each quantity throughout the answer. Switching symbols mid-working makes steps harder to credit.",
      },
    ],
    faqs: [
      {
        question: "Does BoardEdge check the working in Physics numericals, or just the answer?",
        answer:
          "The working. Each numerical is marked against the official scheme for that question, which separates the formula, the substitution and the final answer with its unit. Your feedback shows which of those steps earned marks.",
      },
      {
        question: "Can BoardEdge mark ray diagrams?",
        answer:
          "Not from typed text. If a question needs a diagram, BoardEdge says which part it could not assess instead of guessing at it, and marks the written parts normally.",
      },
      {
        question: "Which ICSE Physics years are available?",
        answer:
          "Questions from the 2018, 2019, 2020, 2024 and 2025 ICSE Class 10 Physics papers, 375 in total, each with its official marking scheme.",
      },
    ],
    updated: UPDATED,
  },

  // ─── Chemistry ─────────────────────────────────────────────────────────────
  {
    slug: "chemistry",
    name: "Chemistry",
    paper: "Science Paper 2",
    metaTitle: "ICSE Class 10 Chemistry Past Papers With Marking Schemes",
    metaDescription:
      "466 ICSE Class 10 Chemistry past-paper questions (2018–2025) with official marking schemes. Get equations, observations and tests marked as the scheme does.",
    intro:
      "Chemistry schemes are exact about what counts. An equation earns its mark only when it is balanced and carries the conditions the scheme names, and an observation question wants what you would see, not the name of the product. BoardEdge marks your answer against the official CISCE scheme for the actual past-paper question you chose.",
    coverage: {
      questions: 466,
      written: 352,
      years: [2018, 2019, 2020, 2024, 2025],
      chapters: [
        ["Study of Compounds", 90],
        ["Organic Chemistry", 83],
        ["Acids, Bases & Salts", 69],
        ["Electrolysis", 48],
        ["Metallurgy", 43],
        ["Mole Concept & Stoichiometry", 39],
        ["Periodic Table & Periodic Properties", 34],
        ["Chemical Bonding", 33],
        ["Analytical Chemistry", 20],
      ],
    },
    markLeaks: [
      {
        title: "Unbalanced equations or missing conditions",
        body: "An equation needs correct formulae, balancing, and the conditions the scheme specifies: temperature, pressure and catalyst for processes such as Haber and Contact. A correct equation stripped of its conditions does not earn the equation mark.",
      },
      {
        title: "Naming the product instead of the observation",
        body: "“Reddish-brown fumes are evolved” answers an observation question; “nitrogen dioxide is formed” does not. Describe the colour change, precipitate, gas or smell you would actually see.",
      },
      {
        title: "Treating NaOH and NH₄OH as interchangeable",
        body: "In analytical chemistry, whether a metal hydroxide dissolves in excess sodium hydroxide or excess ammonium hydroxide, and the colour of any solution formed, is marked separately for each reagent.",
      },
      {
        title: "Leaving out a named condition",
        body: "Where the scheme names a concentration, temperature or reagent, a generally correct answer without it is incomplete. The examiner will not fill it in for you.",
      },
    ],
    faqs: [
      {
        question: "Does BoardEdge check whether my chemical equations are balanced?",
        answer:
          "Yes. An equation is credited only when the formulae are correct, it is balanced, and it includes the conditions the official scheme asks for in that question.",
      },
      {
        question: "Are Chemistry MCQs marked too?",
        answer:
          "Yes. Objective questions are checked against the answer key exactly, and written answers are marked point by point against the scheme.",
      },
      {
        question: "Which ICSE Chemistry years are available?",
        answer:
          "Questions from the 2018, 2019, 2020, 2024 and 2025 ICSE Class 10 Chemistry papers, 466 in total, each with its official marking scheme.",
      },
    ],
    updated: UPDATED,
  },

  // ─── Biology ───────────────────────────────────────────────────────────────
  {
    slug: "biology",
    name: "Biology",
    paper: "Science Paper 3",
    metaTitle: "ICSE Class 10 Biology Past Papers With Marking Schemes",
    metaDescription:
      "482 ICSE Class 10 Biology past-paper questions (2018–2025) with official marking schemes. See where technical terms, locations and test results earn the mark.",
    intro:
      "In ICSE Biology, understanding the process is not enough on its own: the prescribed term carries the mark. BoardEdge marks your answer to a real Biology past-paper question against the official CISCE scheme, and shows where a correct idea lost marks for the wrong word or a vague description.",
    coverage: {
      questions: 482,
      written: 153,
      years: [2018, 2019, 2020, 2024, 2025],
      chapters: [
        ["Human Anatomy", 210],
        ["Plant Physiology", 120],
        ["Basic Biology", 88],
        ["Pollution", 35],
        ["Human Evolution", 15],
        ["Population", 14],
      ],
    },
    markLeaks: [
      {
        title: "Everyday words for technical terms",
        body: "Flaccid and turgid, not “loose” and “tight”; vasodilation, not “blood vessels widening”. The scheme credits the prescribed term, so a correctly understood process described colloquially still loses the term mark.",
      },
      {
        title: "Vague locations",
        body: "A location needs anatomical boundaries. “Between the two layers of the mesentery” is a location; “near the intestine” is not.",
      },
      {
        title: "Indirect functions",
        body: "“Absorbs light energy for photosynthesis” earns the mark; “helps the leaf make food” does not. State the function directly.",
      },
      {
        title: "Incomplete experiments and tests",
        body: "A control set-up needs its stated difference, such as potassium hydroxide present to absorb carbon dioxide. A test result needs both the reagent and the final colour: iodine turning blue-black for starch.",
      },
    ],
    faqs: [
      {
        question: "Why did my Biology answer lose a mark when the idea was right?",
        answer:
          "Usually because the scheme credits a specific technical term, location or function. BoardEdge points out the exact term the scheme expected so you can use it next time.",
      },
      {
        question: "Can BoardEdge mark labelled diagrams?",
        answer:
          "Not from typed text. Diagram parts are reported as not assessed rather than guessed, and the written parts are marked normally.",
      },
      {
        question: "Which ICSE Biology years are available?",
        answer:
          "Questions from the 2018, 2019, 2020, 2024 and 2025 ICSE Class 10 Biology papers, 482 in total, each with its official marking scheme.",
      },
    ],
    updated: UPDATED,
  },

  // ─── Geography ─────────────────────────────────────────────────────────────
  {
    slug: "geography",
    name: "Geography",
    paper: "History, Civics & Geography Paper 2",
    metaTitle: "ICSE Class 10 Geography Past Papers With Marking Schemes",
    metaDescription:
      "506 ICSE Class 10 Geography past-paper questions (2018–2025) with official marking schemes. Learn where terminology, figures and reasons cost marks.",
    intro:
      "Geography answers lose marks to generic wording and missing figures. The scheme wants the prescribed term, a stated range rather than “good weather”, and a reason that is tied to a place. BoardEdge marks your answer to a real ICSE Geography question against the official CISCE scheme for it.",
    coverage: {
      questions: 506,
      written: 476,
      years: [2018, 2019, 2023, 2024, 2025],
      chapters: [
        ["Interpretation of Topographical Maps", 60],
        ["Map Marking", 50],
        ["Mineral & Energy Resources", 50],
        ["Soil Resources", 49],
        ["Manufacturing Industries", 47],
        ["Agriculture", 46],
        ["Climate", 45],
        ["Waste Management", 44],
        ["Water Resources", 42],
        ["Natural Vegetation", 38],
        ["Transport", 35],
      ],
    },
    markLeaks: [
      {
        title: "Generic words for geographical terms",
        body: "Leaching, laterite, ratooning, bagasse, eutrophication: where the scheme uses the term, it expects you to. “Wearing away” is not erosion, and “dirt” is not soil.",
      },
      {
        title: "No figures for conditions",
        body: "Climatic and agricultural conditions need ranges. A temperature in degrees Celsius or rainfall in centimetres earns the mark where “it needs warm weather” does not. Name the soil, season or altitude when the scheme does.",
      },
      {
        title: "Reasons with no link to the place",
        body: "When a question asks why a crop or industry is found in a region, connect each condition to that location. A list of conditions without the link is half an answer.",
      },
    ],
    faqs: [
      {
        question: "Does BoardEdge mark topographical map and map-marking questions?",
        answer:
          "Written interpretation answers are marked against the scheme. Anything that needs drawing on a map, a cross-section or a graph can’t be assessed from typed text, so BoardEdge reports it as not assessed rather than guessing.",
      },
      {
        question: "Why does BoardEdge want exact figures in Geography answers?",
        answer:
          "Because the official schemes do. Where a scheme expects a temperature or rainfall range, a qualitative description doesn’t earn that mark.",
      },
      {
        question: "Which ICSE Geography years are available?",
        answer:
          "Questions from the 2018, 2019, 2023, 2024 and 2025 ICSE Class 10 Geography papers, 506 in total, each with its official marking scheme.",
      },
    ],
    updated: UPDATED,
  },

  // ─── History & Civics ──────────────────────────────────────────────────────
  {
    slug: "history-civics",
    name: "History & Civics",
    paper: "History, Civics & Geography Paper 1",
    metaTitle: "ICSE Class 10 History & Civics Past Papers With Marking Schemes",
    metaDescription:
      "273 ICSE Class 10 History & Civics past-paper questions (2018–2025) with official marking schemes. See how one valid point earns one mark.",
    intro:
      "History & Civics is marked point by point: a three-mark question wants three distinct, valid points from the scheme. Accurate history the scheme doesn’t list earns nothing, and a strong paragraph with two points in it is worth two marks. BoardEdge marks your answer against the official CISCE scheme for the real past-paper question you chose.",
    coverage: {
      questions: 273,
      written: 225,
      years: [2018, 2019, 2020, 2023, 2024, 2025],
      chapters: [
        ["The Contemporary World", 64],
        ["The Indian National Movement (1857–1917)", 55],
        ["Mass Phase of the National Movement (1915–1947)", 46],
        ["The Union Executive", 39],
        ["The Judiciary", 35],
        ["The Union Legislature", 34],
      ],
    },
    markLeaks: [
      {
        title: "Fewer points than marks",
        body: "One valid point is one mark. Count the marks, then write at least that many distinct points. Repeating one point in different words does not count twice.",
      },
      {
        title: "Writing outside the scheme",
        body: "Historically accurate content that the scheme doesn’t list earns nothing. Breadth is not rewarded; the scheme’s points are.",
      },
      {
        title: "Points buried in a paragraph",
        body: "Valid points inside a dense paragraph still count, but they are easy for an examiner to miss. Write point by point with clear separation.",
      },
      {
        title: "Imprecise civics facts",
        body: "Precise details such as the body, office or provision named in the question carry marks in themselves. Naming the wrong one changes the answer.",
      },
    ],
    faqs: [
      {
        question: "How are ICSE History & Civics answers marked?",
        answer:
          "Point by point. Each valid, distinct point that matches the official scheme earns a mark, up to the marks for the question. BoardEdge shows which of your points were credited and which scheme points you missed.",
      },
      {
        question: "Does spelling matter in History answers?",
        answer:
          "Misspelling a name costs nothing unless it changes who or what you are referring to. Grammar slips don’t cost marks when the fact is intact.",
      },
      {
        question: "Which ICSE History & Civics years are available?",
        answer:
          "Questions from the 2018, 2019, 2020, 2023, 2024 and 2025 ICSE Class 10 History & Civics papers, 273 in total, each with its official marking scheme.",
      },
    ],
    updated: UPDATED,
  },

  // ─── Economics ─────────────────────────────────────────────────────────────
  {
    slug: "economics",
    name: "Economics",
    paper: "Group II Elective",
    metaTitle: "ICSE Class 10 Economics Past Papers With Marking Schemes",
    metaDescription:
      "185 ICSE Class 10 Economics past-paper questions (2018–2026) with official marking schemes. See where key terms, explanations and matched differences earn marks.",
    intro:
      "ICSE Economics is marked on precise terms. A definition of demand without “at a given price and at a given time”, a stage of inflation without its rate per annum, or a heading with no explanation under it loses marks even when the idea is right. BoardEdge marks your answer against the official CISCE scheme for the real past-paper question you chose.",
    coverage: {
      questions: 185,
      written: 137,
      years: [2018, 2019, 2024, 2025, 2026],
      chapters: [
        ["Theory of Demand and Supply", 44],
        ["Productive Mechanism", 38],
        ["Public Finance", 33],
        ["Banking in India", 29],
        ["Consumer Awareness", 17],
        ["Inflation", 13],
        ["Market", 11],
      ],
    },
    markLeaks: [
      {
        title: "Dropping the key term",
        body: "Definitions carry marks for their qualifying words: “other things being equal” in the law of demand, “percentage change” in elasticity, “in expectation of reward” for labour, a rate per annum for each stage of inflation. Leave one out and the definition is incomplete.",
      },
      {
        title: "Headings without explanation",
        body: "When a question says “explain”, a bare heading such as “Natural factors” or “Right to safety” is only half a point. Each point needs a sentence that explains it.",
      },
      {
        title: "Writing demand for supply",
        body: "An answer about demand where supply was asked earns nothing, however correct. The same goes for expansion versus increase, demand-pull versus cost-push inflation, and CRR versus SLR.",
      },
      {
        title: "Unmatched differences",
        body: "A “give five differences” answer is marked pair by pair. Each difference must compare both things on the same basis — interest, withdrawal, ownership — not list unrelated features in two columns.",
      },
    ],
    faqs: [
      {
        question: "How are ICSE Economics answers marked?",
        answer:
          "Point by point, against the official scheme. Where the scheme lists more points than the question asks for, any of them counts, up to the number asked. BoardEdge shows which of your points were credited and which you missed.",
      },
      {
        question: "Can BoardEdge mark Economics graphs?",
        answer:
          "Not from typed text. Questions that ask you to draw a demand or supply curve are kept aside until handwriting can be marked; written answers, schedules and definitions are marked normally.",
      },
      {
        question: "Which ICSE Economics years are available?",
        answer:
          "Questions from the 2018, 2019, 2024, 2025 and 2026 ICSE Class 10 Economics papers, 185 in total, each with its official marking scheme.",
      },
    ],
    updated: "2026-11-22",
  },

  // ─── English Literature ────────────────────────────────────────────────────
  {
    slug: "english-literature",
    name: "English Literature",
    paper: "English Paper 2",
    metaTitle: "ICSE Class 10 English Literature Past Papers With Marking Schemes",
    metaDescription:
      "354 ICSE Class 10 English Literature past-paper questions (2018–2025) with official marking schemes, from The Merchant of Venice to the short stories and poems.",
    intro:
      "Literature answers are marked element by element: the speaker, the listener, the setting, what happened just before, the device, the inference. A beautifully written answer that misidentifies the speaker loses every mark that depends on it. BoardEdge marks your answer against the official CISCE scheme for the real past-paper question you chose.",
    coverage: {
      questions: 354,
      written: 306,
      years: [2018, 2019, 2020, 2023, 2024, 2025],
      chapters: [
        ["The Merchant of Venice", 72],
        ["Animal Farm", 32],
        ["The Mousetrap", 30],
        ["The Call of the Wild", 26],
        ["Julius Caesar", 16],
        ["The Patriot", 12],
        ["Abou Ben Adhem", 12],
        ["My Greatest Olympic Prize", 12],
        ["I Know Why the Caged Bird Sings", 11],
        ["The Blue Bead", 10],
        ["All Summer in a Day", 10],
        ["Loyalties", 10],
      ],
      chapterNote: "plus 23 more poems and short stories with fewer questions each",
    },
    markLeaks: [
      {
        title: "Misidentifying the speaker or listener",
        body: "In extract questions, every later mark depends on who is speaking, to whom, and where. Get the context wrong and the commentary that follows can’t earn its marks.",
      },
      {
        title: "Retelling the story",
        body: "Summarising the whole play, story or poem instead of the incident, line or emotion asked about is a scope failure. Only the part that answers the question is credited.",
      },
      {
        title: "Details from the film, not the text",
        body: "Answers are marked against the prescribed text. Adaptation details and unanchored opinions earn nothing; interpretation counts when it is supported by the text.",
      },
      {
        title: "Length instead of elements",
        body: "A short answer with every required element outscores a long one that misses one. Map the question to its elements before you write.",
      },
    ],
    faqs: [
      {
        question: "Which texts does BoardEdge cover for ICSE English Literature?",
        answer:
          "Questions from past papers on The Merchant of Venice, Julius Caesar, Animal Farm, The Mousetrap, The Call of the Wild and the prescribed poems and short stories, 354 questions across six years.",
      },
      {
        question: "How are Literature extract questions marked?",
        answer:
          "Element by element: speaker, listener, setting, preceding or following events, device and inference, as each question asks. BoardEdge shows which elements your answer included and which it missed.",
      },
      {
        question: "Which ICSE English Literature years are available?",
        answer:
          "Questions from the 2018, 2019, 2020, 2023, 2024 and 2025 ICSE Class 10 English Literature papers, 354 in total, each with its official marking scheme.",
      },
    ],
    updated: UPDATED,
  },
];

export function getSubjectPage(slug: string): SubjectPage | undefined {
  return SUBJECT_PAGES.find((s) => s.slug === slug);
}

export const SUBJECT_HUB_PATH = "/icse-class-10";
export const subjectPath = (slug: string) => `${SUBJECT_HUB_PATH}/${slug}`;

/** Totals for the hub, derived so they can't disagree with the entries. */
export function corpusTotals() {
  const questions = SUBJECT_PAGES.reduce((n, s) => n + s.coverage.questions, 0);
  const years = [...new Set(SUBJECT_PAGES.flatMap((s) => s.coverage.years))].sort();
  return { questions, years, subjects: SUBJECT_PAGES.length };
}
