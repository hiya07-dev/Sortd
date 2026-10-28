// =====================================================================
// Sortd - simple version
// Flow: Input -> Extract -> Review -> Dashboard -> Alerts -> Search
// =====================================================================

// ---------- 1. DATA (saved in the browser with localStorage) ----------
let docs = [];      // uploaded files / pasted messages
let items = [];     // confirmed tasks, events and deadlines
let pending = [];   // AI results waiting for the user to review
let nextId = 1;     // gives every record its own id
let page = "dashboard";
let query = "";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const SAMPLE_TEXT =
  "ENG102: Submit Essay 2 by " + prettyDate(daysFromNow(8)) + " at 5:00 PM.\n" +
  "Quiz 4 will be held on " + prettyDate(daysFromNow(2)) + " at 9:30 AM.\n" +
  "Library books are due on " + prettyDate(daysFromNow(7)) + ".";

function saveData() {
  try { localStorage.setItem("sortd", JSON.stringify({ docs, items, nextId })); } catch (e) {}
}
function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem("sortd"));
    if (saved) { docs = saved.docs; items = saved.items; nextId = saved.nextId; return true; }
  } catch (e) {}
  return false;
}

// ---------- 2. DATE HELPERS ----------
function toISO(d) {   // Date -> "2026-11-05"
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toISO(d);
}
function daysLeft(iso) {   // how many days until a date (negative = overdue)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(iso + "T00:00") - today) / 86400000);
}
function prettyDate(iso) {
  return new Date(iso + "T00:00").toLocaleDateString("en", { month: "short", day: "numeric" });
}
function whenText(iso) {
  const n = daysLeft(iso);
  if (n < 0) return Math.abs(n) + "d overdue";
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  return "In " + n + " days";
}
function esc(text) {   // makes pasted text safe to show on the page
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------- 3. AI EXTRACTION (rule-based in this prototype) ----------
// Finds a date inside a sentence: "today", "tomorrow" or "Nov 5"
function findDate(sentence) {
  const s = sentence.toLowerCase();
  if (s.includes("today")) return daysFromNow(0);
  if (s.includes("tomorrow")) return daysFromNow(1);
  const m = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})/);
  if (!m) return null;
  const d = new Date(new Date().getFullYear(), MONTHS.indexOf(m[1]), Number(m[2]));
  if (daysLeft(toISO(d)) < -30) d.setFullYear(d.getFullYear() + 1);   // date already passed -> next year
  return toISO(d);
}

// Reads a whole text and returns a list of tasks / events
function extractItems(text, docId) {
  const results = [];
  const docCourse = (text.match(/\b[A-Z]{2,4}\s?\d{3}\b/) || ["General"])[0];   // e.g. CS301
  const sentences = text.split(/(?<=[.!?])\s+|\n/).map(s => s.trim());

  sentences.forEach(sentence => {
    const date = findDate(sentence);
    if (!date) return;                                   // no date = not useful, skip

    const lower = sentence.toLowerCase();
    const type = /exam|quiz|lecture|meeting|meetup|event/.test(lower) ? "event" : "task";
    const course = (sentence.match(/\b[A-Z]{2,4}\s?\d{3}\b/) || [docCourse])[0];
    const time = (sentence.match(/\d{1,2}(:\d\d)?\s?(am|pm)/i) || [""])[0].toUpperCase();

    // Title = sentence without the course code and without the date part
    let title = sentence.replace(/^[A-Z]{2,4}\s?\d{3}:?\s*/, "");
    title = title.split(/ by | on | at | due | closes /i)[0].replace(/[.:]$/, "").trim();

    // Confidence score: more clues found = more confident
    let confidence = 0.6;
    if (/due|submit|deadline|exam|quiz/.test(lower)) confidence += 0.2;
    if (course !== "General") confidence += 0.1;
    if (time) confidence += 0.08;

    results.push({
      id: nextId++, title: title, course: course, date: date, time: time,
      type: type, done: false, docId: docId, source: sentence, confidence: confidence
    });
  });
  return results;
}

// Saves the document, runs extraction and sends results to the review list
function runExtraction(text, name, kind) {
  const doc = { id: nextId++, name: name, type: kind, text: text };
  docs.push(doc);
  pending.push(...extractItems(text, doc.id));
  saveData();
  page = "add";
  render();
}

// ---------- 4. SMART ALERTS ----------
function getAlerts() {
  const alerts = [];
  const open = items.filter(i => !i.done);

  open.forEach(i => {
    const left = daysLeft(i.date);
    if (left < 0) alerts.push({ level: "red", title: "Overdue", text: i.title + " was due " + prettyDate(i.date) });
    else if (left <= 2 && i.type === "task") alerts.push({ level: "orange", title: "Due soon", text: i.title + " - " + whenText(i.date) });
  });

  // Conflict: same course + same title but different dates
  for (let a = 0; a < open.length; a++) {
    for (let b = a + 1; b < open.length; b++) {
      const x = open[a], y = open[b];
      if (x.course === y.course && x.title.toLowerCase() === y.title.toLowerCase() && x.date !== y.date) {
        alerts.push({ level: "red", title: "Conflicting dates", text: '"' + x.title + '" appears with two dates: ' + prettyDate(x.date) + " and " + prettyDate(y.date) });
      }
    }
  }
  return alerts;
}

// ---------- 5. ACTIONS (what happens when the user clicks) ----------
function goTo(p) { page = p; render(); window.scrollTo(0, 0); }

function toggleDone(id) {
  const item = items.find(i => i.id === id);
  item.done = !item.done;
  saveData(); render();
}
function removeItem(id) { items = items.filter(i => i.id !== id); saveData(); render(); }

function editPending(id, field, value) { pending.find(p => p.id === id)[field] = value; }
function confirmItem(id) {
  items.push(pending.find(p => p.id === id));
  pending = pending.filter(p => p.id !== id);
  saveData(); render();
}
function discardItem(id) { pending = pending.filter(p => p.id !== id); render(); }
function confirmAll() { items.push(...pending); pending = []; saveData(); render(); }

function extractFromBox() {
  const text = document.getElementById("pasteBox").value.trim();
  if (text) runExtraction(text, "Pasted message", "Message");
}
function handleFile(file) {
  if (file.type.startsWith("text")) {            // real text files are read directly
    const reader = new FileReader();
    reader.onload = () => runExtraction(reader.result, file.name, "File");
    reader.readAsText(file);
  } else {                                       // PDFs / images need OCR (backend) - demo uses sample text
    runExtraction(SAMPLE_TEXT, file.name, file.type.includes("pdf") ? "PDF" : "Screenshot");
  }
}
function useSample() { document.getElementById("pasteBox").value = SAMPLE_TEXT; }

function showDoc(id) {   // popup with the original text and the found sentences highlighted
  const doc = docs.find(d => d.id === id);
  if (!doc) return;
  let text = esc(doc.text);
  items.filter(i => i.docId === id).forEach(i => {
    const s = esc(i.source);
    text = text.replace(s, "<mark>" + s + "</mark>");
  });
  document.getElementById("popup").innerHTML =
    '<div class="overlay" onclick="if(event.target===this)closePopup()"><div class="card">' +
    "<h3>" + esc(doc.name) + ' <span class="chip">' + doc.type + "</span></h3>" +
    '<p style="line-height:1.7;white-space:pre-line">' + text + "</p>" +
    '<p class="small">Highlighted = where Sortd found a task or date.</p>' +
    '<button class="btn" onclick="closePopup()">Close</button></div></div>';
}
function closePopup() { document.getElementById("popup").innerHTML = ""; }

function doSearch(value) {
  query = value;
  document.getElementById("results").innerHTML = searchResults();
}

// ---------- 6. SCREENS (each function returns the HTML of one page) ----------
function itemRow(i) {
  return '<div class="row ' + (i.done ? "done" : "") + '">' +
    '<input type="checkbox" ' + (i.done ? "checked" : "") + ' onchange="toggleDone(' + i.id + ')">' +
    '<div class="grow"><b>' + esc(i.title) + "</b>" +
    '<div class="small">' + esc(i.course) + " · " + prettyDate(i.date) + " " + esc(i.time) +
    ' · <a href="#" onclick="showDoc(' + i.docId + ');return false">source</a></div></div>' +
    '<span class="chip ' + i.type + '">' + i.type + "</span>" +
    '<span class="chip">' + whenText(i.date) + "</span>" +
    '<button class="x" onclick="removeItem(' + i.id + ')">✕</button></div>';
}

function dashboardPage() {
  const open = items.filter(i => !i.done).sort((a, b) => a.date.localeCompare(b.date));
  const week = open.filter(i => daysLeft(i.date) >= 0 && daysLeft(i.date) <= 7);
  const alerts = getAlerts();

  return "<h1>Your week</h1>" +
    '<div class="grid stats">' +
      '<div class="card"><b>' + open.length + "</b>Open tasks</div>" +
      '<div class="card"><b>' + week.length + "</b>Due this week</div>" +
      '<div class="card"><b>' + alerts.length + "</b>Alerts</div>" +
      '<div class="card"><b>' + docs.length + "</b>Documents</div>" +
    "</div>" +
    '<div class="grid">' +
      '<div class="card"><h3>Upcoming deadlines</h3>' + (week.map(itemRow).join("") || '<p class="small">Nothing due this week.</p>') + "</div>" +
      '<div class="card"><h3>Smart alerts</h3>' +
        (alerts.map(a => '<div class="alert ' + a.level + '"><b>' + a.title + '</b><div class="small">' + esc(a.text) + "</div></div>").join("") || '<p class="small">All clear!</p>') +
      "</div>" +
    "</div>";
}

function addPage() {
  const review = pending.map(p =>
    '<div class="card">' +
      '<span class="chip">' + Math.round(p.confidence * 100) + "% sure</span> " +
      '<span class="chip ' + p.type + '">' + p.type + "</span>" +
      '<p class="small">"' + esc(p.source) + '"</p>' +
      '<input type="text" value="' + esc(p.title) + '" onchange="editPending(' + p.id + ",'title',this.value)\">" +
      '<input type="date" value="' + p.date + '" onchange="editPending(' + p.id + ",'date',this.value)\">" +
      '<button class="btn" onclick="confirmItem(' + p.id + ')">Confirm</button>' +
      '<button class="btn ghost" onclick="discardItem(' + p.id + ')">Discard</button>' +
    "</div>").join("");

  return "<h1>Add information</h1>" +
    '<div class="grid"><div class="card"><h3>1. Add input</h3>' +
      '<input type="file" onchange="handleFile(this.files[0])"><br><br>' +
      '<textarea id="pasteBox" rows="6" placeholder="Paste a message, email or notice..."></textarea>' +
      '<button class="btn" onclick="extractFromBox()">Extract with AI</button>' +
      '<button class="btn ghost" onclick="useSample()">Use sample notice</button></div>' +
    '<div class="card"><h3>2. Review and confirm</h3>' +
      '<p class="small">Nothing is saved until you confirm it.</p>' +
      (pending.length ? '<button class="btn ghost" onclick="confirmAll()">Confirm all</button>' : "") +
      (review || '<p class="small">No results to review yet.</p>') +
    "</div></div>";
}

function tasksPage() {
  const sorted = items.slice().sort((a, b) => a.date.localeCompare(b.date));
  const open = sorted.filter(i => !i.done), done = sorted.filter(i => i.done);
  return "<h1>Tasks</h1>" +
    '<div class="card"><h3>To do (' + open.length + ")</h3>" + (open.map(itemRow).join("") || '<p class="small">Nothing to do!</p>') + "</div>" +
    (done.length ? '<div class="card"><h3>Completed (' + done.length + ")</h3>" + done.map(itemRow).join("") + "</div>" : "");
}

function docsPage() {
  return "<h1>Documents</h1><div class=\"card\">" +
    docs.map(d => '<div class="row"><div class="grow"><b>' + esc(d.name) + '</b><div class="small">' + d.type + " · " +
      items.filter(i => i.docId === d.id).length + ' items found</div></div>' +
      '<button class="btn ghost" onclick="showDoc(' + d.id + ')">Open</button></div>').join("") + "</div>";
}

function searchResults() {
  const q = query.toLowerCase().trim();
  if (!q) return '<p class="small">Search tasks, events and the full text of every document.</p>';
  const foundItems = items.filter(i => (i.title + i.course + i.source).toLowerCase().includes(q));
  const foundDocs = docs.filter(d => (d.name + d.text).toLowerCase().includes(q));
  return '<div class="card"><h3>Tasks and events (' + foundItems.length + ")</h3>" + (foundItems.map(itemRow).join("") || '<p class="small">No matches</p>') + "</div>" +
    '<div class="card"><h3>Documents (' + foundDocs.length + ")</h3>" +
    (foundDocs.map(d => '<div class="row"><div class="grow"><b>' + esc(d.name) + '</b></div><button class="btn ghost" onclick="showDoc(' + d.id + ')">Open original</button></div>').join("") || '<p class="small">No matches</p>') + "</div>";
}
function searchPage() {
  return "<h1>Search</h1>" +
    '<input type="text" placeholder="Try: lab report, exam, quiz..." value="' + esc(query) + '" oninput="doSearch(this.value)">' +
    '<div id="results">' + searchResults() + "</div>";
}

// ---------- 7. DRAW THE APP ----------
function renderNav() {
  const menu = [["dashboard", "Dashboard"], ["add", "Add Info"], ["tasks", "Tasks"], ["docs", "Documents"], ["search", "Search"]];
  document.getElementById("nav").innerHTML =
    '<div class="logo"><img src="assets/logo.png" alt="">Sortd</div>' +
    menu.map(m =>
      '<button class="' + (page === m[0] ? "active" : "") + '" onclick="goTo(\'' + m[0] + "')\">" + m[1] +
      (m[0] === "add" && pending.length ? '<span class="badge">' + pending.length + "</span>" : "") + "</button>").join("");
}

function render() {
  renderNav();
  const pages = { dashboard: dashboardPage, add: addPage, tasks: tasksPage, docs: docsPage, search: searchPage };
  document.getElementById("main").innerHTML = pages[page]();
}

// ---------- 8. START ----------
if (!loadData()) {   // first visit: load demo data by running the same extraction on 3 sample documents
  [
    ["CS301_Assignment3.pdf", "PDF", "CS301: Submit Lab Report 3 by " + prettyDate(daysFromNow(3)) + " at 11:59 PM."],
    ["Prof. Rao (WhatsApp)", "Message", "CS301: Submit Lab Report 3 by " + prettyDate(daysFromNow(5)) + " at 11:59 PM, deadline extended. Midterm exam on " + prettyDate(daysFromNow(9)) + " at 10:00 AM."],
    ["MKT210_syllabus.png", "Screenshot", "MKT210: Case study reading due " + prettyDate(daysFromNow(1)) + ". Group presentation on " + prettyDate(daysFromNow(9)) + "."]
  ].forEach(d => {
    const doc = { id: nextId++, name: d[0], type: d[1], text: d[2] };
    docs.push(doc);
    items.push(...extractItems(doc.text, doc.id));
  });
  saveData();
}
render();
