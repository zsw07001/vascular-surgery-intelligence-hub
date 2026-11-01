export const pubmedConfig = {
  eutilsBase: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils",
  database: "pubmed",
  lookbackDays: 7,
  searchPageSize: 500,
  fetchBatchSize: 100,
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

export const researchDirectionsConfig = {
  lookbackDays: 30,
  dateType: "mdat",
  scoring: { groupMatch: 2, titleMatch: 3, highThreshold: 4 },
  directions: [
    {
      id: "hydrogen-brain-iri",
      title: "氢气治疗与脑缺血再灌注",
      icon: "flask-conical",
      description: "追踪氢气干预、脑缺血再灌注损伤及其交叉机制，覆盖基础、动物和临床研究。",
      query: `(
        (("molecular hydrogen"[Title/Abstract] OR "hydrogen therapy"[Title/Abstract]
          OR "hydrogen-rich"[Title/Abstract] OR "hydrogen inhalation"[Title/Abstract]
          OR "hydrogen gas"[Title/Abstract])
          AND (therap*[Title/Abstract] OR treatment[Title/Abstract] OR neuroprotect*[Title/Abstract]
          OR injur*[Title/Abstract] OR ischemi*[Title/Abstract] OR ischaemi*[Title/Abstract]
          OR reperfusion[Title/Abstract] OR disease*[Title/Abstract] OR patient*[Title/Abstract]
          OR mice[Title/Abstract] OR rats[Title/Abstract] OR animal*[Title/Abstract]
          OR antioxidant*[Title/Abstract]))
        OR (("cerebral ischemia"[Title/Abstract] OR "brain ischemia"[Title/Abstract]
          OR "ischemic stroke"[Title/Abstract] OR "ischaemic stroke"[Title/Abstract])
          AND (reperfusion[Title/Abstract] OR "ischemia-reperfusion"[Title/Abstract]
          OR "ischaemia-reperfusion"[Title/Abstract]))
      )`,
      groups: [
        { tag: "Hydrogen Therapy", patterns: ["molecular hydrogen", "hydrogen therapy", "hydrogen-rich", "hydrogen inhalation", "hydrogen gas"], note: "涉及氢气干预，建议关注干预方式、剂量与作用机制。" },
        { tag: "Brain Ischemia / Reperfusion", patterns: ["cerebral ischemia", "brain ischemia", "ischemic stroke", "ischaemic stroke", "cerebral ischaemia", "brain ischaemia"], note: "涉及脑缺血/再灌注方向，建议区分细胞、动物与临床证据。" }
      ]
    },
    {
      id: "vascular-flow-vibration",
      title: "血流震颤与血管功能检测",
      icon: "activity",
      description: "关注血流诱导振动、血管壁运动、声学/振动检测和体外血流模型中的血管功能评价。",
      query: `(
        "flow-induced vibration"[Title/Abstract] OR "vascular vibration"[Title/Abstract]
        OR "arterial wall vibration"[Title/Abstract] OR "vascular thrill"[Title/Abstract]
        OR ((vascular[Title/Abstract] OR arterial[Title/Abstract] OR "blood flow"[Title/Abstract]
          OR "arteriovenous fistula"[Title/Abstract])
          AND (vibration[Title/Abstract] OR vibrometry[Title/Abstract] OR vibroacoustic[Title/Abstract]
          OR thrill[Title/Abstract] OR bruit[Title/Abstract] OR "acoustic sensing"[Title/Abstract]))
        OR (("arterial stiffness"[Title/Abstract] OR "vascular compliance"[Title/Abstract]
          OR "vascular function"[Title/Abstract])
          AND ("in vitro"[Title/Abstract] OR "ex vivo"[Title/Abstract]
          OR benchtop[Title/Abstract] OR "flow phantom"[Title/Abstract] OR oscillation[Title/Abstract]))
      )`,
      groups: [
        { tag: "Flow Vibration / Thrill", patterns: ["vibration", "vibrometry", "vibroacoustic", "thrill", "bruit", "arterial wall motion", "oscillation"], note: "涉及血流或血管壁振动信号，建议核对信号来源和血流动力学条件。" },
        { tag: "Vascular Function / Sensing", patterns: ["vascular function", "arterial stiffness", "vascular compliance", "sensing", "sensor", "acoustic", "in vitro", "ex vivo", "benchtop", "phantom"], note: "涉及功能检测或体外模型，建议关注信号与流量、顺应性等功能指标的对应关系。" }
      ]
    },
    {
      id: "biodegradable-stents",
      title: "可降解支架",
      icon: "shield-check",
      description: "覆盖可降解/可吸收支架、镁锌铁及聚合物材料，纳入冠脉、外周、其他应用和基础材料研究。",
      query: `(
        (stent*[Title/Abstract] OR "vascular scaffold"[Title/Abstract] OR "coronary scaffold"[Title/Abstract])
        AND (biodegrad*[Title/Abstract] OR bioresorb*[Title/Abstract] OR bioabsorb*[Title/Abstract]
          OR degradable[Title/Abstract] OR "magnesium-based"[Title/Abstract]
          OR "zinc-based"[Title/Abstract] OR "iron-based"[Title/Abstract]
          OR ((magnesium[Title/Abstract] OR zinc[Title/Abstract] OR iron[Title/Abstract])
          AND (corrosion[Title/Abstract] OR degradation[Title/Abstract] OR alloy[Title/Abstract])))
      )`,
      groups: [
        { tag: "Bioresorbable Stent / Scaffold", patterns: ["biodegradable", "bioresorbable", "bioabsorbable", "degradable", "stent", "scaffold"], note: "涉及可降解支架方向，建议关注降解周期、力学维持和应用部位。" },
        { tag: "Biomaterials", patterns: ["magnesium", "zinc", "iron", "polymer", "corrosion", "biocompatibility", "alloy"], note: "涉及支架材料或生物相容性，建议区分材料、体外、动物与临床证据。" }
      ]
    },
    {
      id: "neurovascular-bioelectric",
      title: "神经与血管电信号互调",
      icon: "heart-pulse",
      description: "追踪神经、内皮、平滑肌及周细胞之间的电活动与信号耦联，不限于血管外科临床研究。",
      query: `(
        (neurovascular[Title/Abstract] OR neuron*[Title/Abstract]
          OR "perivascular nerves"[Title/Abstract] OR "vascular innervation"[Title/Abstract]
          OR "sympathetic innervation"[Title/Abstract])
        AND (vascular[Title/Abstract] OR endotheli*[Title/Abstract] OR arteriole*[Title/Abstract]
          OR capillar*[Title/Abstract] OR pericyte*[Title/Abstract] OR "smooth muscle"[Title/Abstract])
        AND (bioelectric*[Title/Abstract] OR electrophysiolog*[Title/Abstract]
          OR "electrical signaling"[Title/Abstract] OR "electrical signalling"[Title/Abstract]
          OR "membrane potential"[Title/Abstract] OR "action potential"[Title/Abstract]
          OR "ion channel"[Title/Abstract] OR "potassium channel"[Title/Abstract]
          OR "gap junction"[Title/Abstract] OR electrotonic[Title/Abstract]
          OR optogenetic*[Title/Abstract])
      )`,
      groups: [
        { tag: "Neurovascular Interaction", patterns: ["neurovascular", "neuron", "perivascular nerves", "innervation", "pericyte", "endothelial"], note: "涉及神经与血管相互作用，建议确认研究涉及的细胞类型和调控方向。" },
        { tag: "Bioelectric Signaling", patterns: ["bioelectric", "electrophysiolog", "electrical signal", "membrane potential", "action potential", "ion channel", "potassium channel", "gap junction", "electrotonic", "optogenetic"], note: "涉及电活动或离子通道信号，建议关注电生理证据及其与血管反应的关联。" }
      ]
    }
  ]
};

export function buildPubMedQuery() {
  const include = `(${pubmedConfig.includeTerms.join("\nOR ")})`;
  const exclude = `NOT (${pubmedConfig.excludeTerms.join("\nOR ")})`;
  return `${include}\n${exclude}`;
}
