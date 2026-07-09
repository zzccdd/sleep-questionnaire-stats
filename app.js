const STORAGE_KEY = "sleep-questionnaire-stats-v1";
const PARTICIPANT_KEY = "sleep-questionnaire-participant-id-v1";
const CONFIG = window.SLEEP_REPORT_CONFIG || {};
const BACKEND_MODE =
  CONFIG.backend || (location.protocol === "file:" ? "local" : "node");
const GOOGLE_SCRIPT_URL = String(CONFIG.googleScriptUrl || "").trim();
const API_ENDPOINT =
  BACKEND_MODE === "node" && location.protocol !== "file:" ? "/api/reports" : "";

const qualityLabels = ["很差", "较差", "一般", "较好", "很好"];
const yesNoLabels = { yes: "有", no: "无", unknown: "不确定" };
const watchLabels = {
  all: "整晚佩戴",
  partial: "部分佩戴",
  forgot: "忘记佩戴",
  removed: "半夜取下",
  unknown: "不确定",
};
const padLabels = {
  normal: "正常",
  moved: "可能移动",
  offline: "断电/断网",
  unknown: "不确定",
};
const environmentLabels = {
  noise: "噪音",
  light: "光线",
  temperature: "温度",
  place: "换地点",
  sharedBed: "同床",
  pet: "宠物",
};

let records = loadRecords();
let useServer = false;
let adminPin = sessionStorage.getItem("sleep-report-admin-pin") || "";
let adminRequired = false;
let rememberedParticipantId = localStorage.getItem(PARTICIPANT_KEY) || "";

const els = {
  tabs: [...document.querySelectorAll(".nav-tab")],
  viewButtons: [...document.querySelectorAll("[data-view-target]")],
  views: {
    dashboard: document.querySelector("#dashboardView"),
    entry: document.querySelector("#entryView"),
    records: document.querySelector("#recordsView"),
  },
  form: document.querySelector("#sleepForm"),
  modeBanner: document.querySelector("#modeBanner"),
  adminGate: document.querySelector("#adminGate"),
  adminGateTitle: document.querySelector("#adminGateTitle"),
  adminGateText: document.querySelector("#adminGateText"),
  adminPinInput: document.querySelector("#adminPinInput"),
  adminLogin: document.querySelector("#adminLogin"),
  adminLogout: document.querySelector("#adminLogout"),
  submitSuccess: document.querySelector("#submitSuccess"),
  participantMemory: document.querySelector("#participantMemory"),
  changeParticipant: document.querySelector("#changeParticipant"),
  toast: document.querySelector("#toast"),
  filterParticipant: document.querySelector("#filterParticipant"),
  filterStart: document.querySelector("#filterStart"),
  filterEnd: document.querySelector("#filterEnd"),
  clearFilters: document.querySelector("#clearFilters"),
  rangeLabel: document.querySelector("#rangeLabel"),
  storageStatus: document.querySelector("#storageStatus"),
  metrics: {
    subjects: document.querySelector("#metricSubjects"),
    count: document.querySelector("#metricCount"),
    duration: document.querySelector("#metricDuration"),
    efficiency: document.querySelector("#metricEfficiency"),
    quality: document.querySelector("#metricQuality"),
  },
  trendChart: document.querySelector("#trendChart"),
  qualityChart: document.querySelector("#qualityChart"),
  factorList: document.querySelector("#factorList"),
  insights: document.querySelector("#insights"),
  participantBody: document.querySelector("#participantBody"),
  recordsBody: document.querySelector("#recordsBody"),
  loadDemo: document.querySelector("#loadDemo"),
  copyLink: document.querySelector("#copyLink"),
  exportCsv: document.querySelector("#exportCsv"),
  csvImport: document.querySelector("#csvImport"),
  clearAll: document.querySelector("#clearAll"),
};

init();

function init() {
  const today = new Date().toISOString().slice(0, 10);
  els.form.elements.formDate.value = today;
  els.form.elements.sleepDate.value = today;
  applyRememberedParticipant();

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });
  els.viewButtons.forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.viewTarget));
  });

  els.form.addEventListener("submit", handleSubmit);
  els.changeParticipant.addEventListener("click", clearRememberedParticipant);
  els.adminLogin.addEventListener("click", handleAdminLogin);
  els.adminLogout.addEventListener("click", handleAdminLogout);
  els.adminPinInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") handleAdminLogin();
  });
  els.clearFilters.addEventListener("click", () => {
    els.filterParticipant.value = "";
    els.filterStart.value = "";
    els.filterEnd.value = "";
    render();
  });
  [els.filterParticipant, els.filterStart, els.filterEnd].forEach((input) => {
    input.addEventListener("input", render);
  });
  els.loadDemo.addEventListener("click", loadDemoData);
  els.copyLink.addEventListener("click", copyPublicLink);
  els.exportCsv.addEventListener("click", exportCsv);
  els.csvImport.addEventListener("change", importCsv);
  els.clearAll.addEventListener("click", clearAllRecords);

  switchView("entry");
  updateModeBanner();
  updateAdminGate();
  render();
  syncFromServer();
}

function switchView(viewName) {
  Object.entries(els.views).forEach(([name, view]) => {
    view.classList.toggle("active-view", name === viewName);
  });
  els.tabs.forEach((tab) => {
    const active = tab.dataset.view === viewName;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-pressed", String(active));
  });
  document.body.dataset.view = viewName;
  if (viewName !== "entry") syncFromServer();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function handleSubmit(event) {
  event.preventDefault();
  const formData = new FormData(els.form);
  const entry = Object.fromEntries(formData.entries());
  delete entry.rememberParticipant;
  entry.environment = formData.getAll("environment");
  entry.id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  entry.createdAt = new Date().toISOString();

  normalizeRecord(entry);
  if (formData.get("rememberParticipant")) {
    rememberParticipant(entry.participantId);
  } else {
    forgetParticipant();
  }
  await addRecord(entry);
  els.form.reset();
  els.form.elements.formDate.value = new Date().toISOString().slice(0, 10);
  els.form.elements.sleepDate.value = new Date().toISOString().slice(0, 10);
  applyRememberedParticipant();
  els.submitSuccess.hidden = false;
  render();
  switchView("entry");
  showToast(useServer ? "记录已提交到共享服务器。" : "记录已保存到当前浏览器。");
}

function applyRememberedParticipant() {
  const input = els.form.elements.participantId;
  const rememberControl = els.form.elements.rememberParticipant;
  if (!rememberedParticipantId) {
    input.readOnly = false;
    input.value = input.value || "";
    if (rememberControl) rememberControl.checked = true;
    els.participantMemory.innerHTML = `<span>受试者不需要账号密码。首次提交后，本页面可以记住这台设备上的研究编号。</span>`;
    els.changeParticipant.hidden = true;
    return;
  }
  input.value = rememberedParticipantId;
  input.readOnly = true;
  if (rememberControl) rememberControl.checked = true;
  els.participantMemory.innerHTML = `
    <span>这台设备已自动识别为</span>
    <strong>${escapeHtml(rememberedParticipantId)}</strong>
    <em>之后每天只需要填写睡眠日期和睡眠情况。</em>
  `;
  els.changeParticipant.hidden = false;
}

function rememberParticipant(value) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return;
  rememberedParticipantId = cleaned;
  localStorage.setItem(PARTICIPANT_KEY, cleaned);
}

function forgetParticipant() {
  rememberedParticipantId = "";
  localStorage.removeItem(PARTICIPANT_KEY);
}

function clearRememberedParticipant() {
  forgetParticipant();
  const input = els.form.elements.participantId;
  input.readOnly = false;
  input.value = "";
  input.focus();
  applyRememberedParticipant();
  showToast("已清除记住的研究编号，可以重新填写。");
}

async function syncFromServer() {
  if (isGoogleBackend()) {
    await syncFromGoogleSheet();
    return;
  }
  if (!API_ENDPOINT) {
    updateStorageStatus();
    updateModeBanner();
    updateAdminGate();
    return;
  }
  try {
    const response = await fetch(API_ENDPOINT, { headers: apiHeaders({ Accept: "application/json" }) });
    if (response.status === 401) {
      if (adminPin) {
        adminPin = "";
        sessionStorage.removeItem("sleep-report-admin-pin");
      }
      useServer = true;
      adminRequired = true;
      records = [];
      updateStorageStatus("公开提交已连接，研究统计需授权");
      updateModeBanner();
      updateAdminGate();
      render();
      return;
    }
    if (!response.ok) throw new Error("API unavailable");
    const serverRecords = await response.json();
    records = serverRecords.map((record) => {
      normalizeRecord(record);
      return record;
    });
    useServer = true;
    adminRequired = false;
    updateStorageStatus();
    updateModeBanner();
    updateAdminGate();
    render();
  } catch {
    useServer = false;
    updateStorageStatus();
    updateModeBanner();
    updateAdminGate();
  }
}

async function addRecord(entry) {
  if (isGoogleBackend()) {
    await addRecordToGoogleSheet(entry);
    return;
  }
  if (!API_ENDPOINT) {
    records.push(entry);
    saveRecords();
    return;
  }
  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    if (!response.ok) throw new Error("Save failed");
    const payload = await response.json();
    if (Array.isArray(payload)) {
      records = payload;
      records.forEach(normalizeRecord);
    }
    useServer = true;
    updateStorageStatus();
  } catch {
    records.push(entry);
    saveRecords();
    useServer = false;
    updateStorageStatus();
    showToast("在线保存失败，已暂存到本地浏览器。");
  }
}

async function syncFromGoogleSheet() {
  if (!GOOGLE_SCRIPT_URL) {
    useServer = false;
    adminRequired = true;
    updateStorageStatus("等待配置 Google Sheet");
    updateModeBanner();
    updateAdminGate();
    return;
  }

  if (!adminPin) {
    useServer = true;
    adminRequired = true;
    records = [];
    updateStorageStatus("免费问卷已连接，研究统计需 PIN");
    updateModeBanner();
    updateAdminGate();
    render();
    return;
  }

  try {
    const payload = await googleJsonp({ action: "list", pin: adminPin });
    if (!payload.ok) throw new Error(payload.error || "Unauthorized");
    records = (payload.records || []).map((record) => {
      normalizeRecord(record);
      return record;
    });
    useServer = true;
    adminRequired = false;
    updateStorageStatus("Google Sheet 已连接");
    updateModeBanner();
    updateAdminGate();
    render();
  } catch {
    adminPin = "";
    sessionStorage.removeItem("sleep-report-admin-pin");
    useServer = Boolean(GOOGLE_SCRIPT_URL);
    adminRequired = true;
    records = [];
    updateStorageStatus("研究端 PIN 未通过");
    updateModeBanner();
    updateAdminGate();
    render();
  }
}

async function addRecordToGoogleSheet(entry) {
  if (!GOOGLE_SCRIPT_URL) {
    records.push(entry);
    saveRecords();
    useServer = false;
    updateStorageStatus("尚未配置 Google Sheet，已暂存本地");
    updateModeBanner();
    updateAdminGate();
    showToast("尚未配置 Google Sheet，已暂存到当前浏览器。");
    return;
  }

  try {
    const payload = await googleJsonp({
      ...entry,
      action: "submit",
      environment: Array.isArray(entry.environment) ? entry.environment.join("|") : entry.environment || "",
    });
    if (!payload.ok) throw new Error(payload.error || "Google Sheet submit failed");
    useServer = true;
    adminRequired = true;
    updateStorageStatus("已提交到 Google Sheet");
    updateModeBanner();
    updateAdminGate();
    if (adminPin) {
      await syncFromGoogleSheet();
    }
  } catch {
    records.push(entry);
    saveRecords();
    useServer = false;
    updateStorageStatus("Google Sheet 提交失败，已暂存本地");
    updateModeBanner();
    updateAdminGate();
    showToast("Google Sheet 提交失败，已暂存到当前浏览器。");
  }
}

function normalizeRecord(record) {
  [
    "sleepLatency",
    "awakenings",
    "napMinutes",
    "activityLevel",
    "stress",
    "sleepQuality",
    "recovery",
    "daytimeSleepiness",
  ].forEach((key) => {
    record[key] = record[key] === "" || record[key] == null ? "" : Number(record[key]);
  });
  record.napMinutes = Number.isFinite(record.napMinutes) ? record.napMinutes : 0;
  record.environment = Array.isArray(record.environment)
    ? record.environment
    : String(record.environment || "")
        .split("|")
        .filter(Boolean);
}

function loadRecords() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return parsed.map((record) => {
      normalizeRecord(record);
      return record;
    });
  } catch {
    return [];
  }
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function updateStorageStatus(message = "") {
  els.storageStatus.textContent = message || (useServer ? "在线共享提交已连接" : "当前为本地试用数据");
}

function updateModeBanner() {
  if (!els.modeBanner) return;
  if (isGoogleBackend() && !GOOGLE_SCRIPT_URL) {
    els.modeBanner.classList.add("show");
    els.modeBanner.innerHTML =
      "<strong>免费问卷模式：</strong>请先在 config.js 填入 Google Apps Script Web App URL。填好并发布到 GitHub Pages 后，不同电脑提交的数据会进入同一个 Google Sheet。";
    return;
  }
  if (isGoogleBackend()) {
    els.modeBanner.classList.remove("show");
    els.modeBanner.textContent = "";
    return;
  }
  if (!API_ENDPOINT) {
    els.modeBanner.classList.add("show");
    els.modeBanner.innerHTML =
      "<strong>本地文件预览：</strong>这里填写的数据只保存在当前浏览器。要免费跨电脑汇总，请使用 GitHub Pages + Google Sheet 模式。";
    return;
  }
  if (!useServer) {
    els.modeBanner.classList.add("show");
    els.modeBanner.innerHTML =
      "<strong>共享服务未连接：</strong>当前页面暂时无法连接服务器，提交会退回到本地暂存。";
    return;
  }
  els.modeBanner.classList.remove("show");
  els.modeBanner.textContent = "";
}

function updateAdminGate() {
  if (!els.adminGate) return;
  const googleMode = isGoogleBackend();
  const googleMissing = googleMode && !GOOGLE_SCRIPT_URL;
  const fileMode = !API_ENDPOINT && !googleMode;
  els.adminGate.classList.toggle("authorized", Boolean(adminPin) || (useServer && !adminRequired));
  els.adminPinInput.disabled = fileMode || googleMissing;
  els.adminLogin.disabled = fileMode || googleMissing;
  els.adminLogout.hidden = !adminPin;

  if (googleMissing) {
    els.adminGateTitle.textContent = "等待连接 Google Sheet";
    els.adminGateText.textContent = "请先在 config.js 中填入 Apps Script Web App URL。填好后，受试者提交会免费写入 Google Sheet。";
    return;
  }

  if (fileMode) {
    els.adminGateTitle.textContent = "当前不是共享数据模式";
    els.adminGateText.textContent = "你现在打开的是本地 HTML 文件，无法读取其他电脑提交的数据。请使用 GitHub Pages + Google Apps Script 免费方案。";
    return;
  }

  if (adminRequired && !adminPin) {
    els.adminGateTitle.textContent = "研究端登录";
    els.adminGateText.textContent = "受试者可以公开提交；研究人员输入 PIN 后，才能查看统计、记录表和导出 CSV。";
    return;
  }

  if (adminPin) {
    els.adminGateTitle.textContent = "研究端已登录";
    els.adminGateText.textContent = "正在显示共享服务器中的受试者记录。需要重新拉取数据时，可再次点击登录研究端。";
    return;
  }

  els.adminGateTitle.textContent = "共享数据已显示";
  els.adminGateText.textContent = googleMode
    ? "当前正在显示 Google Sheet 中的受试者记录。"
    : "当前服务器没有设置研究端 PIN。正式收集时建议设置 ADMIN_PIN，避免公开暴露研究记录。";
}

function isGoogleBackend() {
  return BACKEND_MODE === "free-google-sheets";
}

function googleJsonp(params) {
  return new Promise((resolve, reject) => {
    const callbackName = `sleepReportCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const url = new URL(GOOGLE_SCRIPT_URL);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value ?? ""));
    url.searchParams.set("callback", callbackName);

    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Google Sheet request timed out"));
    }, 15000);

    function cleanup() {
      window.clearTimeout(timer);
      script.remove();
      delete window[callbackName];
    }

    window[callbackName] = (payload) => {
      cleanup();
      resolve(payload || {});
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Google Sheet request failed"));
    };

    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function submitGoogleForm(entry) {
  return new Promise((resolve) => {
    const iframeName = `sleep_submit_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const iframe = document.createElement("iframe");
    iframe.name = iframeName;
    iframe.hidden = true;

    const form = document.createElement("form");
    form.method = "POST";
    form.action = GOOGLE_SCRIPT_URL;
    form.target = iframeName;
    form.hidden = true;

    const payload = {
      ...entry,
      action: "submit",
      environment: Array.isArray(entry.environment) ? entry.environment.join("|") : entry.environment || "",
    };

    Object.entries(payload).forEach(([key, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = value == null ? "" : String(value);
      form.appendChild(input);
    });

    let resolved = false;
    function finish() {
      if (resolved) return;
      resolved = true;
      window.setTimeout(() => {
        iframe.remove();
        form.remove();
      }, 500);
      resolve();
    }

    iframe.addEventListener("load", finish);
    document.body.append(iframe, form);
    form.submit();
    window.setTimeout(finish, 1800);
  });
}

function postGoogleAction(payload) {
  return new Promise((resolve) => {
    const iframeName = `sleep_action_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const iframe = document.createElement("iframe");
    iframe.name = iframeName;
    iframe.hidden = true;

    const form = document.createElement("form");
    form.method = "POST";
    form.action = GOOGLE_SCRIPT_URL;
    form.target = iframeName;
    form.hidden = true;

    Object.entries(payload).forEach(([key, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = value == null ? "" : String(value);
      form.appendChild(input);
    });

    let resolved = false;
    function finish() {
      if (resolved) return;
      resolved = true;
      window.setTimeout(() => {
        iframe.remove();
        form.remove();
      }, 500);
      resolve();
    }

    iframe.addEventListener("load", finish);
    document.body.append(iframe, form);
    form.submit();
    window.setTimeout(finish, 1200);
  });
}

function getFilteredRecords() {
  const participant = els.filterParticipant.value.trim().toLowerCase();
  const start = els.filterStart.value;
  const end = els.filterEnd.value;
  return records
    .filter((record) => {
      const matchesParticipant =
        !participant || String(record.participantId || "").toLowerCase().includes(participant);
      const matchesStart = !start || record.sleepDate >= start;
      const matchesEnd = !end || record.sleepDate <= end;
      return matchesParticipant && matchesStart && matchesEnd;
    })
    .sort((a, b) => String(a.sleepDate).localeCompare(String(b.sleepDate)));
}

function render() {
  const data = getFilteredRecords();
  updateRangeLabel(data);
  renderMetrics(data);
  drawTrendChart(data);
  drawQualityChart(data);
  renderFactors(data);
  renderParticipantSummary(data);
  renderInsights(data);
  renderTable(data);
}

function updateRangeLabel(data) {
  if (!records.length) {
    els.rangeLabel.textContent = "暂无记录";
    return;
  }
  if (!data.length) {
    els.rangeLabel.textContent = "筛选结果为空";
    return;
  }
  const dates = data.map((record) => record.sleepDate).filter(Boolean).sort();
  const uniqueParticipants = new Set(data.map((record) => record.participantId).filter(Boolean));
  const dateText = dates.length ? `${dates[0]} 至 ${dates[dates.length - 1]}` : "全部日期";
  els.rangeLabel.textContent = `${dateText} · ${uniqueParticipants.size || 0} 位受试者`;
}

function renderMetrics(data) {
  const durations = data.map(sleepDurationHours).filter(isFiniteNumber);
  const efficiencies = data.map(sleepEfficiency).filter(isFiniteNumber);
  const qualities = data.map((record) => record.sleepQuality).filter(isFiniteNumber);
  const subjects = new Set(data.map((record) => record.participantId).filter(Boolean));

  els.metrics.subjects.textContent = subjects.size;
  els.metrics.count.textContent = data.length;
  els.metrics.duration.textContent = durations.length ? formatHours(avg(durations)) : "--";
  els.metrics.efficiency.textContent = efficiencies.length ? `${Math.round(avg(efficiencies))}%` : "--";
  els.metrics.quality.textContent = qualities.length ? avg(qualities).toFixed(1) : "--";
}

function renderFactors(data) {
  const factors = [
    ["咖啡因", (record) => record.caffeine === "yes"],
    ["饮酒", (record) => record.alcohol === "yes"],
    ["剧烈运动", (record) => record.exercise === "yes"],
    ["身体不适", (record) => record.discomfort === "yes"],
    ["明显压力", (record) => Number(record.stress) >= 3],
    ["设备异常", hasDeviceIssue],
    ["环境变化", (record) => record.environment.length || record.environmentOther],
  ];

  if (!data.length) {
    els.factorList.innerHTML = `<div class="empty-state">暂无可统计数据</div>`;
    return;
  }

  els.factorList.innerHTML = factors
    .map(([label, test]) => {
      const count = data.filter(test).length;
      const percent = Math.round((count / data.length) * 100);
      return `
        <div class="factor-row">
          <span>${label}</span>
          <div class="factor-bar" aria-label="${label} ${percent}%"><span style="width: ${percent}%"></span></div>
          <strong>${count}/${data.length}</strong>
        </div>
      `;
    })
    .join("");
}

function renderParticipantSummary(data) {
  if (!data.length) {
    els.participantBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">暂无可汇总的受试者记录。</td>
      </tr>
    `;
    return;
  }

  const grouped = new Map();
  data.forEach((record) => {
    const key = record.participantId || "未填写";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(record);
  });

  els.participantBody.innerHTML = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([participantId, rows]) => {
      const durations = rows.map(sleepDurationHours).filter(isFiniteNumber);
      const efficiencies = rows.map(sleepEfficiency).filter(isFiniteNumber);
      const qualities = rows.map((record) => record.sleepQuality).filter(isFiniteNumber);
      const lowQuality = rows.filter((record) => Number(record.sleepQuality) <= 2).length;
      const deviceIssues = rows.filter(hasDeviceIssue).length;
      return `
        <tr>
          <td><strong>${escapeHtml(participantId)}</strong></td>
          <td>${rows.length}</td>
          <td>${durations.length ? formatHours(avg(durations)) : "--"}</td>
          <td>${efficiencies.length ? `${Math.round(avg(efficiencies))}%` : "--"}</td>
          <td>${qualities.length ? avg(qualities).toFixed(1) : "--"}</td>
          <td>${lowQuality}</td>
          <td>${deviceIssues}</td>
        </tr>
      `;
    })
    .join("");
}

function renderInsights(data) {
  if (!data.length) {
    els.insights.innerHTML = `<div class="empty-state">录入或导入记录后，这里会显示自动提示。</div>`;
    return;
  }

  const insights = [];
  const lowQuality = data.filter((record) => Number(record.sleepQuality) <= 2);
  const shortSleep = data.filter((record) => sleepDurationHours(record) < 6);
  const lowEfficiency = data.filter((record) => sleepEfficiency(record) < 85);
  const deviceIssues = data.filter(hasDeviceIssue);
  const caffeineWithLowQuality = data.filter(
    (record) => record.caffeine === "yes" && Number(record.sleepQuality) <= 3,
  );
  const sleepy = data.filter((record) => Number(record.daytimeSleepiness) >= 4);

  if (lowQuality.length) {
    insights.push([
      "低睡眠质量记录",
      `${lowQuality.length} 条记录的主观睡眠质量为“较差”或“很差”，建议优先查看对应日期的身体不适、压力、环境和设备记录。`,
      "warning",
    ]);
  }
  if (shortSleep.length) {
    insights.push([
      "睡眠时长偏短",
      `${shortSleep.length} 条记录的估计睡眠时长少于 6 小时，可与设备总睡眠时间做一致性检查。`,
      "warning",
    ]);
  }
  if (lowEfficiency.length) {
    insights.push([
      "睡眠效率偏低",
      `${lowEfficiency.length} 条记录的睡眠效率低于 85%，可能存在较长卧床清醒时间或时间填写误差。`,
      "warning",
    ]);
  }
  if (deviceIssues.length) {
    insights.push([
      "设备数据需要标记",
      `${deviceIssues.length} 条记录出现手表未整晚佩戴或枕垫异常，分析设备数据时建议单独标注。`,
      "warning",
    ]);
  }
  if (caffeineWithLowQuality.length) {
    insights.push([
      "咖啡因相关线索",
      `${caffeineWithLowQuality.length} 条记录同时存在咖啡因摄入和中低睡眠质量，可进一步查看摄入时间。`,
      "",
    ]);
  }
  if (sleepy.length) {
    insights.push([
      "白天困倦明显",
      `${sleepy.length} 条记录显示白天非常困或影响日常活动，可作为次日功能状态指标。`,
      "",
    ]);
  }

  if (!insights.length) {
    insights.push(["整体稳定", "当前筛选范围内未出现明显异常聚集。", ""]);
  }

  els.insights.innerHTML = insights
    .map(
      ([title, body, type]) => `
        <div class="insight ${type}">
          <strong>${title}</strong>
          <p>${body}</p>
        </div>
      `,
    )
    .join("");
}

function renderTable(data) {
  if (!data.length) {
    els.recordsBody.innerHTML = `
      <tr>
        <td colspan="9" class="empty-state">暂无记录。可以新增记录、载入示例或导入 CSV。</td>
      </tr>
    `;
    return;
  }

  els.recordsBody.innerHTML = data
    .map((record) => {
      const factors = getFactorTags(record);
      return `
        <tr>
          <td><strong>${escapeHtml(record.sleepDate || "-")}</strong><span>${escapeHtml(record.formDate || "")}</span></td>
          <td>${escapeHtml(record.participantId || "-")}</td>
          <td>${formatHours(sleepDurationHours(record))}</td>
          <td>${formatPercent(sleepEfficiency(record))}</td>
          <td>${qualityLabels[Number(record.sleepQuality) - 1] || "-"}</td>
          <td>${record.awakenings === "" ? "不确定" : record.awakenings}</td>
          <td><div class="tag-list">${factors.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("") || "-"}</div></td>
          <td>${escapeHtml(watchLabels[record.watchWear] || "-")} / ${escapeHtml(padLabels[record.padStatus] || "-")}</td>
          <td><button class="button danger" type="button" data-delete-id="${record.id}">删除</button></td>
        </tr>
      `;
    })
    .join("");

  els.recordsBody.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await deleteRecord(button.dataset.deleteId);
      render();
      showToast("记录已删除。");
    });
  });
}

function drawTrendChart(data) {
  const canvas = els.trendChart;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  clearCanvas(ctx, width, height);

  const plotted = data.filter((record) => isFiniteNumber(sleepDurationHours(record)));
  if (!plotted.length) {
    drawEmptyChart(ctx, width, height, "暂无趋势数据");
    return;
  }

  const padding = { top: 24, right: 42, bottom: 58, left: 54 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxHours = Math.max(10, Math.ceil(Math.max(...plotted.map(sleepDurationHours))));
  const minHours = Math.min(4, Math.floor(Math.min(...plotted.map(sleepDurationHours))));

  drawGrid(ctx, padding, chartW, chartH, 4);

  ctx.fillStyle = "#657068";
  ctx.font = "13px system-ui";
  for (let i = 0; i <= 4; i += 1) {
    const value = minHours + ((maxHours - minHours) * (4 - i)) / 4;
    const y = padding.top + (chartH * i) / 4;
    ctx.fillText(`${value.toFixed(0)}h`, 12, y + 4);
  }

  const xFor = (index) =>
    padding.left + (plotted.length === 1 ? chartW / 2 : (chartW * index) / (plotted.length - 1));
  const yForHours = (hours) =>
    padding.top + chartH - ((hours - minHours) / (maxHours - minHours || 1)) * chartH;

  ctx.strokeStyle = "#2f7258";
  ctx.lineWidth = 3;
  ctx.beginPath();
  plotted.forEach((record, index) => {
    const x = xFor(index);
    const y = yForHours(sleepDurationHours(record));
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  plotted.forEach((record, index) => {
    const x = xFor(index);
    const y = yForHours(sleepDurationHours(record));
    const quality = Number(record.sleepQuality) || 3;
    ctx.fillStyle = quality >= 4 ? "#2f7258" : quality <= 2 ? "#b94b4b" : "#b8831d";
    ctx.beginPath();
    ctx.arc(x, y, 5 + quality, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#657068";
  ctx.font = "12px system-ui";
  plotted.forEach((record, index) => {
    if (plotted.length > 12 && index % Math.ceil(plotted.length / 8) !== 0) return;
    const x = xFor(index);
    ctx.save();
    ctx.translate(x, height - 26);
    ctx.rotate(-Math.PI / 5);
    ctx.fillText(String(record.sleepDate).slice(5), 0, 0);
    ctx.restore();
  });

  ctx.fillStyle = "#18201c";
  ctx.font = "14px system-ui";
  ctx.fillText("睡眠时长", padding.left, 20);
  ctx.fillStyle = "#657068";
  ctx.fillText("点大小代表主观质量评分", width - 190, 20);
}

function drawQualityChart(data) {
  const canvas = els.qualityChart;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  clearCanvas(ctx, width, height);

  if (!data.length) {
    drawEmptyChart(ctx, width, height, "暂无分布数据");
    return;
  }

  const counts = [1, 2, 3, 4, 5].map(
    (score) => data.filter((record) => Number(record.sleepQuality) === score).length,
  );
  const max = Math.max(1, ...counts);
  const colors = ["#b94b4b", "#d17c4a", "#b8831d", "#609968", "#2f7258"];
  const padding = { top: 24, right: 24, bottom: 46, left: 38 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const barW = chartW / 5 - 14;

  drawGrid(ctx, padding, chartW, chartH, 3);

  counts.forEach((count, index) => {
    const x = padding.left + index * (chartW / 5) + 7;
    const barH = (count / max) * chartH;
    const y = padding.top + chartH - barH;
    ctx.fillStyle = colors[index];
    roundRect(ctx, x, y, barW, barH, 7);
    ctx.fill();
    ctx.fillStyle = "#18201c";
    ctx.font = "13px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(String(count), x + barW / 2, y - 8);
    ctx.fillStyle = "#657068";
    ctx.fillText(qualityLabels[index], x + barW / 2, height - 20);
  });
  ctx.textAlign = "left";
}

function clearCanvas(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfcfb";
  ctx.fillRect(0, 0, width, height);
}

function drawGrid(ctx, padding, chartW, chartH, lines) {
  ctx.strokeStyle = "#dbe3dc";
  ctx.lineWidth = 1;
  for (let i = 0; i <= lines; i += 1) {
    const y = padding.top + (chartH * i) / lines;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartW, y);
    ctx.stroke();
  }
}

function drawEmptyChart(ctx, width, height, text) {
  ctx.fillStyle = "#657068";
  ctx.font = "16px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(text, width / 2, height / 2);
  ctx.textAlign = "left";
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function loadDemoData() {
  const demo = [
    {
      participantId: "S001",
      formDate: "2026-07-01",
      sleepDate: "2026-06-30",
      bedTime: "23:10",
      trySleepTime: "23:30",
      wakeTime: "06:40",
      riseTime: "06:55",
      sleepLatency: 30,
      awakenings: 1,
      awakeningNote: "",
      napStatus: "no",
      napMinutes: 0,
      exercise: "yes",
      activityLevel: 4,
      exerciseNote: "18:30 跑步",
      caffeine: "yes",
      caffeineNote: "14:00 咖啡 1 杯",
      alcohol: "no",
      alcoholNote: "",
      medication: "no",
      medicationNote: "",
      discomfort: "no",
      stress: 1,
      bodyMoodNote: "",
      environment: [],
      environmentOther: "",
      watchWear: "all",
      padStatus: "normal",
      deviceNote: "",
      sleepQuality: 4,
      recovery: 4,
      daytimeSleepiness: 2,
      additionalNote: "",
    },
    {
      participantId: "S001",
      formDate: "2026-07-02",
      sleepDate: "2026-07-01",
      bedTime: "00:15",
      trySleepTime: "00:35",
      wakeTime: "06:05",
      riseTime: "06:30",
      sleepLatency: 60,
      awakenings: 2.5,
      awakeningNote: "半夜醒两次",
      napStatus: "yes",
      napMinutes: 35,
      exercise: "no",
      activityLevel: 2,
      exerciseNote: "",
      caffeine: "yes",
      caffeineNote: "19:00 浓茶",
      alcohol: "no",
      alcoholNote: "",
      medication: "no",
      medicationNote: "",
      discomfort: "yes",
      stress: 3,
      bodyMoodNote: "头痛，工作压力大",
      environment: ["noise"],
      environmentOther: "",
      watchWear: "all",
      padStatus: "normal",
      deviceNote: "",
      sleepQuality: 2,
      recovery: 2,
      daytimeSleepiness: 4,
      additionalNote: "",
    },
    {
      participantId: "S002",
      formDate: "2026-07-02",
      sleepDate: "2026-07-01",
      bedTime: "22:40",
      trySleepTime: "22:55",
      wakeTime: "06:50",
      riseTime: "07:10",
      sleepLatency: 15,
      awakenings: 0,
      awakeningNote: "",
      napStatus: "no",
      napMinutes: 0,
      exercise: "yes",
      activityLevel: 5,
      exerciseNote: "下午游泳",
      caffeine: "no",
      caffeineNote: "",
      alcohol: "no",
      alcoholNote: "",
      medication: "no",
      medicationNote: "",
      discomfort: "no",
      stress: 1,
      bodyMoodNote: "",
      environment: [],
      environmentOther: "",
      watchWear: "all",
      padStatus: "normal",
      deviceNote: "",
      sleepQuality: 5,
      recovery: 5,
      daytimeSleepiness: 1,
      additionalNote: "",
    },
    {
      participantId: "S002",
      formDate: "2026-07-03",
      sleepDate: "2026-07-02",
      bedTime: "23:50",
      trySleepTime: "00:10",
      wakeTime: "05:55",
      riseTime: "06:20",
      sleepLatency: 30,
      awakenings: 4,
      awakeningNote: "起夜较多",
      napStatus: "unknown",
      napMinutes: 0,
      exercise: "no",
      activityLevel: 3,
      exerciseNote: "",
      caffeine: "no",
      caffeineNote: "",
      alcohol: "yes",
      alcoholNote: "21:00 啤酒",
      medication: "no",
      medicationNote: "",
      discomfort: "no",
      stress: 2,
      bodyMoodNote: "",
      environment: ["temperature"],
      environmentOther: "",
      watchWear: "partial",
      padStatus: "moved",
      deviceNote: "手表半夜松动",
      sleepQuality: 2,
      recovery: 2,
      daytimeSleepiness: 4,
      additionalNote: "",
    },
  ].map((record) => ({
    ...record,
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    createdAt: new Date().toISOString(),
  }));

  records = [...records, ...demo];
  saveRecords();
  render();
  showToast("已载入 4 条示例记录。");
}

function exportCsv() {
  if (!records.length) {
    showToast("暂无数据可导出。");
    return;
  }
  const headers = [
    "id",
    "participantId",
    "formDate",
    "sleepDate",
    "bedTime",
    "trySleepTime",
    "wakeTime",
    "riseTime",
    "sleepDurationHours",
    "timeInBedHours",
    "sleepEfficiency",
    "sleepLatency",
    "awakenings",
    "napStatus",
    "napMinutes",
    "exercise",
    "activityLevel",
    "caffeine",
    "alcohol",
    "medication",
    "discomfort",
    "stress",
    "environment",
    "environmentOther",
    "watchWear",
    "padStatus",
    "sleepQuality",
    "recovery",
    "daytimeSleepiness",
    "awakeningNote",
    "exerciseNote",
    "caffeineNote",
    "alcoholNote",
    "medicationNote",
    "bodyMoodNote",
    "deviceNote",
    "additionalNote",
  ];
  const rows = records.map((record) =>
    headers.map((header) => {
      if (header === "sleepDurationHours") return toFixedOrBlank(sleepDurationHours(record));
      if (header === "timeInBedHours") return toFixedOrBlank(timeInBedHours(record));
      if (header === "sleepEfficiency") return toFixedOrBlank(sleepEfficiency(record), 1);
      if (header === "environment") return (record.environment || []).join("|");
      return record[header] ?? "";
    }),
  );
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `sleep-questionnaire-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function importCsv(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = parseCsv(String(reader.result || ""));
      const normalized = imported.map((row) => {
        const record = {
          ...row,
          id: row.id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
          environment: String(row.environment || "")
            .split("|")
            .filter(Boolean),
        };
        normalizeRecord(record);
        return record;
      });
      records = [...records, ...normalized];
      saveRecords();
      render();
      showToast(`已导入 ${normalized.length} 条记录。`);
    } catch {
      showToast("CSV 导入失败，请检查表头和格式。");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file, "utf-8");
}

async function clearAllRecords() {
  if (!records.length) {
    showToast("当前没有数据。");
    return;
  }
  const ok = window.confirm("确定清空所有记录吗？此操作不可撤销。");
  if (!ok) return;
  if (isGoogleBackend() && GOOGLE_SCRIPT_URL) {
    if (!adminPin) {
      showToast("请先登录研究端。");
      return;
    }
    await postGoogleAction({ action: "clear", pin: adminPin });
    await syncFromGoogleSheet();
    showToast("所有记录已清空。");
    return;
  }
  if (useServer) {
    try {
      const response = await fetch(API_ENDPOINT, { method: "DELETE", headers: apiHeaders() });
      if (!response.ok) throw new Error("Delete failed");
      records = [];
    } catch {
      showToast("在线数据清空失败。");
      return;
    }
  } else {
    records = [];
    saveRecords();
  }
  render();
  showToast("所有记录已清空。");
}

async function deleteRecord(id) {
  if (isGoogleBackend() && GOOGLE_SCRIPT_URL) {
    if (!adminPin) {
      showToast("请先登录研究端。");
      return;
    }
    await postGoogleAction({ action: "delete", pin: adminPin, id });
    await syncFromGoogleSheet();
    return;
  }
  if (!useServer) {
    records = records.filter((record) => record.id !== id);
    saveRecords();
    return;
  }
  try {
    const response = await fetch(`${API_ENDPOINT}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: apiHeaders(),
    });
    if (!response.ok) throw new Error("Delete failed");
    records = await response.json();
    records.forEach(normalizeRecord);
  } catch {
    showToast("在线删除失败。");
  }
}

function apiHeaders(extra = {}) {
  return adminPin ? { ...extra, "X-Admin-Pin": adminPin } : extra;
}

async function handleAdminLogin() {
  if (isGoogleBackend() && !GOOGLE_SCRIPT_URL) {
    showToast("请先在 config.js 填入 Apps Script Web App URL。");
    return;
  }
  if (!isGoogleBackend() && !API_ENDPOINT) {
    showToast("当前是本地文件模式，无法读取共享数据。");
    return;
  }
  const pin = els.adminPinInput.value.trim();
  if (pin) {
    adminPin = pin;
    sessionStorage.setItem("sleep-report-admin-pin", adminPin);
  }
  await syncFromServer();
  if (adminRequired) {
    showToast("PIN 不正确或尚未登录研究端。");
    return;
  }
  els.adminPinInput.value = "";
  showToast("研究端数据已刷新。");
}

function handleAdminLogout() {
  adminPin = "";
  sessionStorage.removeItem("sleep-report-admin-pin");
  records = [];
  adminRequired = true;
  updateAdminGate();
  render();
  showToast("已退出研究端。");
}

async function copyPublicLink() {
  const url = window.location.href.split("#")[0];
  if (location.protocol === "file:") {
    showToast("当前是本地文件地址；正式收集请复制 GitHub Pages 的公开网址。");
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast("公开链接已复制。");
  } catch {
    showToast(url);
  }
}

function getFactorTags(record) {
  const tags = [];
  if (record.caffeine === "yes") tags.push("咖啡因");
  if (record.alcohol === "yes") tags.push("饮酒");
  if (record.exercise === "yes") tags.push("运动");
  if (record.discomfort === "yes") tags.push("身体不适");
  if (Number(record.stress) >= 3) tags.push("明显压力");
  if (record.environment.length) tags.push(...record.environment.map((key) => environmentLabels[key] || key));
  if (record.environmentOther) tags.push(record.environmentOther);
  return tags;
}

function hasDeviceIssue(record) {
  return record.watchWear !== "all" || record.padStatus !== "normal";
}

function timeToMinutes(time) {
  if (!time || !time.includes(":")) return NaN;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesBetween(startTime, endTime) {
  const start = timeToMinutes(startTime);
  let end = timeToMinutes(endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return NaN;
  if (end < start) end += 24 * 60;
  return end - start;
}

function sleepDurationHours(record) {
  return minutesBetween(record.trySleepTime, record.riseTime) / 60;
}

function timeInBedHours(record) {
  return minutesBetween(record.bedTime, record.riseTime) / 60;
}

function sleepEfficiency(record) {
  const sleep = sleepDurationHours(record);
  const inBed = timeInBedHours(record);
  if (!isFiniteNumber(sleep) || !isFiniteNumber(inBed) || inBed <= 0) return NaN;
  return Math.max(0, Math.min(100, (sleep / inBed) * 100));
}

function avg(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function formatHours(value) {
  if (!isFiniteNumber(value)) return "--";
  const totalMinutes = Math.round(Number(value) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}小时${String(minutes).padStart(2, "0")}分`;
}

function formatPercent(value) {
  return isFiniteNumber(value) ? `${Math.round(Number(value))}%` : "--";
}

function toFixedOrBlank(value, digits = 2) {
  return isFiniteNumber(value) ? Number(value).toFixed(digits) : "";
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);

  const [headers, ...body] = rows.filter((line) => line.some((value) => value.trim() !== ""));
  return body.map((line) =>
    Object.fromEntries(headers.map((header, index) => [header.replace(/^\uFEFF/, ""), line[index] || ""])),
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2400);
}
