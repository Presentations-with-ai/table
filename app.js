const STORAGE_KEY = "schoolTimetable.v14.cache";
const USERS_KEY = "schoolTimetable.users.v2";
const AUTH_KEY = "schoolTimetable.auth.v2";
const TELEGRAM_KEY = "schoolTimetable.telegram.v2";
const DATA_URL = "timetable-db.json";
const USERS_URL = "users.json";
const CONFIG = window.TIMETABLE_CONFIG || {};
const GITHUB_IS_SOURCE_OF_TRUTH = false;

const defaultUsers = [
  {
    "id": "u1",
    "username": "admin",
    "password": "admin123",
    "name": "Администратор",
    "role": "admin",
    "active": true
  },
  {
    "id": "u0",
    "username": "deputy",
    "password": "deputy123",
    "name": "Завуч",
    "role": "deputy",
    "active": true
  },
  {
    "id": "u2",
    "username": "teacher",
    "password": "teacher123",
    "name": "Учитель",
    "role": "teacher",
    "active": true
  }
];
const defaultState = {
  "schoolName": "",
  "periodName": "",
  "viewMode": "group",
  "selected": {
    "group": "",
    "teacher": "",
    "room": ""
  },
  "days": [
    {
      "id": "mon",
      "short": "Пн",
      "name": "Понедельник"
    },
    {
      "id": "tue",
      "short": "Вт",
      "name": "Вторник"
    },
    {
      "id": "wed",
      "short": "Ср",
      "name": "Среда"
    },
    {
      "id": "thu",
      "short": "Чт",
      "name": "Четверг"
    },
    {
      "id": "fri",
      "short": "Пт",
      "name": "Пятница"
    },
    {
      "id": "sat",
      "short": "Сб",
      "name": "Суббота"
    }
  ],
  "slots": [
    {
      "id": "s1",
      "title": "1",
      "start": "08:00",
      "end": "08:45"
    },
    {
      "id": "s2",
      "title": "2",
      "start": "08:55",
      "end": "09:40"
    },
    {
      "id": "s3",
      "title": "3",
      "start": "09:50",
      "end": "10:35"
    },
    {
      "id": "s4",
      "title": "4",
      "start": "10:55",
      "end": "11:40"
    },
    {
      "id": "s5",
      "title": "5",
      "start": "11:50",
      "end": "12:35"
    },
    {
      "id": "s6",
      "title": "6",
      "start": "12:45",
      "end": "13:30"
    },
    {
      "id": "s7",
      "title": "7",
      "start": "13:40",
      "end": "14:25"
    }
  ],
  "groups": [],
  "teachers": [],
  "rooms": [],
  "subjects": [],
  "lessons": [],
  "autoOptions": {
    "maxPerDay": 6,
    "clearBeforeGenerate": true,
    "juniorEarly": true
  },
  "autoRules": []
};

let state = clone(defaultState);
let schools = [];
let currentSchoolId = "";
let users = clone(defaultUsers);
let currentDataList = "groups";
let currentUser = null;
let telegramSettings = { botToken: "", chatId: "" };
let autoReportTimer = null;
let autoReportBusy = false;
let autoReportQueued = false;
let lastAutoReportHash = "";
let databaseVersion = 0;
let databaseUpdatedAt = "";
let usersVersion = 0;
let usersUpdatedAt = "";
let editMode = false;
let pendingEditChanges = false;

const $ = (id) => document.getElementById(id);
const uid = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
function nowIso() { return new Date().toISOString(); }


const SUBJECT_COLOR_PALETTE = [
  "#DFFF9D", "#BFE9FF", "#FFD6A5", "#FFC8DD", "#CDB4DB", "#B7E4C7",
  "#FFF3B0", "#A8DADC", "#FFADAD", "#C8E7FF", "#E9D8A6", "#CAFFBF",
  "#E0BBE4", "#FEC5BB", "#BDE0FE", "#D0F4DE", "#FDE2E4", "#CCD5AE",
  "#F1C0E8", "#A3C4F3", "#FFCFD2", "#CDEAC0", "#FFEE93", "#B8F2E6"
];

function hexToRgb(hex) {
  const clean = String(hex || "").replace("#", "");
  if (clean.length !== 6) return [0, 0, 0];
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

function colorDistance(a, b) {
  const ar = hexToRgb(a), br = hexToRgb(b);
  return Math.sqrt((ar[0] - br[0]) ** 2 + (ar[1] - br[1]) ** 2 + (ar[2] - br[2]) ** 2);
}

function hashString(str = "") {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function randomPastelFromHash(seed) {
  const hue = (hashString(seed) * 137.508) % 360;
  return `hsl(${Math.round(hue)} 92% 82%)`;
}

function pickSubjectColor(seed = "") {
  const used = (state.subjects || []).map(s => s.color).filter(Boolean);
  const unused = SUBJECT_COLOR_PALETTE.filter(c => !used.includes(c));
  if (!unused.length) return randomPastelFromHash(seed || Date.now());
  const bias = hashString(seed || Date.now());
  const ranked = unused.map((color, i) => {
    const minDistance = used.length ? Math.min(...used.map(u => colorDistance(color, u))) : 999;
    return { color, score: minDistance + (((bias + i * 31) % 100) / 1000) };
  }).sort((a, b) => b.score - a.score);
  return ranked[0].color;
}

function ensureSubjectColors() {
  let changed = false;
  for (const subject of state.subjects || []) {
    if (!subject.color) {
      subject.color = pickSubjectColor(subject.id || subject.name || uid("sub"));
      changed = true;
    }
  }
  return changed;
}

function colorForSubject(subjectId) {
  const subject = findById(state.subjects || [], subjectId);
  return subject?.color || "#DFFF9D";
}

async function fetchJsonFile(url) {
  try {
    const res = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    return null;
  }
}

function normalizeState(input) {
  const data = input?.data || input?.timetable || input || {};
  return {
    ...clone(defaultState),
    ...data,
    selected: { ...clone(defaultState.selected), ...(data.selected || {}) },
    days: Array.isArray(data.days) ? data.days : clone(defaultState.days),
    slots: Array.isArray(data.slots) ? data.slots : clone(defaultState.slots),
    groups: Array.isArray(data.groups) ? data.groups : clone(defaultState.groups),
    teachers: Array.isArray(data.teachers) ? data.teachers : clone(defaultState.teachers),
    rooms: Array.isArray(data.rooms) ? data.rooms : clone(defaultState.rooms),
    subjects: Array.isArray(data.subjects) ? data.subjects : clone(defaultState.subjects),
    lessons: Array.isArray(data.lessons) ? data.lessons : clone(defaultState.lessons),
    autoOptions: { ...clone(defaultState.autoOptions), ...(data.autoOptions || {}) },
    autoRules: Array.isArray(data.autoRules) ? data.autoRules : clone(defaultState.autoRules)
  };
}

function normalizeUsers(input) {
  const list = input?.users || input?.allowedUsers || input || defaultUsers;
  if (!Array.isArray(list) || !list.length) return clone(defaultUsers);
  const normalized = list.map((u, index) => ({
    id: u.id || uid("u"),
    username: String(u.username || u.login || "").trim(),
    password: String(u.password || ""),
    name: String(u.name || u.username || `Пользователь ${index + 1}`),
    role: String(u.role || "teacher"),
    active: u.active !== false
  })).filter(u => u.username && u.password);
  return normalized.length ? normalized : clone(defaultUsers);
}

function makeSchoolRecord(data = {}, name = "") {
  const normalized = normalizeState({ ...data, schoolName: data.schoolName || name || "" });
  const id = data.schoolId || data.id || uid("school");
  normalized.schoolId = id;
  return {
    id,
    name: normalized.schoolName || name || "Новая школа",
    periodName: normalized.periodName || "",
    data: normalized
  };
}

function schoolExportData(data = state) {
  const clean = normalizeState(data || {});
  delete clean.viewMode;
  delete clean.selected;
  return clean;
}

function emptyRepository() {
  const first = makeSchoolRecord(clone(defaultState), "");
  schools = [first];
  currentSchoolId = first.id;
  state = normalizeState(first.data);
  state.schoolId = first.id;
}

function normalizeRepository(input) {
  const source = input || {};
  let list = [];

  if (Array.isArray(source.schools)) {
    list = source.schools.map((school, index) => {
      const data = school.data || school.timetable || school;
      const normalized = normalizeState(data);
      const id = school.id || normalized.schoolId || uid("school");
      normalized.schoolId = id;
      return {
        id,
        name: school.name || normalized.schoolName || `Школа ${index + 1}`,
        periodName: school.periodName || normalized.periodName || "",
        data: normalized
      };
    });
  } else {
    const normalized = normalizeState(source.data || source.timetable || source);
    const id = normalized.schoolId || source.currentSchoolId || uid("school");
    normalized.schoolId = id;
    list = [{
      id,
      name: normalized.schoolName || "Школа",
      periodName: normalized.periodName || "",
      data: normalized
    }];
  }

  list = list.filter(s => s && s.id);
  if (!list.length) list = [makeSchoolRecord(clone(defaultState), "")];
  const selectedId = source.currentSchoolId && list.some(s => s.id === source.currentSchoolId) ? source.currentSchoolId : list[0].id;
  return { schools: list, currentSchoolId: selectedId };
}

function syncCurrentSchoolToList() {
  if (!schools.length) emptyRepository();
  if (!currentSchoolId) currentSchoolId = schools[0].id;
  const idx = schools.findIndex(s => s.id === currentSchoolId);
  const record = {
    id: currentSchoolId,
    name: state.schoolName || "Новая школа",
    periodName: state.periodName || "",
    data: { ...clone(state), schoolId: currentSchoolId }
  };
  if (idx >= 0) schools[idx] = record;
  else schools.push(record);
}

function switchSchool(id) {
  if (!id || id === currentSchoolId) return;
  syncCurrentSchoolToList();
  const school = schools.find(s => s.id === id);
  if (!school) return;
  currentSchoolId = school.id;
  state = normalizeState(school.data || {});
  state.schoolId = school.id;
  if (!state.schoolName) state.schoolName = school.name || "";
  if (!state.periodName) state.periodName = school.periodName || "";
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getTimetableDbJson(false)));
  renderAll();
}

function addSchool() {
  if (!adminGuard()) return;
  syncCurrentSchoolToList();
  const name = prompt("Название школы", "Новая школа");
  if (name === null) return;
  const data = clone(defaultState);
  data.schoolName = String(name || "Новая школа").trim() || "Новая школа";
  data.periodName = state.periodName || "";
  const record = makeSchoolRecord(data, data.schoolName);
  schools.push(record);
  currentSchoolId = record.id;
  state = normalizeState(record.data);
  saveState();
  renderAll();
  toast("Школа добавлена");
}

function deleteCurrentSchool() {
  if (!adminGuard()) return;
  if (schools.length <= 1) {
    state = clone(defaultState);
    state.schoolId = currentSchoolId;
    saveState();
    renderAll();
    toast("Данные школы очищены");
    return;
  }
  const name = state.schoolName || "текущую школу";
  if (!confirm(`Удалить ${name}?`)) return;
  schools = schools.filter(s => s.id !== currentSchoolId);
  currentSchoolId = schools[0]?.id || "";
  state = normalizeState(schools[0]?.data || {});
  state.schoolId = currentSchoolId;
  saveState();
  renderAll();
  toast("Школа удалена");
}

function stableRepositoryFingerprint() {
  syncCurrentSchoolToList();
  return JSON.stringify({
    schools: schools.map(s => ({ id: s.id, name: s.name, periodName: s.periodName, data: schoolExportData(s.data) })),
    users
  });
}


function payloadVersion(payload) {
  const numeric = Number(payload?.version || 0);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const t = Date.parse(payload?.updatedAt || payload?.data?.updatedAt || "");
  return Number.isFinite(t) ? t : 0;
}

function readLocalDbPayload() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.type || parsed.version || parsed.data || parsed.timetable || parsed.schools)) return parsed;
    return { version: 0, updatedAt: "", data: parsed };
  } catch { return null; }
}

function applyDbPayload(payload) {
  const repo = normalizeRepository(payload || {});
  schools = repo.schools;
  currentSchoolId = repo.currentSchoolId;
  const current = schools.find(s => s.id === currentSchoolId) || schools[0];
  state = normalizeState(current?.data || payload?.data || payload || {});
  if (current) {
    state.schoolId = current.id;
    if (!state.schoolName) state.schoolName = current.name || "";
    if (!state.periodName) state.periodName = current.periodName || "";
  }
  databaseVersion = Math.max(0, Number(payload?.version || 0) || 0);
  databaseUpdatedAt = payload?.updatedAt || "";
  if (!schools.length) syncCurrentSchoolToList();
}

async function loadState() {
  const filePayload = await fetchJsonFile(DATA_URL);
  const localPayload = readLocalDbPayload();

  if (filePayload && localPayload) {
    const fileVersion = payloadVersion(filePayload);
    const localVersion = payloadVersion(localPayload);
    if (fileVersion > localVersion) {
      applyDbPayload(filePayload);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(getTimetableDbJson(false)));
      return state;
    }
    applyDbPayload(localPayload);
    return state;
  }

  if (filePayload) {
    applyDbPayload(filePayload);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getTimetableDbJson(false)));
    return state;
  }

  if (localPayload) {
    applyDbPayload(localPayload);
    return state;
  }

  emptyRepository();
  databaseVersion = 0;
  databaseUpdatedAt = "";
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getTimetableDbJson(false)));
  return state;
}


function readLocalUsersPayload() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.type || parsed.version || parsed.users || parsed.allowedUsers)) return parsed;
    return { version: 0, users: Array.isArray(parsed) ? parsed : defaultUsers };
  } catch { return null; }
}

async function loadUsers() {
  const filePayload = await fetchJsonFile(USERS_URL);
  const localPayload = readLocalUsersPayload();

  let chosen = null;
  if (filePayload && localPayload) {
    chosen = payloadVersion(filePayload) > payloadVersion(localPayload) ? filePayload : localPayload;
  } else {
    chosen = filePayload || localPayload;
  }

  if (chosen) {
    usersVersion = Math.max(0, Number(chosen?.version || 0) || 0);
    usersUpdatedAt = chosen?.updatedAt || "";
    const loaded = normalizeUsers(chosen);
    if (filePayload && chosen === filePayload) {
      localStorage.setItem(USERS_KEY, JSON.stringify(getUsersJson(false)));
    }
    return loaded;
  }

  usersVersion = 0;
  usersUpdatedAt = "";
  localStorage.setItem(USERS_KEY, JSON.stringify(getUsersJson(false)));
  return clone(defaultUsers);
}

function saveState(bumpVersion = true) {
  if (bumpVersion) {
    databaseVersion = Math.max(0, Number(databaseVersion || 0)) + 1;
    databaseUpdatedAt = nowIso();
    if (editMode) pendingEditChanges = true;
  }
  syncCurrentSchoolToList();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getTimetableDbJson(false)));
}

function saveUsers(bumpVersion = true) {
  if (bumpVersion) {
    usersVersion = Math.max(0, Number(usersVersion || 0)) + 1;
    usersUpdatedAt = nowIso();
    if (editMode) pendingEditChanges = true;
  }
  localStorage.setItem(USERS_KEY, JSON.stringify(getUsersJson(false)));
}

function reportableState() {
  const copy = clone(state);
  // Эти поля меняются только при просмотре и не должны считаться правкой базы.
  delete copy.viewMode;
  delete copy.selected;
  return copy;
}

function databaseFingerprint() {
  return JSON.stringify({ timetable: reportableState(), users });
}

function initAutoReportHash() {
  lastAutoReportHash = databaseFingerprint();
}

function scheduleAutoTelegramBackup(reason = "Изменение") {
  // Reports are sent only from the final Save button in edit mode.
}

function loadAuth() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); }
  catch { return null; }
}

function loadTelegramSettings() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(TELEGRAM_KEY) || "{}"); } catch { stored = {}; }
  return {
    botToken: CONFIG.TELEGRAM_BOT_TOKEN || stored.botToken || "",
    chatId: CONFIG.TELEGRAM_CHAT_ID || stored.chatId || ""
  };
}

function saveTelegramSettings() {
  const tokenInput = $("telegramBotToken");
  const chatInput = $("telegramChatId");
  telegramSettings.botToken = CONFIG.TELEGRAM_BOT_TOKEN || tokenInput?.value.trim() || telegramSettings.botToken || "";
  telegramSettings.chatId = CONFIG.TELEGRAM_CHAT_ID || chatInput?.value.trim() || telegramSettings.chatId || "";
  localStorage.setItem(TELEGRAM_KEY, JSON.stringify(telegramSettings));
}

function saveAuth(user) {
  currentUser = user;
  editMode = false;
  pendingEditChanges = false;
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  activatePanel("schedulePanel");
  renderAll();
}

function logout() {
  currentUser = null;
  editMode = false;
  pendingEditChanges = false;
  localStorage.removeItem(AUTH_KEY);
  activatePanel("schedulePanel");
  renderAll();
  toast("Вы вышли из аккаунта");
}

function isAdmin() {
  return currentUser?.role === "admin" || currentUser?.role === "deputy";
}

function canEdit() {
  return isAdmin() && editMode;
}

function enterEditMode() {
  if (!isAdmin()) {
    openAuthScreen();
    return;
  }
  clearTimeout(autoReportTimer);
  autoReportQueued = false;
  editMode = true;
  pendingEditChanges = false;
  renderAll();
  toast("Режим редактирования включён");
}

function finishEditMode() {
  if (!isAdmin()) return;
  syncCurrentSchoolToList();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getTimetableDbJson(false)));
  localStorage.setItem(USERS_KEY, JSON.stringify(getUsersJson(false)));
  const shouldSendReport = pendingEditChanges || databaseFingerprint() !== lastAutoReportHash;
  editMode = false;
  pendingEditChanges = false;
  clearTimeout(autoReportTimer);
  autoReportQueued = false;
  if (shouldSendReport) autoTelegramBackup("Полное сохранение");
  activatePanel("schedulePanel");
  renderAll();
  toast("Изменения сохранены. Вступят в силу в течение 15 минут");
}

function toggleEditMode() {
  if (canEdit()) finishEditMode();
  else enterEditMode();
}

function openAuthScreen() {
  const screen = $("authScreen");
  if (!screen) return;
  screen.classList.remove("hidden");
  document.body.classList.add("auth-open");
  setTimeout(() => $("loginUsername")?.focus(), 60);
}

function closeAuthScreen() {
  const screen = $("authScreen");
  if (!screen) return;
  screen.classList.add("hidden");
  document.body.classList.remove("auth-open");
}

function adminGuard(message = "Этот раздел доступен только завучу или админу") {
  if (canEdit()) return true;
  if (isAdmin()) {
    toast("Нажмите «Редактировать», чтобы менять расписание");
    return false;
  }
  toast(message);
  openAuthScreen();
  return false;
}

function activatePanel(panelId = "schedulePanel") {
  const targetPanel = $(panelId) || $("schedulePanel");
  if (targetPanel.classList.contains("admin-only") && !canEdit()) panelId = "schedulePanel";
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.panel === panelId));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active-panel", p.id === panelId));
}

function applyRoleVisibility() {
  const admin = isAdmin();
  const editor = canEdit();
  document.body.classList.toggle("is-admin", admin);
  document.body.classList.toggle("is-not-admin", Boolean(currentUser) && !admin);
  document.body.classList.toggle("is-editing", editor);
  document.querySelectorAll(".admin-only").forEach(el => {
    el.classList.toggle("hidden", !editor);
  });
  const activeAdminPanel = document.querySelector(".panel.active-panel.admin-only");
  if (activeAdminPanel && !editor) activatePanel("schedulePanel");
}

function renderAuth() {
  const isLogged = Boolean(currentUser);
  const admin = isAdmin();
  const editor = canEdit();
  document.body.classList.remove("locked");
  document.body.classList.toggle("can-edit", editor);
  document.body.classList.toggle("view-only", !editor);
  if (editor) closeAuthScreen();
  $("openLoginBtn")?.classList.toggle("hidden", isLogged);
  $("logoutBtn")?.classList.toggle("hidden", !isLogged);
  $("editModeBtn")?.classList.toggle("hidden", !admin);
  if ($("editModeBtn")) $("editModeBtn").textContent = editor ? "Сохранить" : "Редактировать";
  $("currentUserLabel").textContent = admin
    ? `${currentUser.name} · ${currentUser.role === "deputy" ? "завуч" : "админ"}${editor ? " · редактирование" : " · просмотр"}`
    : (isLogged ? `${currentUser.name} · только просмотр` : "Просмотр расписания");
  ["schoolName", "periodName"].forEach(id => {
    const input = $(id);
    if (input) input.readOnly = !editor;
  });
  const schoolInput = $("schoolName");
  if (schoolInput) schoolInput.title = editor ? "Название школы можно изменить" : "Название школы берётся из базы";
  applyRoleVisibility();
}

function login(username, password) {
  const cleanLogin = String(username || "").trim();
  const user = users.find(u => u.active !== false && u.username === cleanLogin && u.password === String(password || ""));
  if (!user) {
    toast("Неверный логин или пароль");
    return false;
  }
  saveAuth({ username: user.username, name: user.name, role: user.role, loggedAt: nowIso() });
  closeAuthScreen();
  toast(isAdmin() ? "Вход выполнен. Нажмите «Редактировать», чтобы менять расписание" : "Вход выполнен, доступ только к просмотру");
  return true;
}

function toast(message) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

function getCollection(mode = state.viewMode) {
  if (mode === "teacher") return state.teachers;
  if (mode === "room") return state.rooms;
  return state.groups;
}

function getSelectedId(mode = state.viewMode) {
  return state.selected[mode] || getCollection(mode)[0]?.id || "";
}

function findById(list, id) { return list.find(item => item.id === id); }

function nameOf(type, id) {
  const map = { group: state.groups, teacher: state.teachers, room: state.rooms, subject: state.subjects };
  return findById(map[type] || [], id)?.name || "—";
}

function uniqueClean(list = []) {
  return [...new Set((list || []).map(x => String(x || "").trim()).filter(Boolean))];
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function lessonIds(lesson, type) {
  if (type === "group") return uniqueClean([...(lesson.groupIds || []), ...asArray(lesson.groupId)]);
  if (type === "teacher") return uniqueClean([...(lesson.teacherIds || []), ...asArray(lesson.teacherId)]);
  if (type === "room") return uniqueClean([...(lesson.roomIds || []), ...asArray(lesson.roomId)]);
  if (type === "subject") return uniqueClean([...(lesson.subjectIds || []), ...asArray(lesson.subjectId)]);
  return [];
}

function primaryLessonId(lesson, type) {
  return lessonIds(lesson, type)[0] || "";
}

function lessonHas(lesson, type, id) {
  return lessonIds(lesson, type).includes(id);
}

function intersects(a = [], b = []) {
  const set = new Set(a);
  return b.some(x => set.has(x));
}

function namesOf(type, ids = []) {
  return uniqueClean(ids.map(id => nameOf(type, id)).filter(n => n && n !== "—")).join(" / ") || "—";
}

function selectedValues(select) {
  return Array.from(select?.selectedOptions || []).map(o => o.value).filter(Boolean);
}

function fillMultiSelect(select, items, selectedIds = []) {
  select.innerHTML = "";
  const chosen = new Set(asArray(selectedIds));
  if (!items.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Нет данных";
    select.appendChild(opt);
    return;
  }
  for (const item of items) {
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.textContent = item.extra ? `${item.name} — ${item.extra}` : item.name;
    if (chosen.has(item.id)) opt.selected = true;
    select.appendChild(opt);
  }
}

function subjectBackground(subjectIds = []) {
  const ids = uniqueClean(subjectIds);
  if (!ids.length) return "#DFFF9D";
  if (ids.length === 1) return colorForSubject(ids[0]);
  const colors = ids.map(id => colorForSubject(id));
  const step = 100 / colors.length;
  const parts = colors.map((color, i) => {
    const start = Math.round(i * step * 10) / 10;
    const end = Math.round((i + 1) * step * 10) / 10;
    return `${color} ${start}% ${end}%`;
  });
  return `linear-gradient(90deg, ${parts.join(", ")})`;
}

function fillSelect(select, items, selectedId) {
  select.innerHTML = "";
  if (!items.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Нет данных";
    select.appendChild(opt);
    return;
  }
  for (const item of items) {
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.textContent = item.extra ? `${item.name} — ${item.extra}` : item.name;
    if (item.id === selectedId) opt.selected = true;
    select.appendChild(opt);
  }
}

function renderTopFields() {
  if ($("brandTitle")) $("brandTitle").textContent = state.schoolName || "Школа";
  if ($("brandSubtitle")) $("brandSubtitle").textContent = state.periodName || "расписание";
  $("schoolName").value = state.schoolName || "Школа";
  $("periodName").value = state.periodName;
  if ($("printBtn")) $("printBtn").textContent = "Скачать скрин";
  $("viewMode").value = state.viewMode;
  $("targetLabel").textContent = state.viewMode === "teacher" ? "Учитель" : state.viewMode === "room" ? "Кабинет" : "Класс";
  fillSelect($("targetSelect"), getCollection(), getSelectedId());
  document.querySelectorAll(".tab").forEach(btn => btn.classList.toggle("active", btn.dataset.view === state.viewMode));
}

function lessonMatchesView(lesson) {
  const selected = getSelectedId();
  if (state.viewMode === "teacher") return lessonHas(lesson, "teacher", selected);
  if (state.viewMode === "room") return lessonHas(lesson, "room", selected);
  return lessonHas(lesson, "group", selected);
}

function combinedLessonDisplayParts(lessons = []) {
  const groupIds = uniqueClean(lessons.flatMap(l => lessonIds(l, "group")));
  const teacherIds = uniqueClean(lessons.flatMap(l => lessonIds(l, "teacher")));
  const roomIds = uniqueClean(lessons.flatMap(l => lessonIds(l, "room")));
  const subjectIds = uniqueClean(lessons.flatMap(l => lessonIds(l, "subject")));

  if (state.viewMode === "teacher") {
    return {
      top: namesOf("group", groupIds),
      subject: namesOf("subject", subjectIds),
      bottom: namesOf("room", roomIds),
      modeClass: "teacher-view-card",
      subjectIds
    };
  }
  if (state.viewMode === "room") {
    return {
      top: namesOf("group", groupIds),
      subject: namesOf("subject", subjectIds),
      bottom: namesOf("teacher", teacherIds),
      modeClass: "room-view-card",
      subjectIds
    };
  }
  return {
    top: namesOf("teacher", teacherIds),
    subject: namesOf("subject", subjectIds),
    bottom: namesOf("room", roomIds),
    modeClass: "group-view-card",
    subjectIds
  };
}

function lessonTitleText(lessons = []) {
  return lessons.map((lesson, index) => {
    const groups = namesOf("group", lessonIds(lesson, "group"));
    const subjects = namesOf("subject", lessonIds(lesson, "subject"));
    const teachers = namesOf("teacher", lessonIds(lesson, "teacher"));
    const rooms = namesOf("room", lessonIds(lesson, "room"));
    return `${index + 1}) ${groups} · ${subjects} · ${teachers} · ${rooms}`;
  }).join("\n");
}

function openMultiLessonEditor(lessons = []) {
  if (!lessons.length) return;
  if (lessons.length === 1) {
    openLessonModal(lessons[0]);
    return;
  }
  const menu = lessons.map((lesson, index) => {
    return `${index + 1}. ${namesOf("group", lessonIds(lesson, "group"))} — ${namesOf("subject", lessonIds(lesson, "subject"))} — ${namesOf("teacher", lessonIds(lesson, "teacher"))} — ${namesOf("room", lessonIds(lesson, "room"))}`;
  }).join("\n");
  const answer = prompt(`В этой клетке несколько уроков. Какой открыть?\n\n${menu}`, "1");
  const idx = Number(answer) - 1;
  if (Number.isInteger(idx) && lessons[idx]) openLessonModal(lessons[idx]);
}

function renderSchedule() {
  renderTopFields();
  const selectedItem = findById(getCollection(), getSelectedId());
  $("scheduleTitle").textContent = selectedItem?.name || "Расписание";
  $("subTitle").textContent = `${state.schoolName || "Школа"}${state.periodName ? " · " + state.periodName : ""}`;

  const table = $("scheduleTable");
  table.innerHTML = "";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  const corner = document.createElement("th");
  corner.textContent = "";
  headRow.appendChild(corner);
  for (const slot of state.slots) {
    const th = document.createElement("th");
    th.innerHTML = `${escapeHtml(slot.title)}<small>${escapeHtml(slot.start)} - ${escapeHtml(slot.end)}</small>`;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const day of state.days) {
    const tr = document.createElement("tr");
    const dayTd = document.createElement("td");
    dayTd.className = "day-cell";
    dayTd.textContent = day.short;
    tr.appendChild(dayTd);
    for (const slot of state.slots) {
      const td = document.createElement("td");
      td.className = "lesson-cell";
      td.dataset.day = day.id;
      td.dataset.slot = slot.id;
      const lessons = state.lessons.filter(l => l.day === day.id && l.slot === slot.id && lessonMatchesView(l));
      if (!lessons.length) {
        // Пустая клетка остаётся без подсказки на экране, но содержит невидимый элемент,
        // чтобы Android/Chrome PDF всегда печатал полную сетку.
        const fill = document.createElement("span");
        fill.className = "print-cell-fill";
        fill.setAttribute("aria-hidden", "true");
        fill.innerHTML = "&nbsp;";
        td.appendChild(fill);
        if (canEdit()) {
          td.title = "Добавить урок";
          td.addEventListener("click", () => openLessonModal({ day: day.id, slot: slot.id }));
        }
      } else {
        const parts = combinedLessonDisplayParts(lessons);
        const card = document.createElement("div");
        const types = uniqueClean(lessons.map(l => l.type || "normal"));
        const cardType = types.includes("control") ? "control" : (types.includes("lab") ? "lab" : (types.includes("classhour") ? "classhour" : "normal"));
        card.className = `lesson-card ${cardType} ${parts.modeClass} ${lessons.length > 1 ? "multi-lesson-card" : ""}`;
        card.title = lessonTitleText(lessons);
        card.style.setProperty("--subject-color", subjectBackground(parts.subjectIds));
        card.innerHTML = `
          <div class="lesson-teacher">${escapeHtml(parts.top)}</div>
          <div class="lesson-subject">${escapeHtml(parts.subject)}</div>
          <div class="lesson-room">${escapeHtml(parts.bottom)}</div>
        `;
        if (canEdit()) card.addEventListener("click", (e) => { e.stopPropagation(); openMultiLessonEditor(lessons); });
        td.appendChild(card);
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
}

function escapeHtml(str = "") {
  return String(str).replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[ch]));
}

function plainText(str = "") {
  return String(str || "").replace(/\s+/g, " ").trim();
}

function wrapCanvasText(ctx, text, maxWidth, maxLines = 2) {
  const words = plainText(text).split(" ").filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.length) {
    let last = lines[lines.length - 1];
    while (ctx.measureText(`${last}...`).width > maxWidth && last.length > 1) last = last.slice(0, -1);
    if (last !== lines[lines.length - 1]) lines[lines.length - 1] = `${last}...`;
  }
  return lines;
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2, align = "left") {
  const lines = wrapCanvasText(ctx, text, maxWidth, maxLines);
  ctx.textAlign = align;
  const tx = align === "center" ? x + maxWidth / 2 : align === "right" ? x + maxWidth : x;
  lines.forEach((line, index) => ctx.fillText(line, tx, y + index * lineHeight));
}

function canvasSubjectFill(ctx, x, y, w, h, subjectIds = []) {
  const ids = uniqueClean(subjectIds);
  if (ids.length <= 1) return colorForSubject(ids[0]) || "#DFFF9D";
  const gradient = ctx.createLinearGradient(x, y, x + w, y);
  ids.forEach((id, index) => {
    const stop = ids.length === 1 ? 0 : index / (ids.length - 1);
    gradient.addColorStop(stop, colorForSubject(id));
  });
  return gradient;
}

function scheduleImageFilename() {
  const selectedItem = findById(getCollection(), getSelectedId());
  const name = plainText(selectedItem?.name || "schedule")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 60) || "schedule";
  return `${name}.png`;
}

function downloadScheduleImage() {
  const selectedItem = findById(getCollection(), getSelectedId());
  const slots = state.slots || [];
  const days = state.days || [];
  if (!slots.length || !days.length) {
    toast("Нет данных для скачивания");
    return;
  }

  const canvas = document.createElement("canvas");
  const scale = 2;
  const cssWidth = Math.max(1500, 130 + slots.length * 190);
  const headerTop = 28;
  const titleBlock = 92;
  const margin = 42;
  const headerHeight = 58;
  const rowHeight = 138;
  const tableWidth = cssWidth - margin * 2;
  const tableHeight = headerHeight + days.length * rowHeight;
  const cssHeight = headerTop + titleBlock + tableHeight + 46;
  canvas.width = cssWidth * scale;
  canvas.height = cssHeight * scale;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  ctx.textBaseline = "top";

  ctx.fillStyle = "#111111";
  ctx.font = "700 17px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${state.schoolName || "Школа"}${state.periodName ? " · " + state.periodName : ""}`, cssWidth / 2, headerTop);
  ctx.font = "900 36px Arial, sans-serif";
  ctx.fillText(selectedItem?.name || "Расписание", cssWidth / 2, headerTop + 28);

  const x0 = margin;
  const y0 = headerTop + titleBlock;
  const dayWidth = 58;
  const slotWidth = (tableWidth - dayWidth) / slots.length;

  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 2;
  ctx.strokeRect(x0, y0, tableWidth, tableHeight);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x0, y0, tableWidth, headerHeight);
  ctx.strokeStyle = "#222222";
  ctx.lineWidth = 1.5;

  for (let i = 0; i <= slots.length; i++) {
    const x = x0 + dayWidth + i * slotWidth;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y0 + tableHeight);
    ctx.stroke();
  }
  for (let i = 0; i <= days.length; i++) {
    const y = y0 + headerHeight + i * rowHeight;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + tableWidth, y);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(x0, y0 + headerHeight);
  ctx.lineTo(x0 + tableWidth, y0 + headerHeight);
  ctx.stroke();

  slots.forEach((slot, index) => {
    const x = x0 + dayWidth + index * slotWidth;
    ctx.fillStyle = "#111111";
    ctx.font = "900 22px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(slot.title, x + slotWidth / 2, y0 + 10);
    ctx.font = "700 12px Arial, sans-serif";
    ctx.fillText(`${slot.start} - ${slot.end}`, x + slotWidth / 2, y0 + 35);
  });

  days.forEach((day, dayIndex) => {
    const rowY = y0 + headerHeight + dayIndex * rowHeight;
    ctx.fillStyle = "#111111";
    ctx.font = "900 24px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(day.short, x0 + dayWidth / 2, rowY + rowHeight / 2);
    ctx.textBaseline = "top";

    slots.forEach((slot, slotIndex) => {
      const cellX = x0 + dayWidth + slotIndex * slotWidth;
      const lessons = state.lessons.filter(l => l.day === day.id && l.slot === slot.id && lessonMatchesView(l));
      if (!lessons.length) return;
      const parts = combinedLessonDisplayParts(lessons);
      const pad = 0;
      const cardX = cellX + pad;
      const cardY = rowY + pad;
      const cardW = slotWidth - pad * 2;
      const cardH = rowHeight - pad * 2;

      ctx.fillStyle = canvasSubjectFill(ctx, cardX, cardY, cardW, cardH, parts.subjectIds);
      ctx.fillRect(cardX, cardY, cardW, cardH);
      ctx.strokeStyle = "rgba(0,0,0,.16)";
      ctx.lineWidth = 1;
      ctx.strokeRect(cardX, cardY, cardW, cardH);

      ctx.fillStyle = "#111111";
      ctx.font = "900 13px Arial, sans-serif";
      drawWrappedText(ctx, parts.top, cardX + 8, cardY + 8, cardW - 16, 15, 2, "left");

      ctx.font = "900 17px Arial, sans-serif";
      ctx.textBaseline = "middle";
      drawWrappedText(ctx, parts.subject, cardX + 10, cardY + cardH / 2 - 15, cardW - 20, 20, 2, "center");
      ctx.textBaseline = "top";

      const stripH = 24;
      const stripY = cardY + cardH - stripH;
      ctx.fillStyle = "#c7c7c7";
      ctx.fillRect(cardX, stripY, cardW * 0.28, stripH);
      ctx.fillStyle = "#ffe4ab";
      ctx.fillRect(cardX + cardW * 0.28, stripY, cardW * 0.48, stripH);
      ctx.fillStyle = "#d9fbff";
      ctx.fillRect(cardX + cardW * 0.76, stripY, cardW * 0.24, stripH);
      ctx.fillStyle = "#111111";
      ctx.font = "900 17px Arial, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(plainText(parts.bottom), cardX + cardW - 7, stripY + stripH / 2);
      ctx.textBaseline = "top";
    });
  });

  const link = document.createElement("a");
  link.download = scheduleImageFilename();
  link.href = canvas.toDataURL("image/png");
  link.click();
  toast("Скрин расписания скачан");
}

function teacherIdForSubject(subjectId) {
  const subject = findById(state.subjects, subjectId);
  return teacherForSubject(subject)?.id || "";
}

function selectOnlyValues(select, values = []) {
  const chosen = new Set(values.filter(Boolean));
  Array.from(select?.options || []).forEach(option => {
    option.selected = chosen.has(option.value);
  });
}

function applySubjectTeacherToLesson() {
  const teacherId = teacherIdForSubject($("lessonSubject")?.value);
  if (!teacherId) return;
  selectOnlyValues($("lessonTeacher"), [teacherId]);
}

function populateLessonForm(data = {}) {
  ["lessonGroup", "lessonTeacher", "lessonRoom"].forEach(id => {
    const select = $(id);
    if (select) {
      select.multiple = true;
      select.size = Math.min(5, Math.max(2, (id === "lessonGroup" ? state.groups.length : id === "lessonTeacher" ? state.teachers.length : state.rooms.length)));
    }
  });
  fillSelect($("lessonDay"), state.days.map(d => ({ id: d.id, name: d.name, extra: d.short })), data.day || state.days[0]?.id);
  fillSelect($("lessonSlot"), state.slots.map(s => ({ id: s.id, name: `${s.title}`, extra: `${s.start}-${s.end}` })), data.slot || state.slots[0]?.id);

  const defaultGroupIds = data.id ? lessonIds(data, "group") : [state.viewMode === "group" ? getSelectedId() : state.groups[0]?.id].filter(Boolean);
  const defaultRoomIds = data.id ? lessonIds(data, "room") : [state.viewMode === "room" ? getSelectedId() : state.rooms[0]?.id].filter(Boolean);
  const selectedSubjectId = data.subjectId || lessonIds(data, "subject")[0] || state.subjects[0]?.id || "";
  const linkedTeacherId = teacherIdForSubject(selectedSubjectId);
  const defaultTeacherIds = data.id
    ? lessonIds(data, "teacher")
    : [linkedTeacherId || (state.viewMode === "teacher" ? getSelectedId() : state.teachers[0]?.id)].filter(Boolean);

  fillMultiSelect($("lessonGroup"), state.groups, defaultGroupIds);
  fillSelect($("lessonSubject"), state.subjects, selectedSubjectId);
  fillMultiSelect($("lessonTeacher"), state.teachers, defaultTeacherIds);
  fillMultiSelect($("lessonRoom"), state.rooms, defaultRoomIds);
  $("lessonType").value = data.type || "normal";
  $("lessonNote").value = data.note || "";
}

function openLessonModal(data = {}) {
  if (!adminGuard()) return;
  populateLessonForm(data);
  $("lessonId").value = data.id || "";
  $("lessonModalTitle").textContent = data.id ? "Редактировать урок" : "Добавить урок";
  $("deleteLessonBtn").classList.toggle("hidden", !data.id);
  $("conflictBox").classList.add("hidden");
  $("lessonDialog").showModal();
  checkConflicts();
}

function readLessonForm() {
  const groupIds = selectedValues($("lessonGroup"));
  const teacherIds = selectedValues($("lessonTeacher"));
  const roomIds = selectedValues($("lessonRoom"));
  const subjectId = $("lessonSubject").value;
  return {
    id: $("lessonId").value || uid("l"),
    day: $("lessonDay").value,
    slot: $("lessonSlot").value,
    groupIds,
    teacherIds,
    roomIds,
    subjectIds: [subjectId].filter(Boolean),
    groupId: groupIds[0] || "",
    subjectId,
    teacherId: teacherIds[0] || "",
    roomId: roomIds[0] || "",
    type: $("lessonType").value,
    note: $("lessonNote").value.trim()
  };
}

function getConflicts(lesson) {
  const lessonGroupIds = lessonIds(lesson, "group");
  const lessonTeacherIds = lessonIds(lesson, "teacher");
  const lessonRoomIds = lessonIds(lesson, "room");
  return state.lessons.filter(l => l.id !== lesson.id && l.day === lesson.day && l.slot === lesson.slot).filter(l => (
    intersects(lessonIds(l, "group"), lessonGroupIds) || intersects(lessonIds(l, "teacher"), lessonTeacherIds) || intersects(lessonIds(l, "room"), lessonRoomIds)
  )).map(l => {
    const problems = [];
    const groups = lessonIds(l, "group").filter(id => lessonGroupIds.includes(id));
    const teachers = lessonIds(l, "teacher").filter(id => lessonTeacherIds.includes(id));
    const rooms = lessonIds(l, "room").filter(id => lessonRoomIds.includes(id));
    if (groups.length) problems.push(`класс ${namesOf("group", groups)}`);
    if (teachers.length) problems.push(`учитель ${namesOf("teacher", teachers)}`);
    if (rooms.length) problems.push(`кабинет ${namesOf("room", rooms)}`);
    return `${namesOf("subject", lessonIds(l, "subject"))} — занято: ${problems.join(", ")}`;
  });
}

function checkConflicts() {
  const lesson = readLessonForm();
  const conflicts = getConflicts(lesson);
  const box = $("conflictBox");
  if (!conflicts.length) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return [];
  }
  box.classList.remove("hidden");
  box.innerHTML = `<b>Есть пересечение:</b><br>${conflicts.map(escapeHtml).join("<br>")}<br><small>Можно сохранить, но лучше исправить.</small>`;
  return conflicts;
}

function saveLesson(e) {
  e.preventDefault();
  if (!adminGuard()) return;
  const lesson = readLessonForm();
  if (!lessonIds(lesson, "group").length || !lesson.subjectId || !lessonIds(lesson, "teacher").length || !lessonIds(lesson, "room").length) {
    toast("Выберите класс, предмет, учителя и кабинет");
    return;
  }
  const index = state.lessons.findIndex(l => l.id === lesson.id);
  if (index >= 0) state.lessons[index] = lesson;
  else state.lessons.push(lesson);
  saveState();
  $("lessonDialog").close();
  renderAll();
  toast("Урок сохранён");
}

function deleteLesson() {
  if (!adminGuard()) return;
  const id = $("lessonId").value;
  if (!id) return;
  state.lessons = state.lessons.filter(l => l.id !== id);
  saveState();
  $("lessonDialog").close();
  renderAll();
  toast("Урок удалён");
}

function renderDataList() {
  const titles = { groups: "Классы", teachers: "Учителя", rooms: "Кабинеты", subjects: "Предметы" };
  $("dataTitle").textContent = titles[currentDataList];
  document.querySelectorAll(".data-tab").forEach(btn => btn.classList.toggle("active", btn.dataset.list === currentDataList));
  const list = state[currentDataList];
  const wrap = $("dataList");
  wrap.innerHTML = "";
  if (!list.length) {
    wrap.innerHTML = `<div class="item-card"><b>Пусто</b><span>Нажмите “Добавить”.</span></div>`;
    return;
  }
  for (const item of list) {
    const card = document.createElement("div");
    card.className = "item-card";
    const teacher = currentDataList === "subjects" && item.teacherId ? findById(state.teachers, item.teacherId) : null;
    const description = [
      item.extra || "Без описания",
      teacher ? `Учитель: ${teacher.name}` : ""
    ].filter(Boolean).join(" · ");
    card.innerHTML = `<b>${escapeHtml(item.name)}</b><span>${escapeHtml(description)}</span>`;
    if (canEdit()) card.addEventListener("click", () => openItemModal(currentDataList, item));
    wrap.appendChild(card);
  }
}

function openItemModal(type, item = {}) {
  if (!adminGuard()) return;
  const labels = {
    groups: ["Название класса", "Уровень / описание"],
    teachers: ["Имя учителя", "Основной предмет"],
    rooms: ["Кабинет", "Этаж / тип кабинета"],
    subjects: ["Название предмета", "Описание"]
  };
  $("itemType").value = type;
  $("itemId").value = item.id || "";
  $("itemName").value = item.name || "";
  $("itemExtra").value = item.extra || "";
  $("itemNameLabel").textContent = labels[type][0];
  $("itemExtraLabel").textContent = labels[type][1];
  const teacherWrap = $("itemTeacherWrap");
  if (teacherWrap) {
    teacherWrap.classList.toggle("hidden", type !== "subjects");
    fillSelect($("itemTeacher"), [{ id: "", name: "Не привязан" }, ...state.teachers], item.teacherId || "");
  }
  $("itemModalTitle").textContent = item.id ? "Редактировать" : "Добавить";
  $("deleteItemBtn").classList.toggle("hidden", !item.id);
  $("itemDialog").showModal();
  setTimeout(() => $("itemName").focus(), 50);
}

function saveItem(e) {
  e.preventDefault();
  if (!adminGuard()) return;
  const type = $("itemType").value;
  const id = $("itemId").value || uid(type.slice(0, 1));
  const index = state[type].findIndex(x => x.id === id);
  const oldItem = index >= 0 ? state[type][index] : null;
  const item = { id, name: $("itemName").value.trim(), extra: $("itemExtra").value.trim() };
  if (type === "subjects") {
    item.color = oldItem?.color || pickSubjectColor(id || item.name);
    item.teacherId = $("itemTeacher")?.value || "";
  }
  if (!item.name) return;
  if (index >= 0) state[type][index] = item;
  else state[type].push(item);
  if (!state.selected.group && state.groups[0]) state.selected.group = state.groups[0].id;
  if (!state.selected.teacher && state.teachers[0]) state.selected.teacher = state.teachers[0].id;
  if (!state.selected.room && state.rooms[0]) state.selected.room = state.rooms[0].id;
  saveState();
  $("itemDialog").close();
  renderAll();
  toast("Сохранено");
}

function deleteItem() {
  if (!adminGuard()) return;
  const type = $("itemType").value;
  const id = $("itemId").value;
  if (!id) return;
  const used = state.lessons.some(l => {
    if (type === "groups") return lessonHas(l, "group", id);
    if (type === "teachers") return lessonHas(l, "teacher", id);
    if (type === "rooms") return lessonHas(l, "room", id);
    if (type === "subjects") return lessonHas(l, "subject", id);
    return false;
  });
  if (used && !confirm("Этот элемент используется в расписании. Удалить вместе с уроками?")) return;
  state[type] = state[type].filter(item => item.id !== id);
  if (type === "teachers") {
    state.subjects.forEach(subject => {
      if (subject.teacherId === id) subject.teacherId = "";
    });
  }
  state.lessons = state.lessons.filter(l => {
    if (type === "groups") return !lessonHas(l, "group", id);
    if (type === "teachers") return !lessonHas(l, "teacher", id);
    if (type === "rooms") return !lessonHas(l, "room", id);
    if (type === "subjects") return !lessonHas(l, "subject", id);
    return true;
  });
  if (type === "groups") state.selected.group = state.groups[0]?.id || "";
  if (type === "teachers") state.selected.teacher = state.teachers[0]?.id || "";
  if (type === "rooms") state.selected.room = state.rooms[0]?.id || "";
  saveState();
  $("itemDialog").close();
  renderAll();
  toast("Удалено");
}

function renderSlotsEditor() {
  const wrap = $("slotsEditor");
  wrap.innerHTML = "";
  state.slots.forEach((slot) => {
    const row = document.createElement("div");
    row.className = "slot-row";
    row.innerHTML = `
      <input value="${escapeHtml(slot.title)}" data-slot-field="title" data-slot-id="${slot.id}" aria-label="номер урока">
      <input value="${escapeHtml(slot.start)}" data-slot-field="start" data-slot-id="${slot.id}" aria-label="начало">
      <input value="${escapeHtml(slot.end)}" data-slot-field="end" data-slot-id="${slot.id}" aria-label="конец">
      <button class="icon-btn" title="Удалить" data-remove-slot="${slot.id}">×</button>
    `;
    wrap.appendChild(row);
  });
}

function updateSlot(id, field, value) {
  const slot = state.slots.find(s => s.id === id);
  if (!slot) return;
  slot[field] = value;
  saveState();
  renderSchedule();
}

function removeSlot(id) {
  if (state.lessons.some(l => l.slot === id) && !confirm("В этом уроке есть расписание. Удалить его тоже?")) return;
  state.slots = state.slots.filter(s => s.id !== id);
  state.lessons = state.lessons.filter(l => l.slot !== id);
  saveState();
  renderAll();
}

function addSlot() {
  const n = state.slots.length + 1;
  state.slots.push({ id: uid("s"), title: String(n), start: "00:00", end: "00:00" });
  saveState();
  renderAll();
}

function getTimetableDbJson(updateStamp = true) {
  if (updateStamp && !databaseUpdatedAt) databaseUpdatedAt = nowIso();
  const data = normalizeState(state);
  syncCurrentSchoolToList();
  return {
    version: Math.max(1, Number(databaseVersion || 0)),
    type: "school-timetable",
    updatedAt: databaseUpdatedAt || nowIso(),
    updatedBy: currentUser?.username || "system",
    schoolName: data.schoolName || "",
    periodName: data.periodName || "",
    data
  };
}

function getUsersJson(updateStamp = true) {
  if (updateStamp && !usersUpdatedAt) usersUpdatedAt = nowIso();
  return {
    version: Math.max(1, Number(usersVersion || 0)),
    type: "school-timetable-access",
    updatedAt: usersUpdatedAt || nowIso(),
    updatedBy: currentUser?.username || "unknown",
    users: users
  };
}

function downloadJsonFile(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function downloadDbJson() { downloadJsonFile("timetable-db.json", getTimetableDbJson()); }
function downloadUsersJson() { downloadJsonFile("users.json", getUsersJson()); }
function downloadAllJson() {
  downloadDbJson();
  setTimeout(downloadUsersJson, 350);
  toast("Файлы скачиваются");
}

function importTimetableJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      applyDbPayload(imported);
      databaseVersion = Math.max(databaseVersion, Number(imported?.version || 0));
      saveState();
      renderAll();
      toast("Расписание загружено");
    } catch (e) { alert("Не удалось прочитать JSON файл"); }
  };
  reader.readAsText(file);
}

function importUsersJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      usersVersion = Math.max(usersVersion, Number(imported?.version || 0));
      users = normalizeUsers(imported);
      saveUsers();
      renderAll();
      toast("Доступ загружен");
    } catch (e) { alert("Не удалось прочитать users.json"); }
  };
  reader.readAsText(file);
}

async function reloadFromGithubJson() {
  const db = await fetchJsonFile(DATA_URL);
  const access = await fetchJsonFile(USERS_URL);
  if (!db && !access) {
    toast("Файлы не найдены");
    return;
  }
  if (db) { applyDbPayload(db); saveState(false); }
  if (access) { usersVersion = Math.max(usersVersion, Number(access?.version || 0)); users = normalizeUsers(access); saveUsers(false); }
  renderAll();
  toast("Данные обновлены");
}

function statsText() {
  return [
    `Школа: ${state.schoolName || "—"}`,
    `Период: ${state.periodName || "—"}`,
    `Классы: ${state.groups.length}`,
    `Учителя: ${state.teachers.length}`,
    `Кабинеты: ${state.rooms.length}`,
    `Предметы: ${state.subjects.length}`,
    `Уроки: ${state.lessons.length}`,
    `Пользователи: ${users.length}`,
    `Отправил: ${currentUser?.username || "unknown"}`,
    `Время: ${new Date().toLocaleString("ru-RU")}`
  ].join("\n");
}

async function telegramFetch(method, body, isForm = false) {
  const token = telegramSettings.botToken;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    body: isForm ? body : JSON.stringify(body),
    headers: isForm ? undefined : { "Content-Type": "application/json" }
  });
  const data = await res.json().catch(() => ({ ok: false, description: "Не удалось прочитать ответ Telegram" }));
  if (!data.ok) throw new Error(data.description || "Telegram API error");
  return data;
}

async function sendJsonDocument(filename, obj, caption) {
  const form = new FormData();
  form.append("chat_id", telegramSettings.chatId);
  form.append("caption", caption);
  form.append("document", new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }), filename);
  return telegramFetch("sendDocument", form, true);
}

async function sendTelegramReport() {
  saveTelegramSettings();
  const status = $("telegramStatus");
  if (status) status.textContent = "Отчёт отправится только после финальной кнопки «Сохранить».";
  toast("Отчёт отправится после «Сохранить»");
}

async function autoTelegramBackup(reason = "Автосохранение") {
  if (!isAdmin()) return;
  if (!telegramSettings.botToken || !telegramSettings.chatId) return;
  const currentHash = databaseFingerprint();
  if (currentHash === lastAutoReportHash) return;
  if (autoReportBusy) {
    autoReportQueued = true;
    return;
  }
  autoReportBusy = true;
  const status = $("telegramStatus");
  
  try {
    await telegramFetch("sendMessage", {
      chat_id: telegramSettings.chatId,
      text: `Обновление\n\n${statsText()}`
    });
    await sendJsonDocument("timetable-db.json", getTimetableDbJson(), "timetable-db.json");
    await sendJsonDocument("users.json", getUsersJson(), "users.json");
    lastAutoReportHash = databaseFingerprint();
    
  } catch (e) {
    console.error(e);
    
  } finally {
    autoReportBusy = false;
    if (autoReportQueued) {
      autoReportQueued = false;
      scheduleAutoTelegramBackup("Новая правка во время отправки");
    }
  }
}

function renderUsersList() {
  const wrap = $("usersList");
  if (!wrap) return;
  wrap.innerHTML = "";
  users.forEach(user => {
    const card = document.createElement("div");
    card.className = `user-row ${user.active === false ? "inactive" : ""}`;
    card.innerHTML = `
      <div>
        <b>${escapeHtml(user.name || user.username)}</b>
        <span>${escapeHtml(user.username)}</span>
        <small>${escapeHtml(user.role)} ${user.active === false ? "· выключен" : "· активен"}</small>
      </div>
      <button class="ghost small" data-edit-user="${user.id}">Изменить</button>
    `;
    wrap.appendChild(card);
  });
}

function openUserModal(user = {}) {
  $("userId").value = user.id || "";
  $("userLogin").value = user.username || "";
  $("userPassword").value = user.password || "";
  $("userName").value = user.name || "";
  $("userRole").value = user.role || "teacher";
  $("userActive").checked = user.active !== false;
  $("userModalTitle").textContent = user.id ? "Редактировать пользователя" : "Добавить пользователя";
  $("deleteUserBtn").classList.toggle("hidden", !user.id);
  $("userDialog").showModal();
}

function saveUser(e) {
  e.preventDefault();
  const id = $("userId").value || uid("u");
  const user = {
    id,
    username: $("userLogin").value.trim(),
    password: $("userPassword").value,
    name: $("userName").value.trim() || $("userLogin").value.trim(),
    role: $("userRole").value,
    active: $("userActive").checked
  };
  if (!user.username || !user.password) { toast("Введите логин и пароль"); return; }
  const duplicated = users.some(u => u.id !== id && u.username === user.username);
  if (duplicated) { toast("Такой логин уже есть"); return; }
  const index = users.findIndex(u => u.id === id);
  if (index >= 0) users[index] = user;
  else users.push(user);
  saveUsers();
  $("userDialog").close();
  renderUsersList();
  toast("Пользователь сохранён");
}

function deleteUser() {
  const id = $("userId").value;
  if (!id) return;
  if (users.length <= 1) { toast("Нужен хотя бы один пользователь"); return; }
  if (!confirm("Удалить пользователя?")) return;
  users = users.filter(u => u.id !== id);
  saveUsers();
  $("userDialog").close();
  renderUsersList();
  toast("Пользователь удалён");
}


function getAutoOptions() {
  state.autoOptions = { ...clone(defaultState.autoOptions), ...(state.autoOptions || {}) };
  return state.autoOptions;
}

function saveAutoOptions() {
  const options = getAutoOptions();
  options.maxPerDay = Math.max(1, Math.min(12, Number($("autoMaxPerDay")?.value || 6)));
  options.clearBeforeGenerate = Boolean($("autoClearBefore")?.checked);
  options.juniorEarly = Boolean($("autoJuniorEarly")?.checked);
  saveState();
}

function typeLabel(type) {
  const map = { normal: "Обычный", control: "Контрольная", lab: "Лабораторная", classhour: "Классный час" };
  return map[type] || "Обычный";
}

function optionsHtml(items, selectedId) {
  return items.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === selectedId ? "selected" : ""}>${escapeHtml(item.name)}${item.extra ? " — " + escapeHtml(item.extra) : ""}</option>`).join("");
}

function validAutoRules() {
  return (state.autoRules || [])
    .map(normalizeAutoRule)
    .filter(r => r.groupId && r.subjectId && r.teacherId && r.roomId && r.count > 0);
}

function autoRuleProblems() {
  const problems = [];
  if (!state.groups.length) problems.push("нет классов");
  if (!state.subjects.length) problems.push("нет предметов");
  if (!state.teachers.length) problems.push("нет учителей");
  if (!state.rooms.length) problems.push("нет кабинетов");
  if (state.autoRules?.length && !validAutoRules().length) problems.push("строки нагрузки не заполнены");
  return problems;
}

function renderAutoSummary() {
  const wrap = $("autoSummary");
  if (!wrap) return;
  const rules = validAutoRules();
  const totalLessons = rules.reduce((sum, rule) => sum + Number(rule.count || 0), 0);
  const autoLessons = (state.lessons || []).filter(l => l.autoGenerated || l.note === "авто").length;
  const problems = autoRuleProblems();
  const items = [
    { label: "Строк нагрузки", value: rules.length },
    { label: "Уроков к генерации", value: totalLessons },
    { label: "Авто-уроков сейчас", value: autoLessons },
    { label: "Статус", value: problems.length ? problems.join(", ") : "готово", tone: problems.length ? "warn" : "ok" }
  ];
  wrap.innerHTML = items.map(item => `
    <div class="auto-summary-item ${item.tone || ""}">
      <b>${escapeHtml(item.value)}</b>
      <span>${escapeHtml(item.label)}</span>
    </div>
  `).join("");
}

function renderAutoPanel() {
  if (!$("autoRulesBody")) return;
  const options = getAutoOptions();
  $("autoMaxPerDay").value = options.maxPerDay || 6;
  $("autoClearBefore").checked = options.clearBeforeGenerate !== false;
  $("autoJuniorEarly").checked = options.juniorEarly !== false;
  renderAutoSummary();
  renderAutoRules();
}

function normalizeAutoRule(rule = {}) {
  return {
    id: rule.id || uid("ar"),
    groupId: rule.groupId || state.groups[0]?.id || "",
    subjectId: rule.subjectId || state.subjects[0]?.id || "",
    teacherId: rule.teacherId || state.teachers[0]?.id || "",
    roomId: rule.roomId || state.rooms[0]?.id || "",
    count: Math.max(1, Math.min(12, Number(rule.count || 1))),
    type: rule.type || "normal"
  };
}

function renderAutoRules() {
  const body = $("autoRulesBody");
  if (!body) return;
  state.autoRules = Array.isArray(state.autoRules) ? state.autoRules.map(normalizeAutoRule) : [];
  body.innerHTML = "";
  if (!state.autoRules.length) {
    body.innerHTML = `<tr><td colspan="7" class="auto-empty">Нагрузка пустая. Нажмите “Создать нагрузку из данных”.</td></tr>`;
    return;
  }
  state.autoRules.forEach(rule => {
    const tr = document.createElement("tr");
    tr.dataset.ruleId = rule.id;
    const groupName = nameOf("group", rule.groupId);
    const subjectName = nameOf("subject", rule.subjectId);
    tr.innerHTML = `
      <td data-label="Класс"><select data-auto-field="groupId">${optionsHtml(state.groups, rule.groupId)}</select></td>
      <td data-label="Предмет"><select data-auto-field="subjectId">${optionsHtml(state.subjects, rule.subjectId)}</select></td>
      <td data-label="Учитель"><select data-auto-field="teacherId">${optionsHtml(state.teachers, rule.teacherId)}</select></td>
      <td data-label="Кабинет"><select data-auto-field="roomId">${optionsHtml(state.rooms, rule.roomId)}</select></td>
      <td data-label="Раз/нед."><input data-auto-field="count" type="number" min="1" max="12" value="${escapeHtml(rule.count)}" /></td>
      <td data-label="Тип">
        <select data-auto-field="type">
          ${["normal", "control", "lab", "classhour"].map(t => `<option value="${t}" ${rule.type === t ? "selected" : ""}>${typeLabel(t)}</option>`).join("")}
        </select>
      </td>
      <td data-label="${escapeHtml(`${groupName} · ${subjectName}`)}"><button class="icon-btn" title="Удалить" data-remove-auto-rule="${escapeHtml(rule.id)}">×</button></td>
    `;
    body.appendChild(tr);
  });
  renderAutoSummary();
}

function addAutoRule() {
  if (!adminGuard()) return;
  state.autoRules = Array.isArray(state.autoRules) ? state.autoRules : [];
  state.autoRules.push(normalizeAutoRule({ count: 1 }));
  saveState();
  renderAutoRules();
  renderAutoSummary();
}

function updateAutoRule(id, field, value) {
  const rule = state.autoRules.find(r => r.id === id);
  if (!rule) return;
  rule[field] = field === "count" ? Math.max(1, Math.min(12, Number(value || 1))) : value;
  saveState();
  renderAutoSummary();
}

function removeAutoRule(id) {
  if (!adminGuard()) return;
  state.autoRules = (state.autoRules || []).filter(r => r.id !== id);
  saveState();
  renderAutoRules();
  renderAutoSummary();
}

function clearAutoRules() {
  if (!adminGuard()) return;
  if (!confirm("Очистить всю нагрузку для авторасписания?")) return;
  state.autoRules = [];
  saveState();
  renderAutoRules();
  renderAutoSummary();
  toast("Нагрузка очищена");
}

function groupGrade(group) {
  const m = String(group?.name || "").match(/\d+/);
  return m ? Number(m[0]) : 5;
}

function teacherForSubject(subject) {
  if (subject?.teacherId) {
    const linked = findById(state.teachers, subject.teacherId);
    if (linked) return linked;
  }
  const name = String(subject?.name || "").toLowerCase();
  return state.teachers.find(t => String(t.extra || "").toLowerCase().includes(name)) || state.teachers[0];
}

function roomForSubject(subject) {
  const name = String(subject?.name || "").toLowerCase();
  if (name.includes("физкультур")) return state.rooms.find(r => String(r.name + " " + r.extra).toLowerCase().includes("спорт")) || state.rooms[0];
  if (name.includes("информ")) return state.rooms.find(r => String(r.name + " " + r.extra).toLowerCase().includes("комп")) || state.rooms[0];
  if (name.includes("физик") || name.includes("хим") || name.includes("биолог")) return state.rooms.find(r => String(r.name + " " + r.extra).toLowerCase().includes("лабо")) || state.rooms[0];
  return state.rooms[0];
}

function roomForGroupSubject(group, subject, groupIndex = 0) {
  const specialized = roomForSubject(subject);
  if (specialized && specialized !== state.rooms[0]) return specialized;
  const groupName = String(group?.name || "").toLowerCase();
  const compactGroup = groupName.replace(/\s*класс\s*/g, "").trim();
  const matched = state.rooms.find(room => {
    const haystack = String(`${room.name} ${room.extra}`).toLowerCase();
    return compactGroup && haystack.includes(compactGroup);
  });
  return matched || state.rooms[groupIndex % Math.max(1, state.rooms.length)] || state.rooms[0];
}

function suggestedCountFor(group, subject) {
  const grade = groupGrade(group);
  const name = String(subject?.name || "").toLowerCase();
  if (name.includes("математ")) return grade <= 4 ? 4 : 5;
  if (name.includes("рус")) return grade <= 4 ? 4 : 3;
  if (name.includes("англ")) return grade <= 4 ? 2 : 3;
  if (name.includes("физкультур")) return 2;
  if (name.includes("классный")) return 1;
  if (name.includes("информ")) return grade >= 5 ? 1 : 0;
  if (name.includes("истор") || name.includes("географ")) return grade >= 5 ? 2 : 0;
  if (name.includes("физик") || name.includes("биолог")) return grade >= 7 ? 2 : 0;
  return grade <= 4 ? 1 : 2;
}

function buildAutoRulesFromData() {
  if (!adminGuard()) return;
  if (!state.groups.length || !state.subjects.length || !state.teachers.length || !state.rooms.length) {
    toast("Сначала добавьте классы, предметы, учителей и кабинеты");
    return;
  }
  const rules = [];
  for (const [groupIndex, group] of state.groups.entries()) {
    for (const subject of state.subjects) {
      const count = suggestedCountFor(group, subject);
      if (count <= 0) continue;
      const teacher = teacherForSubject(subject);
      const room = roomForGroupSubject(group, subject, groupIndex);
      rules.push(normalizeAutoRule({
        groupId: group.id,
        subjectId: subject.id,
        teacherId: teacher?.id,
        roomId: room?.id,
        count,
        type: String(subject.name).toLowerCase().includes("классный") ? "classhour" : String(subject.name).toLowerCase().includes("физик") ? "lab" : "normal"
      }));
    }
  }
  state.autoRules = rules;
  saveState();
  renderAutoRules();
  renderAutoSummary();
  $("autoStatus").textContent = `Нагрузка создана: ${rules.length} строк, ${rules.reduce((sum, rule) => sum + Number(rule.count || 0), 0)} уроков в неделю. Проверьте учителей и кабинеты перед генерацией.`;
  toast(`Создано строк нагрузки: ${rules.length}`);
}

function conflictsWithPlaced(candidate, lessons) {
  return lessons.some(l => l.day === candidate.day && l.slot === candidate.slot && (
    intersects(lessonIds(l, "group"), lessonIds(candidate, "group")) ||
    intersects(lessonIds(l, "teacher"), lessonIds(candidate, "teacher")) ||
    intersects(lessonIds(l, "room"), lessonIds(candidate, "room"))
  ));
}

function lessonsForGroupDay(lessons, groupId, day) {
  return lessons.filter(l => lessonHas(l, "group", groupId) && l.day === day);
}

function lessonsForTeacherDay(lessons, teacherId, day) {
  return lessons.filter(l => lessonHas(l, "teacher", teacherId) && l.day === day);
}

function subjectSameDayCount(lessons, groupId, subjectId, day) {
  return lessons.filter(l => lessonHas(l, "group", groupId) && lessonHas(l, "subject", subjectId) && l.day === day).length;
}

function lessonSlotIndex(slotId) {
  return Math.max(0, state.slots.findIndex(s => s.id === slotId));
}

function groupDaySlotIndexes(lessons, groupId, day) {
  return lessons
    .filter(l => lessonHas(l, "group", groupId) && l.day === day)
    .map(l => lessonSlotIndex(l.slot))
    .filter(index => index >= 0)
    .sort((a, b) => a - b);
}

function groupWeekDayCounts(lessons, groupId) {
  return state.days.map(day => lessonsForGroupDay(lessons, groupId, day.id).length);
}

function wouldCreateGap(usedIndexes, slotIndex) {
  if (!usedIndexes.length) return slotIndex > 0;
  const maxUsed = Math.max(...usedIndexes);
  if (slotIndex <= maxUsed) return false;
  for (let i = 0; i < slotIndex; i++) {
    if (!usedIndexes.includes(i)) return true;
  }
  return false;
}

function findBestAutoSlot(baseLesson, placed, options) {
  const group = findById(state.groups, baseLesson.groupId);
  const grade = groupGrade(group);
  const candidates = [];
  const weekCounts = groupWeekDayCounts(placed, baseLesson.groupId);
  const minWeekCount = weekCounts.length ? Math.min(...weekCounts) : 0;
  state.days.forEach((day, dayIndex) => {
    const groupDayCount = lessonsForGroupDay(placed, baseLesson.groupId, day.id).length;
    if (groupDayCount >= options.maxPerDay) return;
    const usedSlots = groupDaySlotIndexes(placed, baseLesson.groupId, day.id);
    state.slots.forEach((slot, slotIndex) => {
      if (options.juniorEarly && grade <= 4 && slotIndex >= 5) return;
      const candidate = { ...baseLesson, day: day.id, slot: slot.id };
      if (conflictsWithPlaced(candidate, placed)) return;
      const sameSubject = subjectSameDayCount(placed, baseLesson.groupId, baseLesson.subjectId, day.id);
      const teacherDay = lessonsForTeacherDay(placed, baseLesson.teacherId, day.id).length;
      const dayBalance = Math.max(0, groupDayCount - minWeekCount);
      const compactPenalty = Math.abs(slotIndex - groupDayCount);
      const gapPenalty = wouldCreateGap(usedSlots, slotIndex) ? 1 : 0;
      const latePenalty = slotIndex;
      const score =
        (sameSubject * 900) +
        (dayBalance * 180) +
        (groupDayCount * 55) +
        (gapPenalty * 90) +
        (compactPenalty * 35) +
        (teacherDay * 24) +
        (latePenalty * 6) +
        dayIndex;
      candidates.push({ day: day.id, slot: slot.id, score, sameSubject, gapPenalty, groupDayCount });
    });
  });
  const noSameSubject = candidates.filter(c => c.sameSubject === 0);
  if (noSameSubject.length) {
    noSameSubject.sort((a, b) => a.score - b.score);
    return noSameSubject[0];
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0] || null;
}

function autoTaskLabel(task) {
  return `${nameOf("group", task.groupId)} — ${nameOf("subject", task.subjectId)} — ${nameOf("teacher", task.teacherId)}`;
}

function autoResultHtml(placedCount, totalCount, unplaced = []) {
  const ok = !unplaced.length;
  const firstUnplaced = unplaced.slice(0, 10).map(task => `<li>${escapeHtml(autoTaskLabel(task))}</li>`).join("");
  return `
    <div class="auto-result ${ok ? "ok" : "warn"}">
      <b>${ok ? "Готово" : "Готово частично"}: ${placedCount} из ${totalCount}</b>
      ${unplaced.length ? `<span>Не поставлено: ${unplaced.length}. Чаще всего мешают занятый учитель/кабинет, максимум уроков в день или ограничение для 1-4 классов.</span><ul>${firstUnplaced}</ul>` : "<span>Все уроки из нагрузки расставлены.</span>"}
    </div>
  `;
}

function generateAutoSchedule() {
  if (!adminGuard()) return;
  saveAutoOptions();
  const options = getAutoOptions();
  const problems = autoRuleProblems();
  const rules = validAutoRules();
  if (problems.length) {
    const message = `Нельзя запустить: ${problems.join(", ")}.`;
    $("autoStatus").textContent = message;
    toast(message);
    renderAutoSummary();
    return;
  }
  if (!rules.length) {
    toast("Сначала создайте нагрузку");
    $("autoStatus").textContent = "Нагрузка пустая. Нажмите “Создать нагрузку из данных”.";
    renderAutoSummary();
    return;
  }
  let placed = options.clearBeforeGenerate ? [] : state.lessons.filter(l => !l.autoGenerated);
  const tasks = [];
  for (const rule of rules) {
    for (let i = 0; i < rule.count; i++) {
      tasks.push({ ...rule, lessonIndex: i + 1 });
    }
  }
  tasks.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (a.groupId !== b.groupId) return a.groupId.localeCompare(b.groupId);
    return a.subjectId.localeCompare(b.subjectId);
  });
  const unplaced = [];
  for (const task of tasks) {
    const baseLesson = {
      id: uid("l"),
      groupId: task.groupId,
      groupIds: [task.groupId],
      subjectId: task.subjectId,
      subjectIds: [task.subjectId],
      teacherId: task.teacherId,
      teacherIds: [task.teacherId],
      roomId: task.roomId,
      roomIds: [task.roomId],
      type: task.type || "normal",
      note: "авто",
      autoGenerated: true
    };
    const slot = findBestAutoSlot(baseLesson, placed, options);
    if (!slot) {
      unplaced.push(task);
      continue;
    }
    placed.push({ ...baseLesson, day: slot.day, slot: slot.slot });
  }
  state.lessons = placed;
  saveState();
  renderAll();
  $("autoStatus").innerHTML = autoResultHtml(tasks.length - unplaced.length, tasks.length, unplaced);
  renderAutoSummary();
  toast(unplaced.length ? "Расписание создано частично" : "Авторасписание готово");
}

function clearAutoGeneratedLessons() {
  if (!adminGuard()) return;
  if (!confirm("Удалить только уроки, созданные авто-генератором?")) return;
  const before = state.lessons.length;
  state.lessons = state.lessons.filter(l => !l.autoGenerated && l.note !== "авто");
  saveState();
  renderAll();
  renderAutoSummary();
  toast(`Удалено авто-уроков: ${before - state.lessons.length}`);
}

function clearCurrentTarget() {
  if (!adminGuard()) return;
  const id = getSelectedId();
  if (!id) return;
  if (!confirm("Очистить расписание для выбранного просмотра?")) return;
  if (state.viewMode === "teacher") state.lessons = state.lessons.filter(l => !lessonHas(l, "teacher", id));
  else if (state.viewMode === "room") state.lessons = state.lessons.filter(l => !lessonHas(l, "room", id));
  else state.lessons = state.lessons.filter(l => !lessonHas(l, "group", id));
  saveState();
  renderAll();
  toast("Расписание очищено");
}

function renderTelegramSettings() {
  if (!$("telegramBotToken")) return;
  $("telegramBotToken").value = telegramSettings.botToken || "";
  $("telegramChatId").value = telegramSettings.chatId || "";
}

function renderAll() {
  renderTopFields();
  renderSchedule();
  renderDataList();
  renderSlotsEditor();
  renderUsersList();
  renderTelegramSettings();
  renderAutoPanel();
  renderAuth();
}

function bindEvents() {
  $("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    login($("loginUsername").value, $("loginPassword").value);
  });
  $("openLoginBtn")?.addEventListener("click", openAuthScreen);
  $("closeAuthBtn")?.addEventListener("click", closeAuthScreen);
  $("editModeBtn")?.addEventListener("click", toggleEditMode);
  $("logoutBtn").addEventListener("click", logout);

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const panel = $(btn.dataset.panel);
      if (panel?.classList.contains("admin-only") && !adminGuard()) return;
      activatePanel(btn.dataset.panel);
    });
  });

  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      state.viewMode = btn.dataset.view;
      saveState(false);
      renderSchedule();
    });
  });

  $("viewMode").addEventListener("change", (e) => { state.viewMode = e.target.value; saveState(false); renderSchedule(); });
  $("targetSelect").addEventListener("change", (e) => { state.selected[state.viewMode] = e.target.value; saveState(false); renderSchedule(); });
  $("schoolName").addEventListener("input", (e) => { state.schoolName = e.target.value; saveState(); renderSchedule(); });
  $("periodName").addEventListener("input", (e) => { state.periodName = e.target.value; saveState(); renderSchedule(); });
  $("printBtn").addEventListener("click", downloadScheduleImage);
  $("addLessonBtn").addEventListener("click", () => adminGuard() && openLessonModal({}));
  $("clearTargetBtn").addEventListener("click", clearCurrentTarget);

  $("lessonForm").addEventListener("submit", saveLesson);
  $("deleteLessonBtn").addEventListener("click", deleteLesson);
  $("lessonSubject").addEventListener("change", () => {
    applySubjectTeacherToLesson();
    checkConflicts();
  });
  ["lessonDay", "lessonSlot", "lessonGroup", "lessonTeacher", "lessonRoom"].forEach(id => $(id).addEventListener("change", checkConflicts));

  document.querySelectorAll("[data-close]").forEach(btn => btn.addEventListener("click", () => $(btn.dataset.close).close()));

  document.querySelectorAll(".data-tab").forEach(btn => {
    btn.addEventListener("click", () => { currentDataList = btn.dataset.list; renderDataList(); });
  });
  $("addItemBtn").addEventListener("click", () => adminGuard() && openItemModal(currentDataList));
  $("itemForm").addEventListener("submit", saveItem);
  $("deleteItemBtn").addEventListener("click", deleteItem);

  $("slotsEditor").addEventListener("input", (e) => {
    const input = e.target.closest("[data-slot-field]");
    if (!input) return;
    updateSlot(input.dataset.slotId, input.dataset.slotField, input.value);
  });
  $("slotsEditor").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-slot]");
    if (!btn) return;
    removeSlot(btn.dataset.removeSlot);
  });
  $("addSlotBtn").addEventListener("click", addSlot);

  ["autoMaxPerDay", "autoClearBefore", "autoJuniorEarly"].forEach(id => $(id)?.addEventListener("change", saveAutoOptions));
  $("buildAutoRulesBtn")?.addEventListener("click", buildAutoRulesFromData);
  $("addAutoRuleBtn")?.addEventListener("click", addAutoRule);
  $("generateAutoBtn")?.addEventListener("click", generateAutoSchedule);
  $("clearAutoRulesBtn")?.addEventListener("click", clearAutoRules);
  $("clearAutoLessonsBtn")?.addEventListener("click", clearAutoGeneratedLessons);
  $("autoRulesBody")?.addEventListener("change", (e) => {
    const input = e.target.closest("[data-auto-field]");
    if (!input) return;
    const tr = input.closest("tr[data-rule-id]");
    if (!tr) return;
    updateAutoRule(tr.dataset.ruleId, input.dataset.autoField, input.value);
  });
  $("autoRulesBody")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-auto-rule]");
    if (!btn) return;
    removeAutoRule(btn.dataset.removeAutoRule);
  });

  $("downloadDbBtn").addEventListener("click", downloadDbJson);
  $("downloadUsersBtn").addEventListener("click", downloadUsersJson);
  $("downloadAllBtn").addEventListener("click", downloadAllJson);
  $("importInput").addEventListener("change", (e) => e.target.files[0] && importTimetableJson(e.target.files[0]));
  $("importUsersInput").addEventListener("change", (e) => e.target.files[0] && importUsersJson(e.target.files[0]));
  $("reloadGithubBtn").addEventListener("click", reloadFromGithubJson);
  $("clearAllDataBtn")?.addEventListener("click", () => {
    if (!confirm("Очистить все данные расписания?")) return;
    state = clone(defaultState);
    localStorage.removeItem(STORAGE_KEY);
    saveState();
    renderAll();
    toast("Данные очищены");
  });

  $("saveTelegramBtn")?.addEventListener("click", saveTelegramSettings);
  $("sendReportBtn")?.addEventListener("click", sendTelegramReport);

  $("addUserBtn").addEventListener("click", () => openUserModal({}));
  $("usersList").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-edit-user]");
    if (!btn) return;
    const user = users.find(u => u.id === btn.dataset.editUser);
    if (user) openUserModal(user);
  });
  $("userForm").addEventListener("submit", saveUser);
  $("deleteUserBtn").addEventListener("click", deleteUser);
}

async function boot() {
  state = await loadState();
  if (ensureSubjectColors()) saveState(false);
  users = await loadUsers();
  currentUser = loadAuth();
  if (currentUser && !users.some(u => u.active !== false && u.username === currentUser.username)) {
    currentUser = null;
    localStorage.removeItem(AUTH_KEY);
  }
  telegramSettings = loadTelegramSettings();
  initAutoReportHash();
  bindEvents();
  renderAll();
}

boot();
