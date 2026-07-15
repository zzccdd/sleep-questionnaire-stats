const CONFIG = window.SLEEP_REPORT_CONFIG || {};
const GOOGLE_SCRIPT_URL = String(CONFIG.googleScriptUrl || "").trim();
const IS_LOCAL_PREVIEW = location.protocol === "file:";
const DRAFT_KEY = "sleep-patterns-screening-draft-v3";
const SECTION_TITLES = ["基本信息", "通常作息", "小睡、补偿与恢复", "日间状态与功能", "对睡眠的感受", "模式起源与家族", "睡眠与健康", "后续参与"];

const options = {
  gender: [["male","男"],["female","女"],["other","其他 / 不愿透露"]],
  identity: [["fulltime","全职工作"],["parttime","兼职"],["student","在读学生"],["retired","退休"],["other","其他"]],
  wakeMethod: [["natural","自然醒"],["alarm","闹钟 / 被他人叫醒"],["mixed","两者兼有"]],
  alarm: [["never","从不"],["sometimes","偶尔"],["often","经常"],["always","总是"]],
  nap: [["never","从不"],["rare","偶尔（每周 <1 次）"],["sometimes","有时（每周 1–3 次）"],["often","经常（几乎每天）"]],
  unrestricted: [["same","与平时基本相同"],["slightly","略多睡一些"],["catchup","明显多睡或睡到很晚"]],
  shortDay: [["same","与平时几乎没有差别"],["mild","略感疲惫，但基本不影响日常"],["marked","明显疲惫，效率或情绪受到影响"],["severe","难以正常完成工作、学习或日常事务"]],
  rebound: [["same","与平时基本相同"],["lt1","略多睡一些（不到 1 小时）"],["gte1","明显多睡（1 小时以上）以补回来"],["unknown","说不清"]],
  daytime: [["good","良好，一天中大部分时间保持清醒专注"],["okay","尚可，偶有精力或注意力下降"],["average","一般，时常感到精力不足"],["poor","较差，多数时候难以集中"]],
  mood: [["stable","平稳良好"],["occasional","偶有低落、烦躁或紧张"],["frequent","经常感到低落、烦躁或易怒"],["marked","情绪问题已对生活造成明显困扰"]],
  impact: [["none","基本没有影响"],["mild","偶有轻微影响"],["often","经常有一定影响"],["marked","影响明显"]],
  wantMore: [["no","不希望，目前的睡眠时长刚好合适"],["indifferent","无所谓"],["yes","希望多睡一些"],["very_yes","很希望多睡"]],
  refreshed: [["refreshed","神清气爽、休息充分"],["okay","尚可"],["tired","未睡够，仍感疲惫"]],
  onset: [["childhood","自儿童期起，长期基本稳定"],["adolescent","自青少年期起，长期基本稳定"],["young_adult","自成年早期起，长期基本稳定"],["adult_years","成年后某一阶段开始，已持续多年"],["recent","最近一两年才出现"],["changed","期间曾有较大变化"]],
  familyCompare: [["much_shorter","明显更短"],["shorter","略短一些"],["same","大致相当"],["longer","更长"],["unknown","不清楚"]],
  family: [["yes","有"],["no","没有"],["unknown","不清楚"]],
  frequency4: [["never","从不"],["sometimes","偶尔"],["often","经常"],["nightly","几乎每晚"]],
  sleepReason: [["not_short","我的睡眠时间并不算少"],["cant_sleep","睡得少，是因为想睡却睡不着"],["need_less","睡得少，是因为自然不需要那么多睡眠"],["no_time","睡得少，是因为没有足够的时间可以睡"],["mixed","多种情况兼有 / 说不清"]],
  apnea: [["none","无"],["sometimes","偶有"],["often","经常"],["unknown","不清楚"]],
  threeFreq: [["none","无"],["sometimes","偶有"],["often","经常"]],
  health: [["none","均无"],["condition","有相关健康状况"],["medication","正在使用相关药物"],["private","不确定 / 不愿透露"]],
  caffeine: [["none","几乎不需要"],["sometimes","偶尔"],["daily","每天适量"],["heavy","较为依赖"]],
  followup: [["yes","愿意"],["unsure","暂不确定"],["no","不愿意"]],
  familyForward: [["yes","愿意"],["unsure","暂不确定"],["no","不愿意"],["na","不适用"]],
};

const sections = [
  { intro: "请填写以下基本信息，帮助研究团队了解样本特征。", fields: [
    field("participantId", "姓名", "text", { placeholder:"请输入您的姓名" }),
    field("q1", "Q1. 您的年龄", "number", { min:18, max:100, unit:"岁" }),
    radio("q2", "Q2. 您的性别", options.gender), radio("q3", "Q3. 您目前的主要身份", options.identity),
    field("q4", "Q4. 您的常住地区 / 时区", "text", { placeholder:"例如：东京 / UTC+9" }),
  ]},
  { intro: "请分别填写有固定安排的日子（如上班、上学）与可以自由作息的日子（如周末、假期）的通常情况。", fields: [
    paired("q5", "Q5. 上床就寝时间", "time", "约几点"),
    paired("q6", "Q6. 上床后通常多久入睡", "number", "分钟", { min:0, max:300 }),
    paired("q7", "Q7. 通常醒来时间", "time", "约几点"),
    pairedRadio("q8", "Q8. 通常的醒来方式", options.wakeMethod, options.alarm),
    field("q9", "Q9. 一周中，您通常有几天属于“有固定安排的日子”？", "number", { min:0, max:7, unit:"天" }),
    field("q9note", "若为 7 天，可在这里说明（选填）", "text", { required:false, placeholder:"例如：几乎没有自由作息日" }),
    duration("q10", "Q10. 综合来看，您平均每晚实际睡着的时间大约是"),
  ]},
  { intro: "这部分关注小睡、没有时间限制时的睡眠，以及偶尔短睡后的感受。", fields: [
    radio("q11", "Q11. 过去一个月，您是否会在白天小睡（打盹）？", options.nap),
    field("q11minutes", "若有，平均每次约多少分钟？（选填）", "number", { required:false, min:0, max:300, unit:"分钟" }),
    radio("q12", "Q12. 如果连续几天没有工作、上学或闹钟的限制，您的睡眠通常会：", options.unrestricted),
    radio("q13", "Q13. 如果某一晚只睡了很少（例如 3–4 小时），第二天您通常的状态是：", options.shortDay),
    radio("q14", "Q14. 在这样一个睡得很少的夜晚之后，接下来一两晚您的睡眠通常会：", options.rebound),
  ]},
  { intro: "请评估日常情境中的困倦程度，以及近一个月的精力、情绪和日常功能。驾驶情境若不适用，可留空。", fields: [
    ess(), radio("q16", "Q16. 总体而言，您白天的精力、注意力与思维清晰度如何？", options.daytime),
    radio("q17", "Q17. 过去一个月，您的情绪状态总体如何？", options.mood),
    radio("q18", "Q18. 总体而言，您的睡眠是否影响到工作、学习或日常生活？", options.impact),
  ]},
  { intro: "请按自己的真实感受回答，不需要追求某种“正确”的睡眠时长。", fields: [
    radio("q19", "Q19. 如果时间完全允许，您是否希望每晚睡得更久一些？", options.wantMore),
    field("q20", "Q20. 您认为自己每晚大约需要睡多少小时，第二天才能保持良好状态？", "number", { min:1, max:16, step:.25, unit:"小时" }),
    radio("q21", "Q21. 早晨醒来时，您通常的感觉是：", options.refreshed),
  ]},
  { intro: "请回顾这种睡眠模式出现的时间、稳定性，以及家人中是否存在相似情况。", fields: [
    radio("q22", "Q22. 您目前的睡眠模式大约从何时开始，此后是否长期稳定？", options.onset),
    radio("q23", "Q23. 与您的父母、兄弟姐妹相比，您的睡眠时间通常：", options.familyCompare),
    radio("q24", "Q24. 您的直系亲属中，是否有人也长期睡得很少，但白天精神状态良好？", options.family),
    field("q24count", "若有，共多少位？（选填）", "number", { required:false, min:1, max:20, unit:"位" }),
    field("q24relation", "若有，与您的关系是？（选填）", "text", { required:false, placeholder:"例如：父亲、妹妹" }),
    radio("q25", "Q25. 您的直系亲属中，是否有人长期睡眠时间明显偏长？", options.family),
  ]},
  { intro: "以下问题用于了解可能影响睡眠的其他因素，请根据近一个月或题目指定的时间范围如实填写。", fields: [
    frequencyMatrix(),
    radio("q27", "Q27. 关于您的睡眠时长，以下哪一项最符合您的情况？", options.sleepReason),
    radio("q28", "Q28. 您或同住者是否注意到您睡觉时严重打鼾、短暂憋气或呼吸停顿？", options.apnea),
    radio("q29", "Q29. 入睡前，您的腿部是否常有不适感，必须活动后才能缓解？", options.threeFreq),
    checks("q30", "Q30. 过去 3 个月，是否存在以下可能明显影响作息的情况？（可多选）", [["shift","轮班或夜班"],["travel","经常跨时区旅行"],["restriction","加班、备考或照护等持续性作息限制"],["stress","重大生活事件或持续高压"],["none","均无"]]),
    checks("q31", "Q31. 您目前是否存在可能影响睡眠的健康状况，或正在使用可能影响睡眠或清醒程度的药物？（可多选）", options.health),
    field("q31detail", "若有，可简要说明（选填）", "text", { required:false, placeholder:"健康状况或药物名称" }),
    radio("q32", "Q32. 您平时依赖咖啡、浓茶、能量饮料等维持清醒的程度如何？", options.caffeine),
  ]},
  { intro: "提交前请确认联系意愿。选择“不愿意”不会影响本次问卷的使用。", fields: [
    radio("q33", "Q33. 如果您符合后续研究条件，是否愿意由我们与您联系，进一步了解睡眠记录或监测等环节？", options.followup),
    radio("q34", "Q34. 若您在 Q24 中选择了“有”，是否愿意代为向这些亲属转达本研究的信息？", options.familyForward),
    field("q35", "Q35. 若愿意接受联系，请留下一种方便的联系方式（邮箱 / 电话）", "text", { required:false, placeholder:"仅在愿意联系时填写" }),
    { type:"review" },
  ]},
];

function field(name, label, type, extra={}) { return { type:"field", name, label, inputType:type, required: extra.required !== false, ...extra }; }
function radio(name, label, choices) { return { type:"radio", name, label, choices, required:true }; }
function duration(name, label) { return { type:"duration", name, label, required:true }; }
function paired(name, label, inputType, unit, extra={}) { return { type:"paired", name, label, inputType, unit, ...extra }; }
function pairedRadio(name, label, workChoices, freeChoices) { return { type:"pairedRadio", name, label, workChoices, freeChoices }; }
function checks(name, label, choices) { return { type:"checks", name, label, choices }; }
function ess() { return { type:"ess", name:"q15", label:"Q15. 日常情境中的打瞌睡可能性" }; }
function frequencyMatrix() { return { type:"frequencyMatrix", name:"q26", label:"Q26. 过去一个月，您出现以下情况的频率如何？" }; }

const els = {
  surveyView: document.querySelector("#surveyView"), successView: document.querySelector("#successView"), researchView: document.querySelector("#researchView"),
  introCard: document.querySelector("#introCard"), consent: document.querySelector("#consent"), start: document.querySelector("#startSurvey"), formShell: document.querySelector("#formShell"),
  form: document.querySelector("#screeningForm"), sections: document.querySelector("#questionSections"), stepNav: document.querySelector("#stepNav"), progressText: document.querySelector("#progressText"), progressBar: document.querySelector("#progressBar"),
  prev: document.querySelector("#previousStep"), next: document.querySelector("#nextStep"), submit: document.querySelector("#submitSurvey"), error: document.querySelector("#formError"), saveStatus: document.querySelector("#saveStatus"), toast: document.querySelector("#toast"),
  openResearch: document.querySelector("#openResearch"), leaveResearch: document.querySelector("#leaveResearch"), researchLogin: document.querySelector("#researchLogin"), researchPin: document.querySelector("#researchPin"), researchLoginButton: document.querySelector("#researchLoginButton"), loginError: document.querySelector("#loginError"),
  dashboard: document.querySelector("#researchDashboard"), recordCards: document.querySelector("#recordCards"), recordSearch: document.querySelector("#recordSearch"), responseCount: document.querySelector("#responseCount"), candidateCount: document.querySelector("#candidateCount"), refresh: document.querySelector("#refreshRecords"), export: document.querySelector("#exportRecords"),
};

let currentStep = 0;
let records = [];
let researchPin = "";
let saveTimer;

renderForm();
restoreDraft();
bindEvents();
if (location.hash === "#research") openResearchView();

function renderForm() {
  els.stepNav.innerHTML = SECTION_TITLES.map((title, i) => `<li data-step="${i}">${i + 1}. ${title}</li>`).join("");
  els.sections.innerHTML = sections.map((section, i) => `
    <section class="form-section" data-section="${i}" ${i ? "hidden" : ""}>
      <p class="section-number">第 ${i + 1} 部分 · 共 ${sections.length} 部分</p>
      <h2>${SECTION_TITLES[i]}</h2>
      <p class="section-intro">${section.intro}</p>
      ${section.fields.map(renderField).join("")}
    </section>`).join("");
  updateStep();
}

function renderField(item) {
  if (item.type === "radio") return `<fieldset class="question"><legend class="question-title">${item.label} <em>*</em></legend><div class="options two-col">${item.choices.map(([value,label]) => `<label class="option"><input type="radio" name="${item.name}" value="${value}" required /><span>${label}</span></label>`).join("")}</div></fieldset>`;
  if (item.type === "duration") return `<div class="question"><label class="question-title">${item.label} <em>*</em></label><div class="field-row"><label class="field"><span>小时</span><input name="${item.name}h" type="number" inputmode="decimal" min="0" max="16" required /></label><label class="field"><span>分钟</span><select name="${item.name}m" required><option value="">请选择</option><option value="0">0 分钟</option><option value="15">15 分钟</option><option value="30">30 分钟</option><option value="45">45 分钟</option></select></label></div></div>`;
  if (item.type === "paired") {
    const attrs = [item.min != null ? `min="${item.min}"` : "", item.max != null ? `max="${item.max}"` : ""].filter(Boolean).join(" ");
    const control = suffix => item.inputType === "time" ? renderTimePicker(`${item.name}${suffix}`) : `<div class="inline-unit"><input name="${item.name}${suffix}" type="number" inputmode="numeric" ${attrs} required /><span>${item.unit}</span></div>`;
    return `<div class="question"><label class="question-title">${item.label} <em>*</em></label><div class="field-row schedule-pair"><label class="field"><span>有固定安排的日子</span>${control("work")}</label><label class="field"><span>自由作息的日子</span>${control("free")}</label></div></div>`;
  }
  if (item.type === "pairedRadio") return `<fieldset class="question"><legend class="question-title">${item.label} <em>*</em></legend><div class="paired-options"><div><h4>有固定安排的日子</h4><div class="options">${item.workChoices.map(([value,label]) => `<label class="option"><input type="radio" name="${item.name}work" value="${value}" required /><span>${label}</span></label>`).join("")}</div></div><div><h4>自由作息的日子</h4><div class="options">${item.freeChoices.map(([value,label]) => `<label class="option"><input type="radio" name="${item.name}free" value="${value}" required /><span>${label}</span></label>`).join("")}</div></div></div></fieldset>`;
  if (item.type === "checks") return `<fieldset class="question"><legend class="question-title">${item.label} <em>*</em></legend><div class="options two-col">${item.choices.map(([value,label]) => `<label class="option"><input type="checkbox" name="${item.name}" value="${value}" /><span>${label}</span></label>`).join("")}</div></fieldset>`;
  if (item.type === "ess") {
    const scenes = ["坐着安静阅读时","看电视或长时间看屏幕时","在公共场合安静坐着时","乘车连续约一小时（非驾驶）时","下午有条件躺下休息时","午饭后安静坐着（未饮酒）时","开车途中堵车或等红灯时","与人面对面交谈时"];
    return `<fieldset class="question"><legend class="question-title">${item.label} <em>*</em></legend><p class="hint">0 = 从不会，1 = 很少，2 = 有时，3 = 很可能。若您平时不驾车，驾驶情境可留空。</p><div class="ess-grid"><div class="ess-row ess-head"><span>情境</span><span>0</span><span>1</span><span>2</span><span>3</span></div>${scenes.map((scene,i) => `<div class="ess-row"><span>${scene}</span>${[0,1,2,3].map(v => `<label aria-label="${scene}：${v} 分"><input type="radio" name="q15_${i+1}" value="${v}" ${i === 6 ? "" : "required"} /></label>`).join("")}</div>`).join("")}</div></fieldset>`;
  }
  if (item.type === "frequencyMatrix") {
    const rows = [["q26_1","上床后超过 30 分钟仍难以入睡"],["q26_2","夜间反复醒来，或早醒后难以再次入睡"]];
    return `<fieldset class="question"><legend class="question-title">${item.label} <em>*</em></legend><div class="frequency-grid"><div class="frequency-row frequency-head"><span>情况</span>${options.frequency4.map(([,label]) => `<span>${label}</span>`).join("")}</div>${rows.map(([name,label]) => `<div class="frequency-row"><span>${label}</span>${options.frequency4.map(([value]) => `<label aria-label="${label}：${value}"><input type="radio" name="${name}" value="${value}" required /></label>`).join("")}</div>`).join("")}</div></fieldset>`;
  }
  if (item.type === "review") return `<div class="question"><h3>提交前确认</h3><div id="reviewList" class="review-list"></div><div class="privacy-callout">提交后，研究者会依据内部规则进行初筛。受试者页面不会显示候选类别，且初筛结果不能替代医学诊断。</div></div>`;
  const attrs = [`name="${item.name}"`, `type="${item.inputType}"`, item.inputType === "number" ? "inputmode=\"decimal\"" : "", item.required ? "required" : "", item.min != null ? `min="${item.min}"` : "", item.max != null ? `max="${item.max}"` : "", item.step != null ? `step="${item.step}"` : "", item.placeholder ? `placeholder="${item.placeholder}"` : ""].filter(Boolean).join(" ");
  return `<div class="question"><label class="question-title" for="${item.name}">${item.label}${item.required ? " <em>*</em>" : ""}</label><div class="inline-unit"><input id="${item.name}" ${attrs} />${item.unit ? `<span>${item.unit}</span>` : ""}</div></div>`;
}

function renderTimePicker(name) {
  const hours = Array.from({length:24}, (_,hour) => `<option value="${String(hour).padStart(2,"0")}">${String(hour).padStart(2,"0")}</option>`).join("");
  const minutes = ["00","15","30","45"].map(minute => `<option value="${minute}">${minute}</option>`).join("");
  return `<div class="time-picker"><select name="${name}_h" aria-label="小时" required><option value="">小时</option>${hours}</select><span>时</span><select name="${name}_m" aria-label="分钟" required><option value="">分钟</option>${minutes}</select><span>分</span></div>`;
}

function bindEvents() {
  els.consent.addEventListener("change", () => { els.start.disabled = !els.consent.checked; });
  els.start.addEventListener("click", () => { els.introCard.hidden = true; els.formShell.hidden = false; window.scrollTo({ top:64, behavior:"smooth" }); });
  els.prev.addEventListener("click", () => changeStep(-1));
  els.next.addEventListener("click", () => { if (validateStep()) changeStep(1); });
  els.form.addEventListener("input", event => {
    updateValidationProgress(event.target);
    scheduleDraftSave();
  });
  els.form.addEventListener("change", event => {
    if (["q30","q31"].includes(event.target.name)) enforceExclusiveChecks(event.target);
    scheduleDraftSave();
    if (currentStep === sections.length - 1) updateReview();
  });
  els.form.addEventListener("submit", submitSurvey);
  document.querySelector("#newResponse").addEventListener("click", resetSurvey);
  els.openResearch.addEventListener("click", openResearchView);
  els.leaveResearch.addEventListener("click", leaveResearchView);
  els.researchLoginButton.addEventListener("click", loginResearch);
  els.researchPin.addEventListener("keydown", e => { if (e.key === "Enter") loginResearch(); });
  els.recordSearch.addEventListener("input", renderRecords);
  els.refresh.addEventListener("click", loadResearchRecords);
  els.export.addEventListener("click", exportCsv);
}

function changeStep(delta) {
  currentStep = Math.max(0, Math.min(sections.length - 1, currentStep + delta));
  updateStep();
  window.scrollTo({ top:64, behavior:"smooth" });
}

function updateStep() {
  document.querySelectorAll("[data-section]").forEach((node, i) => { node.hidden = i !== currentStep; });
  els.stepNav.querySelectorAll("li").forEach((node, i) => { node.classList.toggle("active", i === currentStep); node.classList.toggle("complete", i < currentStep); });
  els.progressText.textContent = `${currentStep + 1} / ${sections.length}`;
  els.progressBar.style.width = `${((currentStep + 1) / sections.length) * 100}%`;
  els.prev.hidden = currentStep === 0;
  els.next.hidden = currentStep === sections.length - 1;
  els.submit.hidden = currentStep !== sections.length - 1;
  clearValidationErrors();
  if (currentStep === sections.length - 1) updateReview();
}

function validateStep() {
  clearValidationErrors();
  const section = document.querySelector(`[data-section="${currentStep}"]`);
  const required = [...section.querySelectorAll("[required]")];
  const radioNames = [...new Set(required.filter(x => x.type === "radio").map(x => x.name))];
  const missingTargets = radioNames
    .filter(name => !section.querySelector(`input[name="${name}"]:checked`))
    .map(name => section.querySelector(`input[name="${name}"]`));
  missingTargets.push(...required.filter(x => x.type !== "radio" && !x.value));
  if (currentStep === 6 && !els.form.querySelector('input[name="q30"]:checked')) missingTargets.push(els.form.querySelector('input[name="q30"]'));
  if (currentStep === 6 && !els.form.querySelector('input[name="q31"]:checked')) missingTargets.push(els.form.querySelector('input[name="q31"]'));
  if (currentStep === sections.length - 1 && value("q33") === "yes" && !value("q35").trim()) missingTargets.push(document.querySelector("#q35"));
  if (missingTargets.filter(Boolean).length) return showValidationErrors(missingTargets);
  return true;
}

function showValidationErrors(targets) {
  const questions = [...new Set(targets.filter(Boolean).map(target => target.closest(".question")).filter(Boolean))];
  questions.forEach(question => {
    question.classList.add("has-error");
    if (!question.querySelector(".question-error")) {
      const message = document.createElement("p");
      message.className = "question-error";
      message.setAttribute("role", "alert");
      message.textContent = "此题尚未完成，请补充填写。";
      question.querySelector(".question-title")?.insertAdjacentElement("afterend", message);
    }
  });
  els.error.textContent = `本部分还有 ${questions.length} 题未完成，已用红色标出。`;
  els.error.hidden = false;
  const firstTarget = targets.find(Boolean);
  firstTarget?.focus({ preventScroll:true });
  firstTarget?.closest(".question")?.scrollIntoView({ behavior:"smooth", block:"center" });
  return false;
}

function clearValidationErrors() {
  document.querySelectorAll(".question.has-error").forEach(question => question.classList.remove("has-error"));
  document.querySelectorAll(".question-error").forEach(message => message.remove());
  els.error.hidden = true;
}

function updateValidationProgress(target) {
  const question = target?.closest?.(".question.has-error");
  if (!question || !isQuestionComplete(question)) return;
  question.classList.remove("has-error");
  question.querySelector(".question-error")?.remove();
  const remaining = document.querySelectorAll(`[data-section="${currentStep}"] .question.has-error`).length;
  if (remaining) els.error.textContent = `本部分还有 ${remaining} 题未完成，已用红色标出。`;
  else els.error.hidden = true;
}

function isQuestionComplete(question) {
  const required = [...question.querySelectorAll("[required]")];
  const radioNames = [...new Set(required.filter(input => input.type === "radio").map(input => input.name))];
  if (radioNames.some(name => !question.querySelector(`input[name="${name}"]:checked`))) return false;
  if (required.some(input => input.type !== "radio" && !input.value)) return false;
  for (const name of ["q30", "q31"]) {
    if (question.querySelector(`input[name="${name}"]`) && !question.querySelector(`input[name="${name}"]:checked`)) return false;
  }
  if (question.querySelector("#q35") && value("q33") === "yes" && !value("q35").trim()) return false;
  return true;
}

function scheduleDraftSave() {
  clearTimeout(saveTimer);
  els.saveStatus.textContent = "正在保存草稿…";
  saveTimer = setTimeout(() => { localStorage.setItem(DRAFT_KEY, JSON.stringify(serializeForm())); els.saveStatus.textContent = "草稿已保存在本设备"; }, 350);
}

function restoreDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (!draft) return;
    Object.entries(draft).forEach(([name,val]) => {
      const nodes = els.form.elements[name];
      if (!nodes) return;
      if (nodes instanceof RadioNodeList) [...nodes].forEach(node => {
        node.checked = node.type === "checkbox" ? (Array.isArray(val) ? val.includes(node.value) : String(node.value) === String(val)) : String(node.value) === String(val);
      });
      else nodes.value = val;
    });
    ["q5work","q5free","q7work","q7free"].forEach(name => {
      const combined = String(draft[name] || "");
      const hour = els.form.elements[`${name}_h`];
      const minute = els.form.elements[`${name}_m`];
      if (combined.includes(":") && hour && minute && !hour.value && !minute.value) [hour.value, minute.value] = combined.split(":");
    });
    els.saveStatus.textContent = "已恢复本设备上的草稿";
  } catch {}
}

function serializeForm() {
  const data = {};
  new FormData(els.form).forEach((val,key) => {
    if (Object.prototype.hasOwnProperty.call(data, key)) data[key] = Array.isArray(data[key]) ? [...data[key], val] : [data[key], val];
    else data[key] = val;
  });
  ["q5work","q5free","q7work","q7free"].forEach(name => {
    const hour = data[`${name}_h`];
    const minute = data[`${name}_m`];
    if (hour !== undefined && minute !== undefined) data[name] = `${hour}:${minute}`;
  });
  return data;
}

function value(name) { return String(new FormData(els.form).get(name) || ""); }

function enforceExclusiveChecks(target) {
  const boxes = [...els.form.querySelectorAll(`input[name="${target.name}"]`)];
  const exclusive = target.name === "q31" ? ["none","private"] : ["none"];
  if (exclusive.includes(target.value) && target.checked) boxes.forEach(box => { if (box !== target) box.checked = false; });
  if (!exclusive.includes(target.value) && target.checked) boxes.forEach(box => { if (exclusive.includes(box.value)) box.checked = false; });
}

function updateReview() {
  const box = document.querySelector("#reviewList");
  if (!box) return;
  const answers = serializeForm();
  const sleep = Number(answers.q10h || 0) + Number(answers.q10m || 0) / 60;
  const result = classify(answers);
  box.innerHTML = [
    ["姓名", answers.participantId || "尚未填写"],
    ["近一月平均实际睡眠", sleep ? formatHours(sleep) : "尚未填写"],
    ["日间困倦情境总分", result.essDisplay],
    ["后续联系意愿", labelFor("followup", answers.q33) || "尚未选择"],
  ].map(([a,b]) => `<div class="review-item"><span>${a}</span><strong>${escapeHtml(b)}</strong></div>`).join("");
}

async function submitSurvey(event) {
  event.preventDefault();
  if (!validateStep()) return;
  els.submit.disabled = true;
  els.submit.textContent = "正在提交…";
  const answers = serializeForm();
  answers.participantId = answers.participantId.trim() || `P-${Date.now().toString(36).slice(-6).toUpperCase()}`;
  const result = classify(answers);
  const entry = buildEntry(answers, result);
  try {
    if (IS_LOCAL_PREVIEW) {
      localStorage.setItem("sleep-patterns-preview-response-v3", JSON.stringify({ answers, result, entry }));
      localStorage.removeItem(DRAFT_KEY);
      els.surveyView.hidden = true;
      els.successView.hidden = false;
      els.saveStatus.textContent = "本地预览提交成功（未上传）";
      window.scrollTo({ top:0, behavior:"smooth" });
      return;
    }
    if (!GOOGLE_SCRIPT_URL) throw new Error("研究数据库尚未连接");
    const response = await googleJsonp({ ...entry, action:"submit" });
    if (!response.ok) throw new Error(response.error || "提交失败");
    localStorage.removeItem(DRAFT_KEY);
    els.surveyView.hidden = true;
    els.successView.hidden = false;
    els.saveStatus.textContent = "回答已安全提交";
    window.scrollTo({ top:0, behavior:"smooth" });
  } catch (error) {
    els.error.textContent = `暂时无法提交：${error.message}。草稿仍保存在本设备，请稍后重试。`;
    els.error.hidden = false;
    showToast("提交未完成，草稿没有丢失。 ");
  } finally {
    els.submit.disabled = false;
    els.submit.textContent = "确认并提交";
  }
}

function buildEntry(a, result) {
  const today = new Date().toISOString().slice(0,10);
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    createdAt: new Date().toISOString(), participantId:a.participantId, formDate:today, sleepDate:today,
    bedTime:a.q5work, trySleepTime:addMinutes(a.q5work, Number(a.q6work || 0)), wakeTime:a.q7work, riseTime:a.q7work,
    sleepLatency:a.q6work, napStatus:a.q11, napMinutes:a.q11minutes || "", caffeine:a.q32,
    medication:asArray(a.q31).includes("medication") ? (a.q31detail || "yes") : "no", discomfort:a.q29,
    stress:asArray(a.q30).join("|"), recovery:a.q21, daytimeSleepiness:String(result.essTotal),
    deviceNote: JSON.stringify({ version:"screening-v3", classification:result.classification, criteria:result.criteria, flags:result.flags }),
    additionalNote: JSON.stringify({ version:"screening-v3", answers:a }),
  };
}

function classify(a) {
  const workSleep = estimatedSleep(a.q5work, a.q6work, a.q7work);
  const freeSleep = estimatedSleep(a.q5free, a.q6free, a.q7free);
  const workDays = Number(a.q9);
  const weightedSleep = Number.isFinite(workSleep) && Number.isFinite(freeSleep) && Number.isFinite(workDays)
    ? workDays === 7 ? workSleep : workDays === 0 ? freeSleep : (workSleep * workDays + freeSleep * (7 - workDays)) / 7
    : NaN;
  const selfReportedSleep = Number(a.q10h || 0) + Number(a.q10m || 0) / 60;
  const compensation = Number.isFinite(workSleep) && Number.isFinite(freeSleep) ? freeSleep - workSleep : NaN;
  const essValues = Array.from({length:8}, (_,i) => a[`q15_${i+1}`] === undefined ? null : Number(a[`q15_${i+1}`]));
  const drivingMissing = essValues[6] == null;
  const rawEss = essValues.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  const essTotal = drivingMissing ? Math.round((rawEss * 8 / 7) * 10) / 10 : rawEss;
  const q30 = asArray(a.q30);
  const q31 = asArray(a.q31);
  const r1 = ["often","always"].includes(a.q8free);
  const r2 = Number.isFinite(weightedSleep) && Math.abs(selfReportedSleep - weightedSleep) > 1.5;
  const criteria = {
    C1: ["childhood","adolescent","young_adult"].includes(a.q22),
    C2: Number.isFinite(weightedSleep) && weightedSleep <= 6.5 && Number(a.q20) <= 6.5 && a.q27 === "need_less",
    C3: !r1 && Number.isFinite(compensation) && compensation < 1 && ["never","rare"].includes(a.q11) && a.q12 === "same",
    C4: essTotal <= 6 && ["good","okay"].includes(a.q16) && a.q32 !== "heavy",
    C5: ["good","okay"].includes(a.q16) && ["stable","occasional"].includes(a.q17) && ["none","mild"].includes(a.q18),
    C6: ["same","mild"].includes(a.q13) && ["same","lt1"].includes(a.q14),
    C7: a.q24 === "yes",
  };
  const flags = [];
  if (r1) flags.push("R1：自由日常设闹钟，补偿量不可解释");
  if (r2) flags.push("R2：自报时长与推算时长相差超过 1.5 小时");
  if (["often","nightly"].includes(a.q26_1)) flags.push("入睡困难");
  if (["often","nightly"].includes(a.q26_2)) flags.push("睡眠维持困难");
  if (["cant_sleep","no_time"].includes(a.q27)) flags.push("短睡归因存在强混杂");
  if (["sometimes","often"].includes(a.q28)) flags.push("打鼾 / 憋气线索");
  if (["sometimes","often"].includes(a.q29)) flags.push("腿部不适线索");
  if (!q30.includes("none")) flags.push("近期作息限制 / 应激因素");
  if (q31.some(x => ["condition","medication","private"].includes(x))) flags.push("健康状况或用药需核实");
  if (a.q32 === "heavy") flags.push("较依赖咖啡因维持清醒");
  const hardRed = ["cant_sleep","no_time"].includes(a.q27) || a.q12 === "catchup" || (Number.isFinite(compensation) && compensation >= 1.5) || essTotal >= 11 || a.q16 === "poor" || a.q18 === "marked" || ["often","nightly"].includes(a.q26_1) || ["often","nightly"].includes(a.q26_2) || q30.some(x => ["shift","restriction","stress"].includes(x));
  const coreGreen = [criteria.C1,criteria.C2,criteria.C3,criteria.C4,criteria.C5,criteria.C6].every(Boolean) && !r2 && !q31.some(x => ["condition","medication"].includes(x)) && !["sometimes","often"].includes(a.q28) && !["sometimes","often"].includes(a.q29);
  const classification = hardRed ? "红色：暂不作为候选" : coreGreen ? "绿色：优先候选" : "黄色：需核实";
  return {
    classification, criteria, flags, workSleep, freeSleep, weightedSleep, selfReportedSleep, compensation,
    essTotal, essDisplay:`${essTotal} / 24${drivingMissing ? "（7 项折算）" : ""}`,
  };
}

function estimatedSleep(bedTime, latency, wakeTime) {
  if (!bedTime || !wakeTime) return NaN;
  const sleepStart = addMinutes(bedTime, Number(latency || 0));
  return hoursBetween(sleepStart, wakeTime);
}

function hoursBetween(startTime, endTime) {
  if (!startTime || !endTime) return NaN;
  const [sh,sm] = startTime.split(":").map(Number); const [eh,em] = endTime.split(":").map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm); if (diff < 0) diff += 1440;
  return diff / 60;
}

function asArray(value) { return Array.isArray(value) ? value : value ? [value] : []; }

function addMinutes(time, minutes) {
  if (!time || !Number.isFinite(minutes)) return time || "";
  const [h,m] = time.split(":").map(Number); const total = (h*60+m+minutes) % 1440;
  return `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;
}

function resetSurvey() {
  els.form.reset(); currentStep = 0; localStorage.removeItem(DRAFT_KEY);
  els.successView.hidden = true; els.surveyView.hidden = false; els.introCard.hidden = false; els.formShell.hidden = true; els.consent.checked = false; els.start.disabled = true; els.saveStatus.textContent = "回答仅用于科研"; updateStep(); window.scrollTo({top:0});
}

function openResearchView() {
  location.hash = "research";
  els.surveyView.hidden = true; els.successView.hidden = true; els.researchView.hidden = false; els.saveStatus.textContent = "研究端数据受 PIN 保护"; window.scrollTo({top:0});
}
function leaveResearchView() { history.replaceState(null,"",location.pathname); els.researchView.hidden = true; els.surveyView.hidden = false; els.saveStatus.textContent = "回答仅用于科研"; window.scrollTo({top:0}); }

async function loginResearch() {
  researchPin = els.researchPin.value.trim();
  if (!researchPin) { showLoginError("请输入研究端 PIN。"); return; }
  await loadResearchRecords();
}

async function loadResearchRecords() {
  if (IS_LOCAL_PREVIEW) { showLoginError("本地预览不会连接或读取共享研究数据。发布后研究端入口才会启用。"); return; }
  if (!GOOGLE_SCRIPT_URL) { showLoginError("研究数据库尚未连接。"); return; }
  els.refresh.disabled = true; els.researchLoginButton.disabled = true;
  try {
    const payload = await googleJsonp({ action:"list", pin:researchPin });
    if (!payload.ok) throw new Error(payload.error || "PIN 不正确");
    records = (payload.records || []).map(parseRecord).filter(Boolean);
    els.researchLogin.hidden = true; els.dashboard.hidden = false; els.loginError.hidden = true; renderRecords();
  } catch (error) { showLoginError(`无法读取记录：${error.message}`); }
  finally { els.refresh.disabled = false; els.researchLoginButton.disabled = false; }
}

function parseRecord(record) {
  try {
    const note = JSON.parse(String(record.additionalNote || "{}"));
    if (note.version !== "screening-v3" || !note.answers) return null;
    const result = classify(note.answers);
    return { ...record, answers:note.answers, result };
  } catch { return null; }
}

function renderRecords() {
  const query = els.recordSearch.value.trim().toLowerCase();
  const shown = records.filter(r => !query || String(r.participantId).toLowerCase().includes(query));
  els.responseCount.textContent = records.length;
  els.candidateCount.textContent = records.filter(r => r.result.classification.startsWith("绿色")).length;
  if (!shown.length) { els.recordCards.innerHTML = `<div class="empty">${records.length ? "没有匹配的姓名。" : "尚未读取到新版初筛问卷记录。"}</div>`; return; }
  els.recordCards.innerHTML = shown.map(record => {
    const r = record.result; const a = record.answers; const badge = r.classification.startsWith("绿色") ? "high" : r.classification.startsWith("红色") ? "exclude" : "review";
    const criteriaText = Object.entries(r.criteria).map(([key,ok]) => `${key} ${ok ? "✓" : "—"}`).join("　");
    return `<article class="record-card"><div class="record-summary"><div><strong>${escapeHtml(record.participantId || "未填写姓名")}</strong><span>${formatDate(record.createdAt)}</span></div><div><span>判读</span><b class="screening-badge ${badge}">${r.classification}</b></div><div><span>一周加权 eTST</span><b>${formatHours(r.weightedSleep)}</b></div><div><span>自由日补偿量</span><b>${formatSignedHours(r.compensation)}</b></div><div><span>困倦总分</span><b>${r.essDisplay}</b></div></div><details class="record-details"><summary>查看关键回答与复核线索</summary><div class="detail-grid">${detail("C1–C7", criteriaText)}${detail("复核线索", r.flags.join("；") || "未见明显混杂")}${detail("固定安排日 eTST", formatHours(r.workSleep))}${detail("自由作息日 eTST", formatHours(r.freeSleep))}${detail("自报平均时长", formatHours(r.selfReportedSleep))}${detail("模式起源", labelFor("onset",a.q22))}${detail("与家人相比", labelFor("familyCompare",a.q23))}${detail("家族短睡", labelFor("family",a.q24))}${detail("短睡后状态", labelFor("shortDay",a.q13))}${detail("恢复睡眠", labelFor("rebound",a.q14))}${detail("联系意愿", labelFor("followup",a.q33))}${detail("联系方式", a.q35 || "未提供")}</div></details></article>`;
  }).join("");
}

function detail(label, value) { return `<div><b>${label}</b>${escapeHtml(value || "—")}</div>`; }
function showLoginError(message) { els.loginError.textContent = message; els.loginError.hidden = false; }

function exportCsv() {
  if (!records.length) return showToast("当前没有可导出的新版记录。");
  const headers = ["姓名","提交时间","初筛分类","固定安排日eTST","自由作息日eTST","一周加权eTST","补偿量","困倦总分","复核线索","联系意愿","联系方式",...Array.from({length:35},(_,i)=>`Q${i+1}`)];
  const rows = records.map(r => { const a=r.answers; const q = Array.from({length:35},(_,i) => questionValue(a,i+1)); return [r.participantId,r.createdAt,r.result.classification,r.result.workSleep,r.result.freeSleep,r.result.weightedSleep,r.result.compensation,r.result.essTotal,r.result.flags.join("；"),a.q33,a.q35,...q]; });
  const csv = [headers,...rows].map(row => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob(["\ufeff"+csv], {type:"text/csv;charset=utf-8"}); const url=URL.createObjectURL(blob); const link=document.createElement("a"); link.href=url; link.download=`睡眠初筛记录_${new Date().toISOString().slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(url);
}

function questionValue(a, n) {
  if ([5,6,7,8].includes(n)) return [a[`q${n}work`] || "",a[`q${n}free`] || ""].join("|");
  if (n === 10) return `${a.q10h || 0}h${a.q10m || 0}m`;
  if (n === 11) return [a.q11 || "",a.q11minutes || ""].join("|");
  if (n === 15) return Array.from({length:8},(_,j)=>a[`q15_${j+1}`] ?? "").join("|");
  if (n === 24) return [a.q24 || "",a.q24count || "",a.q24relation || ""].join("|");
  if (n === 26) return [a.q26_1 || "",a.q26_2 || ""].join("|");
  if (n === 30) return asArray(a.q30).join("|");
  if (n === 31) return [asArray(a.q31).join("+"),a.q31detail || ""].join("|");
  return a[`q${n}`] || "";
}

function googleJsonp(params) {
  return new Promise((resolve,reject) => {
    const callbackName = `sleepScreenCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script"); const url = new URL(GOOGLE_SCRIPT_URL);
    Object.entries(params).forEach(([key,val]) => url.searchParams.set(key, val == null ? "" : String(val))); url.searchParams.set("callback",callbackName);
    const timer=setTimeout(()=>{cleanup();reject(new Error("连接超时"));},20000);
    function cleanup(){clearTimeout(timer);script.remove();delete window[callbackName];}
    window[callbackName]=payload=>{cleanup();resolve(payload||{});}; script.onerror=()=>{cleanup();reject(new Error("网络连接失败"));}; script.src=url.toString(); document.head.appendChild(script);
  });
}

function labelFor(group, code) { return options[group]?.find(([v]) => v === code)?.[1] || code || ""; }
function formatHours(hours) { const n=Number(hours); if(!Number.isFinite(n)) return "—"; const h=Math.floor(n); const m=Math.round((n-h)*60); return `${h} 小时${m ? ` ${m} 分` : ""}`; }
function formatSignedHours(hours) { const n=Number(hours); if(!Number.isFinite(n)) return "—"; const sign=n>0?"+":n<0?"−":""; return `${sign}${formatHours(Math.abs(n))}`; }
function formatDate(value) { const date=new Date(value); return Number.isNaN(date.getTime()) ? String(value||"") : date.toLocaleString("zh-CN",{hour12:false}); }
function csvCell(value) { const s=String(value??""); return /[",\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s; }
function escapeHtml(value) { return String(value??"").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function showToast(message) { els.toast.textContent=message; els.toast.classList.add("show"); setTimeout(()=>els.toast.classList.remove("show"),2800); }
