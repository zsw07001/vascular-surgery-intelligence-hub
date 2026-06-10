export const pubmedConfig = {
  eutilsBase: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils",
  database: "pubmed",
  lookbackDays: 7,
  maxRecords: 200,
  requestDelayMs: 400,
  requestTimeoutMs: 30000,
  requestRetryCount: 3,
  requestRetryBaseDelayMs: 1000,
  dateType: "mdat",
  defaultTool: "vascular-surgery-intelligence-hub",
  emailEnvVar: "NCBI_EMAIL",
  toolEnvVar: "NCBI_TOOL",
  includeTerms: [
    '"vascular surgery"[Title/Abstract]',
    '"Vascular Surgical Procedures"[MeSH Terms]',
    '"peripheral arterial disease"[Title/Abstract]',
    '"peripheral artery disease"[Title/Abstract]',
    '"critical limb ischemia"[Title/Abstract]',
    '"chronic limb-threatening ischemia"[Title/Abstract]',
    '"CLTI"[Title/Abstract]',
    '"abdominal aortic aneurysm"[Title/Abstract]',
    '"AAA"[Title/Abstract]',
    '"EVAR"[Title/Abstract]',
    '"TEVAR"[Title/Abstract]',
    '"aortic aneurysm"[Title/Abstract]',
    '"aortic dissection"[Title/Abstract]',
    '"carotid stenosis"[Title/Abstract]',
    '"carotid endarterectomy"[Title/Abstract]',
    '"carotid artery stenting"[Title/Abstract]',
    '"deep vein thrombosis"[Title/Abstract]',
    '"venous thromboembolism"[Title/Abstract]',
    '"varicose veins"[Title/Abstract]',
    '"hemodialysis access"[Title/Abstract]',
    '"arteriovenous fistula"[Title/Abstract]',
    '"endovascular"[Title/Abstract]'
  ],
  excludeTerms: [
    '"coronary"[Title/Abstract]',
    '"intracranial"[Title/Abstract]',
    '"cerebral aneurysm"[Title/Abstract]',
    '"animal model"[Title/Abstract]',
    '"mouse"[Title/Abstract]',
    '"mice"[Title/Abstract]',
    '"rat"[Title/Abstract]'
  ]
};

export const scoringConfig = {
  thresholds: {
    high: 6,
    medium: [3, 5],
    low: [1, 2],
    reviewMax: 0
  },
  additions: [
    {
      points: 3,
      field: "title",
      label: "title vascular surgery topic",
      patterns: [
        "vascular surgery",
        "endovascular",
        "EVAR",
        "TEVAR",
        "CLTI",
        "PAD",
        "carotid stenosis",
        "aortic aneurysm",
        "aortic dissection"
      ]
    },
    {
      points: 2,
      field: "abstract",
      label: "clinical evidence design",
      patterns: [
        "randomized",
        "trial",
        "cohort",
        "registry",
        "real-world",
        "meta-analysis",
        "systematic review",
        "guideline",
        "consensus"
      ]
    },
    {
      points: 3,
      field: "publicationTypes",
      label: "high-value publication type",
      patterns: [
        "randomized controlled trial",
        "clinical trial",
        "systematic review",
        "meta-analysis",
        "guideline",
        "practice guideline"
      ]
    },
    {
      points: 2,
      field: "meshOrAbstract",
      label: "human study",
      patterns: ["human", "patients", "clinical"]
    },
    {
      points: 2,
      field: "titleAbstract",
      label: "treatment or prognosis relevance",
      patterns: [
        "treatment",
        "surgery",
        "intervention",
        "device",
        "stent",
        "graft",
        "outcome",
        "prognosis",
        "guideline",
        "real-world"
      ]
    },
    {
      points: 2,
      field: "affiliations",
      label: "China affiliation",
      patterns: ["China", "Chinese", "Hong Kong", "Taiwan", "Macau"]
    }
  ],
  penalties: [
    {
      points: -5,
      label: "animal-only signal",
      patterns: ["animal-only", "mouse", "mice", "rat"]
    },
    {
      points: -2,
      label: "basic mechanism without clinical relevance",
      patterns: ["mechanism", "cell line", "in vitro", "pathway"]
    },
    {
      points: -5,
      label: "not vascular surgery topic",
      patterns: ["coronary", "intracranial", "cerebral aneurysm"]
    },
    {
      points: -1,
      label: "case report",
      patterns: ["case report", "case reports"]
    }
  ]
};

export const highImpactConfig = {
  includeRelevanceLevels: ["high"],
  highValueStudyTypes: [
    "RCT",
    "Clinical Trial",
    "Systematic Review",
    "Meta-analysis",
    "Guideline",
    "Registry",
    "Real-world Evidence"
  ],
  minimumScoreForHighValueStudyType: 3
};

export const topicTagRules = [
  {
    tag: "PAD / CLTI",
    patterns: ["peripheral arterial disease", "peripheral artery disease", "critical limb ischemia", "chronic limb-threatening ischemia", "CLTI", "PAD"]
  },
  {
    tag: "Aortic Disease",
    patterns: ["abdominal aortic aneurysm", "aortic aneurysm", "aortic dissection", "EVAR", "TEVAR"]
  },
  {
    tag: "Carotid Disease",
    patterns: ["carotid stenosis", "carotid endarterectomy", "carotid artery stenting"]
  },
  {
    tag: "Venous Disease",
    patterns: ["deep vein thrombosis", "venous thromboembolism", "venous insufficiency", "varicose veins", "iliac vein"]
  },
  {
    tag: "Dialysis Access",
    patterns: ["hemodialysis access", "arteriovenous fistula", "dialysis access"]
  },
  {
    tag: "Endovascular",
    patterns: ["endovascular", "EVAR", "TEVAR", "stenting", "angioplasty", "drug-coated balloon"]
  },
  {
    tag: "Open Surgery",
    patterns: ["open surgery", "bypass", "endarterectomy", "surgical repair"]
  },
  {
    tag: "Vascular Graft / Stent / Device",
    patterns: ["stent", "graft", "endograft", "device", "prosthesis", "drug-coated balloon"]
  },
  {
    tag: "Antithrombotic Therapy",
    patterns: ["antithrombotic", "anticoagulation", "antiplatelet", "rivaroxaban", "aspirin", "clopidogrel"]
  },
  {
    tag: "Imaging / Diagnosis",
    patterns: ["imaging", "ultrasound", "computed tomography", "CTA", "duplex", "diagnosis", "surveillance"]
  },
  {
    tag: "Guideline / Consensus",
    patterns: ["guideline", "consensus", "practice guideline", "recommendation"]
  }
];

export const studyTypeTagRules = [
  { tag: "RCT", patterns: ["randomized controlled trial", "randomised controlled trial", "RCT"] },
  { tag: "Clinical Trial", patterns: ["clinical trial", "trial"] },
  { tag: "Cohort", patterns: ["cohort"] },
  { tag: "Registry", patterns: ["registry"] },
  { tag: "Real-world Evidence", patterns: ["real-world", "real world"] },
  { tag: "Systematic Review", patterns: ["systematic review"] },
  { tag: "Meta-analysis", patterns: ["meta-analysis", "meta analysis"] },
  { tag: "Guideline", patterns: ["guideline", "practice guideline"] },
  { tag: "Case Report", patterns: ["case report", "case reports"] },
  { tag: "Basic Research", patterns: ["mechanism", "cell", "mouse", "mice", "rat", "in vitro"] },
  { tag: "Review", patterns: ["review"] }
];

export const chinaAffiliationKeywords = [
  "China",
  "Chinese",
  "Hong Kong",
  "Taiwan",
  "Macau",
  "Beijing",
  "Shanghai",
  "Guangzhou",
  "Wuhan",
  "Chengdu",
  "Nanjing",
  "Xi'an",
  "Zhejiang",
  "Fudan",
  "Peking Union",
  "West China",
  "Zhongshan Hospital",
  "Changhai Hospital",
  "Xuanwu Hospital"
];

export const clinicalTrialsConfig = {
  apiBase: "https://clinicaltrials.gov/api/v2",
  requestTimeoutMs: 30000,
  topics: [
    "peripheral arterial disease",
    "chronic limb-threatening ischemia",
    "critical limb ischemia",
    "abdominal aortic aneurysm",
    "aortic aneurysm",
    "aortic dissection",
    "carotid stenosis",
    "deep vein thrombosis",
    "venous insufficiency",
    "varicose veins",
    "hemodialysis access",
    "endovascular"
  ],
  termTopics: ["endovascular"],
  activeStatuses: ["RECRUITING", "NOT_YET_RECRUITING", "ACTIVE_NOT_RECRUITING"],
  pageSize: 100,
  maxPagesPerTopic: 2,
  includePatterns: [
    "peripheral arterial disease",
    "peripheral artery disease",
    "chronic limb-threatening ischemia",
    "critical limb ischemia",
    "limb ischemia",
    "femoropopliteal",
    "tibial artery",
    "iliac lesion",
    "aortic aneurysm",
    "abdominal aortic aneurysm",
    "thoracoabdominal aortic aneurysm",
    "aortic dissection",
    "aortic arch",
    "endovascular aneurysm repair",
    "evar",
    "tevar",
    "bevar",
    "fenestrated",
    "branched endovascular",
    "carotid stenosis",
    "carotid artery",
    "carotid endarterectomy",
    "deep vein thrombosis",
    "venous thromboembolism",
    "venous insufficiency",
    "varicose veins",
    "iliac vein",
    "hemodialysis access",
    "dialysis access",
    "vascular access",
    "dialysis fistula",
    "hemodialysis fistula",
    "arteriovenous fistula maturation",
    "stent graft",
    "endograft",
    "vascular graft",
    "vascular surgery",
    "lower extremity arterial",
    "lower extremity venous"
  ],
  contextualIncludeRules: [
    {
      label: "Dialysis access arteriovenous fistula",
      requiredPatterns: ["arteriovenous fistula"],
      contextPatterns: [
        "hemodialysis",
        "haemodialysis",
        "dialysis",
        "end-stage renal",
        "end stage renal",
        "end-stage kidney",
        "end stage kidney",
        "vascular access",
        "fistula maturation"
      ]
    }
  ],
  strongVascularPatterns: [
    "peripheral arterial disease",
    "peripheral artery disease",
    "chronic limb-threatening ischemia",
    "critical limb ischemia",
    "aortic aneurysm",
    "abdominal aortic aneurysm",
    "aortic dissection",
    "aortic arch",
    "carotid stenosis",
    "carotid artery stenosis",
    "carotid endarterectomy",
    "carotid revascularization",
    "carotid artery stenting",
    "deep vein thrombosis",
    "venous thromboembolism",
    "venous insufficiency",
    "varicose veins",
    "hemodialysis access",
    "dialysis access",
    "vascular access",
    "stent graft",
    "endograft",
    "vascular surgery",
    "lower extremity arterial",
    "lower extremity venous"
  ],
  strictExcludeRules: [
    {
      label: "Neurovascular-only topics",
      blockPatterns: ["intracranial", "cerebral", "brain", "neurosurgical", "middle cerebral artery"],
      allowPatterns: [
        "extracranial carotid",
        "carotid stenosis",
        "carotid artery stenosis",
        "carotid endarterectomy",
        "carotid artery stenting",
        "carotid revascularization",
        "aortic aneurysm",
        "aortic dissection",
        "peripheral arterial disease",
        "peripheral artery disease",
        "lower extremity arterial",
        "lower extremity venous",
        "hemodialysis access",
        "dialysis access"
      ]
    },
    {
      label: "Coronary-only topics",
      blockPatterns: ["coronary artery disease", "acute coronary syndrome", "myocardial infarction"],
      allowPatterns: [
        "peripheral arterial disease",
        "peripheral artery disease",
        "chronic limb-threatening ischemia",
        "critical limb ischemia",
        "aortic aneurysm",
        "aortic dissection",
        "carotid stenosis",
        "deep vein thrombosis",
        "venous thromboembolism"
      ]
    }
  ],
  excludePatterns: [
    "left atrial appendage",
    "atrial fibrillation",
    "intracranial",
    "cerebral",
    "brain",
    "neurosurgical",
    "coronary artery disease",
    "acute coronary syndrome",
    "breast cancer",
    "lung cancer",
    "covid-19",
    "pregnancy"
  ]
};

export function buildPubMedQuery() {
  const include = `(${pubmedConfig.includeTerms.join("\nOR ")})`;
  const exclude = `NOT (${pubmedConfig.excludeTerms.join("\nOR ")})`;
  return `${include}\n${exclude}`;
}
