const subjects = [
  ["aorta", /acute (?:stanford )?type[- ]?a aortic dissection/i, "急性A型主动脉夹层"],
  ["aorta", /aortic dissection|post-dissection/i, "主动脉夹层"],
  ["aorta", /abdominal aortic aneurysm/i, "腹主动脉瘤"],
  ["aorta", /aortic aneurysm|aortic repair|aortic arch/i, "主动脉瘤及主动脉修复"],
  ["limb", /limb[- ]threatening isch[ae]*mia|\bCLTI\b/i, "慢性肢体威胁性缺血（CLTI）"],
  ["limb", /intermittent claudication/i, "间歇性跛行"],
  ["limb", /peripheral arter(?:ial|y) disease/i, "下肢外周动脉疾病"],
  ["limb", /diabetic foot/i, "糖尿病足"],
  ["vein", /venous thromboembolism|\bVTE\b/i, "静脉血栓栓塞"],
  ["vein", /deep vein thrombosis|\bDVT\b/i, "深静脉血栓"],
  ["vein", /pulmonary embolism/i, "肺栓塞"],
  ["vein", /varicose|venous insufficiency|venous ulcer/i, "静脉曲张或静脉功能不全"],
  ["joint", /hip or knee replacement|hip (?:and|or) knee arthroplasty/i, "髋/膝关节置换术"],
  ["carotid", /carotid stenosis|carotid endarterectomy|carotid artery stenting/i, "颈动脉狭窄及其治疗"],
  ["access", /hemodialysis access|haemodialysis access|dialysis access|arteriovenous fistula/i, "血液透析血管通路"],
  ["brain", /cerebral isch[ae]*mia[ /-]*reperfusion|brain isch[ae]*mia[ /-]*reperfusion/i, "脑缺血再灌注损伤"],
  ["brain", /isch[ae]*mic stroke|cerebral isch[ae]*mia|brain isch[ae]*mia/i, "缺血性卒中或脑缺血"],
  ["electric", /neurovascular coupling|neurovascular interaction/i, "神经与血管之间的信号耦联"],
  ["hydrogen", /molecular hydrogen|hydrogen therapy|hydrogen-rich|hydrogen inhalation|hydrogen gas/i, "氢气干预"],
  ["vibration", /vascular vibration|blood flow.{0,20}vibration|vibroacoustic|vibrometry|\bthrill\b|\bbruit\b/i, "血流震颤与血管振动信号"],
  ["function", /arterial stiffness|vascular compliance|vascular function|arterial wall motion/i, "血管功能及血管壁力学特征"],
  ["implant", /(?:bio(?:degradable|resorbable|absorbable)|degradable).{0,25}(?:stent|scaffold)/i, "可降解/可吸收支架"],
  ["implant", /vascular stent|vascular scaffold|coronary scaffold/i, "血管支架"],
  ["implant", /biodegradable implant|bioresorbable implant/i, "可降解植入材料"],
  ["implant", /\bstent\b|\bstents\b|\bendograft/i, "支架或腔内移植物"],
  ["nerve", /neuroimmune|neuronal signaling|neural stem cell|nerve regeneration/i, "神经细胞或神经免疫过程"],
  ["vascular", /vascular surgery|vascular disease|arterial disease/i, "血管疾病及其治疗"]
];

const interventions = [
  ["urokinase", /intra-arterial urokinase/i, "动脉内尿激酶治疗"],
  ["reperfusion", /endovascular reperfusion|reperfusion therapy/i, "再灌注治疗"],
  ["endovascular", /(?:below[- ]knee|infrapopliteal).{0,45}endovascular|endovascular.{0,45}(?:below[- ]knee|infrapopliteal)/i, "膝下动脉腔内干预"],
  ["endovascular", /endovascular repair|\bEVAR\b|\bTEVAR\b|F\/BEVAR/i, "血管腔内修复"],
  ["endovascular", /endovascular intervention|endovascular revasculari[sz]ation/i, "血管腔内干预或血运重建"],
  ["stent", /self-expanding stent/i, "自膨式支架辅助重建"],
  ["thrombectomy", /thrombectomy/i, "取栓治疗"],
  ["anticoagulant", /anticoagulan|thromboprophylaxis|prevention of venous thromboembolism/i, "抗凝或静脉血栓预防"],
  ["contraceptive", /combined oral contraceptive/i, "复方口服避孕药使用"],
  ["pta", /prothrombin time activity/i, "围手术期凝血酶原时间活动度的动态变化"],
  ["inflammation", /inflammatory markers|inflammatory profiles/i, "炎症指标"],
  ["exercise", /exercise preconditioning/i, "运动预适应"],
  ["preconditioning", /remote isch[ae]*mic preconditioning/i, "远隔缺血预适应"],
  ["exosomes", /(?:stem cell.{0,20})?exosomes/i, "外泌体干预"],
  ["carbon", /carbon quantum dots/i, "碳量子点给药材料"],
  ["iron-zinc", /\bFe[- ]Zn\b/i, "铁锌合金微结构设计"],
  ["magnesium-zinc", /\bMg[- \d.]*Zn\b/i, "镁锌合金材料设计"],
  ["nanoparticle", /nanoparticle|nanocarrier|nanosystem|nanoassembly|nanoreactor/i, "纳米材料或靶向递送系统"],
  ["hydrogen", /hydrogen inhalation|hydrogen-rich|molecular hydrogen/i, "氢气干预"],
  ["electric", /electrical stimulation|optogenetic|bioelectric/i, "电活动调控或光遗传学干预"],
  ["channel", /potassium channel|ion channel|membrane potential|gap junction/i, "离子通道、膜电位或细胞间电信号"],
  ["model", /machine learning|risk score|predictive model|predicting|predictors|nomogram|IMA-PLUS/i, "风险预测模型或评分"],
  ["assay", /flow phantom|vascular phantom|in vitro|ex vivo|benchtop/i, "体外实验或血流模型"],
  ["platform", /thrombus platform/i, "人源血栓实验平台"],
  ["omics", /single-cell|spatial transcriptomics/i, "单细胞或空间转录组分析"]
];

const focuses = [
  ["amputation", /amputation|limb salvage|limb loss/i, "截肢风险与保肢结局"],
  ["mortality", /mortality|all-cause death|overall survival/i, "死亡风险或生存结局"],
  ["access-trend", /trends.{0,40}(?:dialysis|vascular access)|incident hemodialysis access|initial vascular access/i, "初始透析通路的使用趋势"],
  ["endoleak", /type[- ]?2 endoleak|type[- ]?II endoleak/i, "II型内漏的预测或管理"],
  ["bleeding", /major bleeding|bleeding risk|hemorrhag/i, "出血安全性"],
  ["recurrence", /recurrent venous thromboembolism|recurrent VTE|thromboembolism recurrence/i, "静脉血栓复发"],
  ["delirium", /postoperative delirium/i, "术后谵妄风险"],
  ["patency", /patency|restenosis|stenosis rate|occlusion/i, "血管通畅性、狭窄或闭塞"],
  ["reintervention", /reintervention/i, "再次干预需求"],
  ["protein-degradation", /(?:Cx43|protein).{0,20}degradation|degradation of.{0,20}protein/i, "蛋白降解与稳定性"],
  ["degradation", /uniform degradation|moderate degradation|corrosion|degradation/i, "材料降解或腐蚀行为", /stent|implant|scaffold|alloy|polymer|biomaterial/i],
  ["mechanics", /strength|ductility|mechanical properties/i, "材料强度与延展性能"],
  ["immune", /immunomodulation|neuroimmune|neuroinflammat/i, "免疫或神经炎症调节"],
  ["recovery", /recovery|neurological function|functional outcome/i, "功能恢复"],
  ["stiffness", /thrombus stiffness/i, "血栓硬度与治疗结局"],
  ["autophagy", /autophagy/i, "细胞自噬机制"],
  ["barrier", /blood-brain barrier/i, "血脑屏障"],
  ["signaling", /AMPK\/ULK1|Cx43|signaling|signalling/i, "相关细胞信号机制"],
  ["sensing", /vibrometry|acoustic|vibration|oscillation|pulse wave velocity/i, "振动、声学或血流信号检测"],
  ["followup", /two-year outcomes|2-year outcomes|24.month outcomes/i, "两年随访结局"],
  ["training", /vascular surgery training|device-specific training|sonography students|surgical education/i, "培训与测量表现"]
];

function text(value) {
  return String(value || "").replace(/&#(x[\da-f]+|\d+);/gi, (_, code) => {
    const number = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code);
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : " ";
  }).replace(/\s+/g, " ").trim();
}

function concepts(value, rules, limit) {
  const result = new Map();
  for (const [group, pattern, label, context] of rules) {
    if (!result.has(group) && pattern.test(value) && (!context || context.test(value))) result.set(group, label);
    if (result.size === limit) break;
  }
  return [...result.values()];
}

function objectiveText(abstract) {
  const labelled = abstract.match(/\b(?:OBJECTIVES?|PURPOSE|AIMS?):\s*([\s\S]*?)(?=\b(?:METHODS|RESULTS|CONCLUSIONS?):|$)/i)?.[1]?.trim();
  const scope = labelled?.length > 20 ? labelled : abstract;
  // Even an OBJECTIVE paragraph can start with background; prefer the actual study-intent sentence.
  const intent = scope.split(/(?<=[.!?])\s+/).find((sentence) => /\b(?:we (?:aimed|sought|investigated|evaluated|explored)|this study (?:aimed|aims)|the aim of this study)\b/i.test(sentence));
  return intent || (labelled?.length > 20 ? labelled : "");
}

function studyLabel(article, title) {
  const types = (article.publicationTypes || []).map((type) => type.toLowerCase());
  if (types.some((type) => /review|meta-analysis/.test(type)) || /\b(?:review|meta-analysis|bibliometric)\b/i.test(title)) return "这篇综述";
  if (types.includes("case reports") || /\bcase report\b/i.test(title)) return "这篇病例报告";
  if (/\bsecondary analysis\b/i.test(title)) return "这篇二次分析";
  if (types.includes("randomized controlled trial")) return "这项随机对照研究";
  if (types.some((type) => type === "clinical trial" || type.startsWith("clinical trial,"))) return "这项临床试验";
  if (/\bregistry|\bregistries/i.test(title)) return "这项登记研究";
  if (/\bcohort\b/i.test(title)) return "这项队列研究";
  return "这篇文献";
}

export function summarizeArticle(article = {}) {
  article = article && typeof article === "object" ? article : {};
  const title = text(article.title);
  const abstract = text(article.abstract);
  const objective = objectiveText(abstract);
  const titleSubjects = concepts(title, subjects, 2);
  const objects = titleSubjects.length ? titleSubjects : concepts(objective, subjects, 2);
  const titleInterventions = concepts(title, interventions, 2);
  const methods = titleInterventions.length ? titleInterventions : concepts(objective, interventions, 2);
  const titleFocuses = concepts(title, focuses, 2);
  const endpoints = titleFocuses.length ? titleFocuses : concepts(objective, focuses, 2);
  const details = [...new Set([...methods, ...endpoints])].filter((item) => !objects.includes(item));
  let summaryZh = objects.length ? `${studyLabel(article, title)}聚焦${objects.join("与")}。` : "";
  if (details.length) summaryZh += `主要内容涉及${details.join("、")}。`;
  if (!summaryZh) summaryZh = abstract
    ? "暂未提取到可靠的中文研究要点，可展开原文摘要了解具体研究问题。"
    : "目前仅有题名，暂无法可靠概括研究内容。";
  if (!abstract) summaryZh += "未提供摘要，方法与结果需查阅原文。";
  else if (/\bmice\b|\bmouse\b|\brats?\b/i.test(title)) summaryZh += "题名包含动物实验线索，临床适用性需另行判断。";
  return {
    summaryZh,
    englishSummary: abstract.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 3).join(" "),
    summaryBasis: abstract ? "title-and-objective-rules" : "title-only-rules"
  };
}
