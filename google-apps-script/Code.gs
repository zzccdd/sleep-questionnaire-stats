const SHEET_NAME = "Responses";
const DEFAULT_ADMIN_PIN = "change-me";

const HEADERS = [
  "id",
  "createdAt",
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

function doGet(e) {
  const params = e.parameter || {};
  const callback = params.callback || "callback";
  let payload;

  try {
    if (params.action === "submit") {
      appendRecord_(params);
      payload = { ok: true, id: params.id || "" };
    } else if (params.action === "list") {
      requireAdmin_(params.pin);
      payload = { ok: true, records: listRecords_() };
    } else {
      payload = { ok: true, message: "Sleep report endpoint is running." };
    }
  } catch (error) {
    payload = { ok: false, error: error.message || String(error) };
  }

  return ContentService.createTextOutput(`${callback}(${JSON.stringify(payload)});`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const params = e.parameter || {};
    const action = params.action || "submit";

    if (action === "submit") {
      appendRecord_(params);
      return text_("ok");
    }

    requireAdmin_(params.pin);

    if (action === "delete") {
      deleteRecord_(params.id);
      return text_("deleted");
    }

    if (action === "clear") {
      clearRecords_();
      return text_("cleared");
    }

    return text_("unknown action");
  } catch (error) {
    return text_(error.message || String(error));
  } finally {
    lock.releaseLock();
  }
}

function setupSheet() {
  const sheet = getSheet_();
  sheet.clear();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, HEADERS.length);
}

function appendRecord_(params) {
  const sheet = getSheet_();
  const record = normalizeRecord_(params);
  const row = HEADERS.map((header) => record[header] == null ? "" : record[header]);
  sheet.appendRow(row);
}

function listRecords_() {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  const headers = values[0].map(String);

  return values.slice(1).filter((row) => row.some((value) => value !== "")).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index];
    });
    return record;
  });
}

function deleteRecord_(id) {
  if (!id) return;
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const idCol = values[0].indexOf("id");
  if (idCol < 0) return;

  for (let row = values.length - 1; row >= 1; row -= 1) {
    if (String(values[row][idCol]) === String(id)) {
      sheet.deleteRow(row + 1);
      return;
    }
  }
}

function clearRecords_() {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
}

function normalizeRecord_(params) {
  const record = {};
  HEADERS.forEach((header) => {
    record[header] = params[header] || "";
  });

  record.id = record.id || Utilities.getUuid();
  record.createdAt = record.createdAt || new Date().toISOString();
  record.sleepDurationHours = fixed_(hoursBetween_(record.trySleepTime, record.riseTime), 2);
  record.timeInBedHours = fixed_(hoursBetween_(record.bedTime, record.riseTime), 2);
  record.sleepEfficiency = fixed_(sleepEfficiency_(record), 1);
  return record;
}

function sleepEfficiency_(record) {
  const sleep = Number(record.sleepDurationHours);
  const inBed = Number(record.timeInBedHours);
  if (!isFinite(sleep) || !isFinite(inBed) || inBed <= 0) return "";
  return Math.max(0, Math.min(100, (sleep / inBed) * 100));
}

function hoursBetween_(startTime, endTime) {
  const start = minutes_(startTime);
  let end = minutes_(endTime);
  if (!isFinite(start) || !isFinite(end)) return "";
  if (end < start) end += 24 * 60;
  return (end - start) / 60;
}

function minutes_(time) {
  if (!time || String(time).indexOf(":") < 0) return NaN;
  const parts = String(time).split(":").map(Number);
  return parts[0] * 60 + parts[1];
}

function fixed_(value, digits) {
  if (!isFinite(Number(value))) return "";
  return Number(value).toFixed(digits);
}

function requireAdmin_(pin) {
  if (String(pin || "") !== String(adminPin_())) {
    throw new Error("Admin PIN required");
  }
}

function adminPin_() {
  return PropertiesService.getScriptProperties().getProperty("ADMIN_PIN") || DEFAULT_ADMIN_PIN;
}

function getSheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  const spreadsheet = spreadsheetId
    ? SpreadsheetApp.openById(spreadsheetId)
    : SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }
  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (firstRow.join("") === "") {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function text_(value) {
  return ContentService.createTextOutput(String(value)).setMimeType(ContentService.MimeType.TEXT);
}
