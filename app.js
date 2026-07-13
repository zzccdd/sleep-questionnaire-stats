const CONFIG = window.SLEEP_REPORT_CONFIG || {};
const GOOGLE_SCRIPT_URL = String(CONFIG.googleScriptUrl || "").trim();
const IS_LOCAL_PREVIEW = location.protocol === "file:";
const DRAFT_KEY = "sleep-patterns-screening-draft-v1";
const SECTION_TITLES = ["基本信息", "有安排日作息", "自由日作息", "睡眠时长与醒来", "周末与假期变化", "日间状态", "主观睡眠感受", "模式起源", "睡眠与健康", "后续参与"];

const options = {
  gender: [["male","男"],["female","女"],["other","其他 / 不愿透露"]],
  identity: [["fulltime","全职工作"],["parttime","兼职"],["student","在读学生"],["retired","退休"],["other","其他"]],
  hand: [["right","右手"],["left","左手"],["both","双手"]],
  wakeMethod: [["natural","大多自然醒"],["alarm","大多靠闹钟 / 被叫醒"],["mixed","两者都有"]],
  alarm: [["never","从不"],["sometimes","偶尔"],["often","经常"],["always","总是"]],
  riseEase: [["easy","很轻松，立刻清醒"],["average","一般"],["difficult","有点困难，需要赖床"],["very_difficult","很困难"]],
  nap: [["never","从不"],["rare","偶尔（每周 <1 次）"],["sometimes","有时（每周 1–3 次）"],["often","经常（几乎每天）"]],
  weekendMore: [["same","基本一样"],["lt30","多睡不到半小时"],["30to60","多睡约半小时到 1 小时"],["1to2","多睡 1–2 小时"],["gt2","多睡 2 小时以上"]],
  holiday: [["same","作息基本和平时一样"],["slightly","会稍微多睡一点"],["catchup","会明显补觉、睡到很晚"]],
  sleepDebt: [["none","几乎没有"],["sometimes","偶尔"],["often","经常"]],
  daytime: [["excellent","很好，一整天都很清醒"],["good","良好"],["average","一般，偶有犯困"],["poor","较差，经常感到困倦"]],
  impact: [["none","没有影响"],["mild","轻微影响"],["marked","明显影响"]],
  satisfaction: [["very_satisfied","很满意"],["satisfied","比较满意"],["average","一般"],["dissatisfied","不太满意"],["very_dissatisfied","很不满意"]],
  wantMore: [["no","不想，现在的时长刚好"],["indifferent","无所谓"],["yes","想多睡一些"],["very_yes","很想多睡"]],
  refreshed: [["refreshed","神清气爽、休息充分"],["okay","还算可以"],["tired","没睡够、仍感疲惫"]],
  onset: [["childhood","从小 / 儿童期起"],["adolescent","青少年期起"],["adult","成年后某一阶段起"],["recent","最近一两年才这样"]],
  stable: [["stable","基本一直如此"],["changed","有过较大变化"]],
  family: [["yes","有"],["no","没有"],["unknown","不清楚"]],
  frequency4: [["never","从不"],["sometimes","偶尔"],["often","经常"],["nightly","几乎每晚"]],
  insomniaWhy: [["cant_sleep","想睡却睡不着"],["need_less","不需要那么多睡眠"],["mixed","两种情况都有 / 说不清"]],
  apnea: [["none","无"],["sometimes","偶有"],["often","经常"],["unknown","不清楚"]],
  threeFreq: [["none","无"],["sometimes","偶有"],["often","经常"]],
  shift: [["no","否"],["sometimes","是，偶尔"],["often","是，经常"]],
  yesNo: [["no","否"],["yes","是"]],
  caffeine: [["none","几乎不需要"],["sometimes","偶尔"],["daily","每天适量"],["heavy","大量依赖以保持清醒"]],
  condition: [["none","无"],["yes","有"],["private","不愿透露"]],
  followup: [["yes","愿意"],["unsure","暂不确定"],["no","不愿意"]],
};

const sections = [
  { intro: "以下信息用于描述样本特征。研究编号可由研究团队提供；若留空，系统会自动生成匿名编号。", fields: [
    field("participantId", "研究编号（如有）", "text", { required:false, placeholder:"例如 S001；可留空" }),
    field("q1", "Q1. 您的年龄", "number", { min:18, max:100, unit:"岁" }),
    radio("q2", "Q2. 您的性别", options.gender), radio("q3", "Q3. 您目前的主要身份", options.identity),
    radio("q4", "Q4. 您惯用哪只手写字？", options.hand), field("q5", "Q5. 您常住的地区 / 时区", "text", { placeholder:"例如：东京 / UTC+9" }),
  ]},
  { intro: "请按通常需要上班、上学或有固定安排的日子回答。", fields: [
    field("q6", "Q6. 您通常几点上床准备睡觉？", "time"), field("q7", "Q7. 上床后，通常需要多久才真正睡着？", "number", { min:0, max:300, unit:"分钟" }),
    field("q8", "Q8. 您通常几点醒来？", "time"), radio("q9", "Q9. 您是靠什么方式醒来的？", options.wakeMethod),
    field("q10", "Q10. 醒来后，通常几点真正起床离开床铺？", "time"), field("q11", "Q11. 一周中大约有几天是这种“有安排”的作息？", "number", { min:0, max:7, unit:"天" }),
  ]},
  { intro: "请按没有固定安排、可以自由作息的日子（如周末、假期）回答。", fields: [
    field("q12", "Q12. 您通常几点上床？", "time"), field("q13", "Q13. 您通常几点自然醒来（不被闹钟或他人打扰）？", "time"),
    radio("q14", "Q14. 在自由的日子里，您会设闹钟吗？", options.alarm), field("q15", "Q15. 这类日子里您几点真正起床？", "time"),
  ]},
  { intro: "请综合近一个月的情况，填写实际睡着的时长与醒来感受。", fields: [
    duration("q16", "Q16. 过去一个月，平均每晚“实际睡着”的时间大约是"),
    field("q17", "Q17. 如果完全不设闹钟、也没有人打扰，一觉自然睡到醒通常会睡多久？", "number", { min:1, max:16, step:.25, unit:"小时" }),
    radio("q18", "Q18. 早上醒来后，您起床的感觉通常是：", options.riseEase), radio("q19", "Q19. 过去一个月，您是否会在白天小睡（打盹）？", options.nap),
  ]},
  { intro: "这部分关注自由日与有安排日之间的睡眠变化。", fields: [
    radio("q20", "Q20. 和工作日相比，您在周末 / 休息日通常会睡得更久吗？", options.weekendMore),
    radio("q21", "Q21. 如果遇到长假，可以随便睡，您会怎样？", options.holiday),
    radio("q22", "Q22. 您是否有过“睡眠不足需要找机会补回来”的感觉？", options.sleepDebt),
  ]},
  { intro: "请评估日常情境中打瞌睡或睡着的可能性：0 从不会，1 很少，2 有时，3 很可能。", fields: [
    ess(), radio("q24", "Q24. 总体而言，您白天的精力和注意力状态如何？", options.daytime),
    radio("q25", "Q25. 您是否觉得睡眠状况正在影响工作 / 学习 / 生活？", options.impact),
  ]},
  { intro: "请按自己的真实感受回答，不需要追求某种“正确”睡眠时长。", fields: [
    radio("q26", "Q26. 总体而言，您对自己目前的睡眠时长满意吗？", options.satisfaction),
    field("q27", "Q27. 您觉得每晚大约需要睡多少小时，第二天才会状态良好？", "number", { min:1, max:16, step:.25, unit:"小时" }),
    radio("q28", "Q28. 如果时间允许，您想不想每晚睡得更久一些？", options.wantMore), radio("q29", "Q29. 早晨醒来时，您通常感觉：", options.refreshed),
  ]},
  { intro: "请回顾这种睡眠模式出现的时间、稳定性和家族情况。", fields: [
    radio("q30", "Q30. 您目前这种睡眠模式（时长、作息）大约从什么时候开始？", options.onset),
    radio("q31", "Q31. 从您记事起，睡眠时长是否一直比较稳定？", options.stable),
    radio("q32", "Q32. 直系亲属中，有没有人睡得特别少、但白天精神很好？", options.family),
    radio("q33", "Q33. 直系亲属中，有没有人睡眠时间明显偏长？", options.family),
  ]},
  { intro: "以下问题帮助研究团队识别可能影响睡眠的其他因素。健康相关回答只用于研究判读。", fields: [
    radio("q34", "Q34. 过去一个月，是否经常难以入睡（躺下后超过 30 分钟才睡着）？", options.frequency4),
    radio("q35", "Q35. 是否经常夜间醒来，或早醒后难以再次入睡？", options.frequency4),
    radio("q36", "Q36. 当您睡得比平时少时，是因为“想睡却睡不着”，还是“不需要那么多睡眠”？", options.insomniaWhy),
    radio("q37", "Q37. 您或同住者是否注意到您睡觉时打鼾严重，或有短暂憋气 / 呼吸停顿？", options.apnea),
    radio("q38", "Q38. 入睡前，腿是否常有难受、必须活动才能缓解的感觉？", options.threeFreq),
    radio("q39", "Q39. 您目前的工作 / 学习是否需要轮班、上夜班，或经常跨时区？", options.shift),
    radio("q40", "Q40. 您是否长期服用会影响睡眠的药物（如安眠药、镇静剂、兴奋剂等）？", options.yesNo),
    field("q40detail", "若是，可填写药物名称或类型（选填）", "text", { required:false, placeholder:"请勿填写不必要的身份信息" }),
    radio("q41", "Q41. 您平时靠咖啡、浓茶、能量饮料等提神的程度如何？", options.caffeine),
    radio("q42", "Q42. 您目前是否有已知的、可能影响睡眠的躯体或精神健康状况？", options.condition),
    field("q42detail", "若愿意，可简要说明（选填）", "text", { required:false, placeholder:"可留空" }),
    radio("q43", "Q43. 近期（3 个月内）是否经历重大生活变化或持续高压，导致作息明显改变？", options.yesNo),
  ]},
  { intro: "提交前请确认联系意愿。选择“不愿意”不会影响本次问卷的使用。", fields: [
    radio("q44", "Q44. 如果符合后续研究条件，是否愿意被联系，进一步了解相关环节？", options.followup),
    field("q45", "Q45. 若愿意，请留下一种方便联系的方式（邮箱 / 电话）", "text", { required:false, placeholder:"仅在愿意联系时填写" }),
    { type:"review" },
  ]},
];

function field(name, label, type, extra={}) { return { type:"field", name, label, inputType:type, required: extra.required !== false, ...extra }; }
function radio(name, label, choices) { return { type:"radio", name, label, choices, required:true }; }
function duration(name, label) { return { type:"duration", name, label, required:true }; }
function ess() { return { type:"ess", name:"q23", label:"Q23. 日常情境中的打瞌睡可能性" }; }

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
  if (item.type === "duration") return `<div class="question"><label class="question-title">${item.label} <em>*</em></label><div class="field-row"><label class="field"><span>小时</span><input name="${item.name}h" type="number" min="0" max="16" required /></label><label class="field"><span>分钟</span><select name="${item.name}m" required><option value="">请选择</option><option value="0">0 分钟</option><option value="15">15 分钟</option><option value="30">30 分钟</option><option value="45">45 分钟</option></select></label></div></div>`;
  if (item.type === "ess") {
    const scenes = ["坐着安静阅读时","看电视或长时间看屏幕时","在公共场合安静坐着时","乘车连续约一小时（非驾驶）时","下午有条件躺下休息时","午饭后安静坐着（未饮酒）时","开车途中堵车或等红灯时","与人面对面交谈时"];
    return `<fieldset class="question"><legend class="question-title">${item.label} <em>*</em></legend><div class="ess-grid"><div class="ess-row ess-head"><span>情境</span><span>0</span><span>1</span><span>2</span><span>3</span></div>${scenes.map((scene,i) => `<div class="ess-row"><span>${scene}</span>${[0,1,2,3].map(v => `<label aria-label="${scene}：${v} 分"><input type="radio" name="q23_${i+1}" value="${v}" required /></label>`).join("")}</div>`).join("")}</div></fieldset>`;
  }
  if (item.type === "review") return `<div class="question"><h3>提交前确认</h3><div id="reviewList" class="review-list"></div><div class="privacy-callout">提交后，研究者会依据内部规则进行初筛。受试者页面不会显示候选类别，且初筛结果不能替代医学诊断。</div></div>`;
  const attrs = [`name="${item.name}"`, `type="${item.inputType}"`, item.required ? "required" : "", item.min != null ? `min="${item.min}"` : "", item.max != null ? `max="${item.max}"` : "", item.step != null ? `step="${item.step}"` : "", item.placeholder ? `placeholder="${item.placeholder}"` : ""].filter(Boolean).join(" ");
  return `<div class="question"><label class="question-title" for="${item.name}">${item.label}${item.required ? " <em>*</em>" : ""}</label><div class="inline-unit"><input id="${item.name}" ${attrs} />${item.unit ? `<span>${item.unit}</span>` : ""}</div></div>`;
}

function bindEvents() {
  els.consent.addEventListener("change", () => { els.start.disabled = !els.consent.checked; });
  els.start.addEventListener("click", () => { els.introCard.hidden = true; els.formShell.hidden = false; window.scrollTo({ top:64, behavior:"smooth" }); });
  els.prev.addEventListener("click", () => changeStep(-1));
  els.next.addEventListener("click", () => { if (validateStep()) changeStep(1); });
  els.form.addEventListener("input", scheduleDraftSave);
  els.form.addEventListener("change", () => { scheduleDraftSave(); if (currentStep === 9) updateReview(); });
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
  els.error.hidden = true;
  if (currentStep === 9) updateReview();
}

function validateStep() {
  const section = document.querySelector(`[data-section="${currentStep}"]`);
  const required = [...section.querySelectorAll("[required]")];
  const radioNames = [...new Set(required.filter(x => x.type === "radio").map(x => x.name))];
  const missingRadio = radioNames.find(name => !section.querySelector(`input[name="${name}"]:checked`));
  const missingField = required.find(x => x.type !== "radio" && !x.value);
  if (missingRadio || missingField) {
    const target = missingField || section.querySelector(`input[name="${missingRadio}"]`);
    els.error.textContent = "请完成本部分所有带 * 的问题后再继续。";
    els.error.hidden = false;
    target?.focus();
    target?.closest(".question")?.scrollIntoView({ behavior:"smooth", block:"center" });
    return false;
  }
  if (currentStep === 9 && value("q44") === "yes" && !value("q45").trim()) {
    els.error.textContent = "您选择了愿意联系，请填写邮箱或电话；也可以改选“暂不确定”。";
    els.error.hidden = false;
    document.querySelector("#q45")?.focus();
    return false;
  }
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
      if (nodes instanceof RadioNodeList) [...nodes].forEach(node => { node.checked = String(node.value) === String(val); });
      else nodes.value = val;
    });
    els.saveStatus.textContent = "已恢复本设备上的草稿";
  } catch {}
}

function serializeForm() {
  const data = {};
  new FormData(els.form).forEach((val,key) => { data[key] = val; });
  return data;
}

function value(name) { return String(new FormData(els.form).get(name) || ""); }

function updateReview() {
  const box = document.querySelector("#reviewList");
  if (!box) return;
  const answers = serializeForm();
  const sleep = Number(answers.q16h || 0) + Number(answers.q16m || 0) / 60;
  const essTotal = Array.from({length:8}, (_,i) => Number(answers[`q23_${i+1}`] || 0)).reduce((a,b) => a+b, 0);
  box.innerHTML = [
    ["研究编号", answers.participantId || "提交时自动生成"],
    ["近一月平均实际睡眠", sleep ? formatHours(sleep) : "尚未填写"],
    ["日间困倦情境总分", `${essTotal} / 24`],
    ["后续联系意愿", labelFor("followup", answers.q44) || "尚未选择"],
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
      localStorage.setItem("sleep-patterns-preview-response-v1", JSON.stringify({ answers, result, entry }));
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
  const essTotal = result.essTotal;
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    createdAt: new Date().toISOString(), participantId:a.participantId, formDate:today, sleepDate:today,
    bedTime:a.q6, trySleepTime:addMinutes(a.q6, Number(a.q7 || 0)), wakeTime:a.q8, riseTime:a.q10,
    sleepLatency:a.q7, napStatus:a.q19, caffeine:a.q41, medication:a.q40, discomfort:a.q42, stress:a.q43,
    sleepQuality:a.q26, recovery:a.q29, daytimeSleepiness:String(essTotal),
    deviceNote: JSON.stringify({ version:"screening-v1", classification:result.classification, flags:result.flags }),
    additionalNote: JSON.stringify({ version:"screening-v1", answers:a }),
  };
}

function classify(a) {
  const sleepHours = Number(a.q16h || 0) + Number(a.q16m || 0) / 60;
  const naturalHours = Number(a.q17 || 0);
  const essTotal = Array.from({length:8}, (_,i) => Number(a[`q23_${i+1}`] || 0)).reduce((x,y) => x+y, 0);
  const exclusions = [];
  if (["often","nightly"].includes(a.q34)) exclusions.push("入睡困难");
  if (["often","nightly"].includes(a.q35)) exclusions.push("夜醒或早醒");
  if (a.q36 === "cant_sleep") exclusions.push("想睡却睡不着");
  if (a.q37 === "often") exclusions.push("睡眠呼吸暂停线索");
  if (a.q38 === "often") exclusions.push("不宁腿线索");
  if (a.q39 === "often") exclusions.push("经常轮班或跨时区");
  if (a.q41 === "heavy") exclusions.push("大量依赖兴奋性饮料");
  if (a.q43 === "yes") exclusions.push("近期应激或作息剧变");
  const reviewFlags = [];
  if (a.q40 === "yes") reviewFlags.push("影响睡眠的长期用药");
  if (a.q42 === "yes") reviewFlags.push("可能影响睡眠的健康状况");
  const core = sleepHours <= 6.5 && naturalHours <= 6.5 && ["same","lt30","30to60"].includes(a.q20) && a.q21 !== "catchup" && a.q22 === "none" && essTotal <= 6 && ["excellent","good"].includes(a.q24) && a.q25 === "none" && ["very_satisfied","satisfied"].includes(a.q26) && ["no","indifferent"].includes(a.q28) && a.q29 !== "tired";
  const lifelong = ["childhood","adolescent"].includes(a.q30) && a.q31 === "stable";
  let classification = "需人工复核";
  if (exclusions.length) classification = "排除 / 医学评估";
  else if (core && lifelong) classification = "高优先候选";
  else if (sleepHours <= 6.5 && naturalHours <= 7 && essTotal <= 9) classification = "可能候选";
  return { classification, essTotal, sleepHours, naturalHours, flags:[...exclusions, ...reviewFlags], core, lifelong };
}

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
    if (note.version !== "screening-v1" || !note.answers) return null;
    const result = classify(note.answers);
    return { ...record, answers:note.answers, result };
  } catch { return null; }
}

function renderRecords() {
  const query = els.recordSearch.value.trim().toLowerCase();
  const shown = records.filter(r => !query || String(r.participantId).toLowerCase().includes(query));
  els.responseCount.textContent = records.length;
  els.candidateCount.textContent = records.filter(r => r.result.classification === "高优先候选").length;
  if (!shown.length) { els.recordCards.innerHTML = `<div class="empty">${records.length ? "没有匹配的研究编号。" : "尚未读取到新版初筛问卷记录。"}</div>`; return; }
  els.recordCards.innerHTML = shown.map(record => {
    const r = record.result; const a = record.answers; const badge = r.classification === "高优先候选" ? "high" : r.classification.includes("排除") ? "exclude" : "review";
    return `<article class="record-card"><div class="record-summary"><div><strong>${escapeHtml(record.participantId || "未编号")}</strong><span>${formatDate(record.createdAt)}</span></div><div><span>判读</span><b class="screening-badge ${badge}">${r.classification}</b></div><div><span>习惯性睡眠</span><b>${formatHours(r.sleepHours)}</b></div><div><span>自然睡眠</span><b>${formatHours(r.naturalHours)}</b></div><div><span>困倦总分</span><b>${r.essTotal} / 24</b></div></div><details class="record-details"><summary>查看关键回答与复核线索</summary><div class="detail-grid">${detail("排除 / 复核线索", r.flags.join("；") || "未见强阳性")}${detail("起源", labelFor("onset",a.q30))}${detail("长期稳定", labelFor("stable",a.q31))}${detail("周末补偿", labelFor("weekendMore",a.q20))}${detail("长假变化", labelFor("holiday",a.q21))}${detail("补觉需求", labelFor("sleepDebt",a.q22))}${detail("白天精力", labelFor("daytime",a.q24))}${detail("睡眠满意度", labelFor("satisfaction",a.q26))}${detail("家族短睡", labelFor("family",a.q32))}${detail("联系意愿", labelFor("followup",a.q44))}${detail("联系方式", a.q45 || "未提供")}</div></details></article>`;
  }).join("");
}

function detail(label, value) { return `<div><b>${label}</b>${escapeHtml(value || "—")}</div>`; }
function showLoginError(message) { els.loginError.textContent = message; els.loginError.hidden = false; }

function exportCsv() {
  if (!records.length) return showToast("当前没有可导出的新版记录。");
  const headers = ["研究编号","提交时间","初筛分类","习惯性睡眠小时","自然睡眠小时","困倦总分","复核线索","联系意愿","联系方式",...Array.from({length:45},(_,i)=>`Q${i+1}`)];
  const rows = records.map(r => { const a=r.answers; const q = Array.from({length:45},(_,i) => { const n=i+1; if(n===16) return `${a.q16h || 0}h${a.q16m || 0}m`; if(n===23) return Array.from({length:8},(_,j)=>a[`q23_${j+1}`]||"").join("|"); return a[`q${n}`] || ""; }); return [r.participantId,r.createdAt,r.result.classification,r.result.sleepHours,r.result.naturalHours,r.result.essTotal,r.result.flags.join("；"),a.q44,a.q45,...q]; });
  const csv = [headers,...rows].map(row => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob(["\ufeff"+csv], {type:"text/csv;charset=utf-8"}); const url=URL.createObjectURL(blob); const link=document.createElement("a"); link.href=url; link.download=`睡眠初筛记录_${new Date().toISOString().slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(url);
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
function formatDate(value) { const date=new Date(value); return Number.isNaN(date.getTime()) ? String(value||"") : date.toLocaleString("zh-CN",{hour12:false}); }
function csvCell(value) { const s=String(value??""); return /[",\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s; }
function escapeHtml(value) { return String(value??"").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function showToast(message) { els.toast.textContent=message; els.toast.classList.add("show"); setTimeout(()=>els.toast.classList.remove("show"),2800); }
