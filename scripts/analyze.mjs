// ============================================================
//  المحلّل بالقواعد — منصة «رصد واشنطن»
//  لا يستخدم ذكاءً اصطناعياً ولا يحتاج مفتاحاً. يعمل بالمنطق وحده:
//   1) ينسب كل بند إلى «ملف» بقاموس ثنائي اللغة (قسد/SDF، الجولان/Golan…)
//   2) يجمع بنود الملف الواحد معاً ولو اختلفت لغتها ومصادرها
//   3) يحسب درجة التحقق: كم مصدراً مستقلاً يرويه
//   4) يكشف النفي داخل الملف ← يسمه «متنازع عليه»
//   5) يقارن بالأرشيف: ملف جديد أم تطوّر على ملف سبق رصده
//   6) يرتّب الملفات بالأولوية
//  المخرج: data/analysis.json
// ============================================================

import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const ent = JSON.parse(readFileSync("config/entities.json", "utf8"));
const cfg = JSON.parse(readFileSync("config/sources.json", "utf8"));
const cur = JSON.parse(readFileSync("data/latest.json", "utf8"));

const OTHER = { id: "other", label: "بنود خارج الملفات المعرّفة" };

// ------------------------------------------------------------
// (1) نسب بند إلى ملف
//     يُعاد أول ملف يطابق (ترتيب القاموس = ترتيب الأولوية)
//     مع قائمة بكل الملفات التي لامسها البند
// ------------------------------------------------------------
function classify(title) {
  const t = (title || "").toLowerCase();
  const hit = [];
  for (const f of ent.files) {
    if (f.terms.some((x) => t.includes(x.toLowerCase()))) hit.push(f.id);
  }
  return { primary: hit[0] || OTHER.id, all: hit };
}

function labelOf(id) {
  const f = ent.files.find((x) => x.id === id);
  return f ? f.label : OTHER.label;
}

function hasDenial(title) {
  const t = (title || "").toLowerCase();
  return ent.denialTerms.some((d) => t.includes(d.toLowerCase()));
}

// ------------------------------------------------------------
// (2) قراءة الأرشيف — كل الدورات السابقة
// ------------------------------------------------------------
function readArchive() {
  const out = [];
  let names = [];
  try { names = readdirSync("data"); } catch { return out; }
  for (const n of names) {
    if (!n.endsWith(".json") || n === "latest.json" || n === "analysis.json") continue;
    try {
      const d = JSON.parse(readFileSync(`data/${n}`, "utf8"));
      if (d?.cycle?.generatedAt === cur.cycle.generatedAt) continue; // الدورة الحالية
      out.push(d);
    } catch { /* ملف تالف يُتجاهل */ }
  }
  out.sort((a, b) => new Date(b.cycle.generatedAt) - new Date(a.cycle.generatedAt));
  return out;
}

const archive = readArchive();

// الرابط بلا معاملات التتبّع — نفس قاعدة كاشف التكرار في الجامع
const norm = (l) => String(l || "").split("?")[0];

// آخر ظهور لكل ملف + كل الروابط التي سبق رصدها
const lastSeen = {};
const seenLinks = new Set();
for (const cyc of archive) {
  for (const it of cyc.items || []) {
    const id = classify(it.title).primary;
    if (!lastSeen[id]) lastSeen[id] = cyc.cycle.generatedAt;
    seenLinks.add(norm(it.link));
  }
}

// ------------------------------------------------------------
// (3) تجميع بنود الدورة الحالية في ملفات
// ------------------------------------------------------------
const groups = {};
for (const it of cur.items || []) {
  const c = classify(it.title);
  const seenBefore = seenLinks.has(norm(it.link));
  (groups[c.primary] ||= []).push({ ...it, files: c.all, seenBefore });
}

const files = Object.entries(groups).map(([id, items]) => {
  const sourceIds = [...new Set(items.map((i) => i.sourceId))];
  const circles = [...new Set(items.map((i) => i.circle))];
  const contested = items.some((i) => hasDenial(i.title + " " + (i.excerpt || "")));
  const echoed = sourceIds.length >= 2 && sameWording(items);

  let verification;
  if (contested) verification = "متنازع عليه — يحتاج تحققاً";
  else if (echoed) verification = "مصدران بصياغة متطابقة — قد يعودان لأصل واحد";
  else if (sourceIds.length >= 2) verification = "مصدران مستقلان فأكثر";
  else verification = "مصدر واحد";

  const prev = lastSeen[id];
  const newItems = items.filter((i) => !i.seenBefore).length;
  let history;
  if (!prev) history = "جديد على الرصد";
  else if (newItems > 0) history = `تطوّر جديد — ${newItems} بند جديد على ملف رُصد سابقاً`;
  else history = `لا جديد — نفس البنود المرصودة في دورة ${prev.slice(0, 16).replace("T", " ")}`;

  items.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  // الأولوية: تعدد المصادر يرفعها، والملفات الجوهرية ترفعها، والتنازع يرفعها
  const core = ["sdf", "sanctions", "congress", "israel", "turkey"].includes(id);
  const score = sourceIds.length * 3 + items.length + (core ? 4 : 0) +
                (contested ? 3 : 0) + newItems * 4 - (prev && newItems === 0 ? 5 : 0);

  return {
    id, label: labelOf(id),
    verification, contested,
    independentSources: sourceIds.length,
    sources: [...new Set(items.map((i) => i.source))],
    circles, history, isFollowUp: Boolean(prev), newItems, stale: Boolean(prev) && newItems === 0, echoed,
    score, items,
  };
});

files.sort((a, b) => b.score - a.score);

// ------------------------------------------------------------
// (3-ب) كشف الصياغة المتطابقة تقريباً
//   مصدران ينقلان نص وكالة واحدة ليسا مصدرين مستقلين.
//   نقارن كلمات العنوانين: تطابق عالٍ = نسخة واحدة برأسين.
// ------------------------------------------------------------
function words(t) {
  return new Set(
    String(t || "").toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4)
  );
}
function overlap(a, b) {
  const A = words(a), B = words(b);
  if (A.size < 3 || B.size < 3) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return hit / Math.min(A.size, B.size);
}
function sameWording(items) {
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++)
      if (items[i].sourceId !== items[j].sourceId &&
          overlap(items[i].title, items[j].title) >= 0.6) return true;
  return false;
}

// ------------------------------------------------------------
// (4) الدوائر التي لم تُنتج شيئاً — تُذكر بالاسم لا بالصمت
// ------------------------------------------------------------
const activeCircles = new Set((cur.items || []).map((i) => i.circle));
const emptyCircles = [...new Set(cfg.sources.map((s) => s.circle))]
  .filter((c) => !activeCircles.has(c));

// ------------------------------------------------------------
// (5) الحفظ
// ------------------------------------------------------------
const out = {
  cycle: cur.cycle,
  generatedBy: "analyze.mjs (قواعد فقط — بلا ذكاء اصطناعي)",
  totals: {
    items: (cur.items || []).length,
    files: files.length,
    withNew: files.filter((f) => f.newItems > 0 || !f.isFollowUp).length,
    stale: files.filter((f) => f.stale).length,
    contested: files.filter((f) => f.contested).length,
    echoed: files.filter((f) => f.echoed).length,
    archiveCycles: archive.length,
  },
  emptyCircles,
  errors: cur.errors || [],
  files,
};

writeFileSync("data/analysis.json", JSON.stringify(out, null, 2) + "\n", "utf8");

console.log("=".repeat(60));
console.log(`تحليل بالقواعد — ${out.totals.items} بند في ${out.totals.files} ملف`);
console.log(`دورات سابقة بالأرشيف: ${out.totals.archiveCycles}`);
console.log("=".repeat(60));
for (const f of files) {
  console.log(`• ${f.label}`);
  console.log(`    ${f.items.length} بند · ${f.independentSources} مصدر مستقل · ${f.verification}`);
  console.log(`    ${f.history}`);
}
if (emptyCircles.length) {
  console.log("-".repeat(60));
  console.log("دوائر بلا بنود هذه الدورة: " + emptyCircles.join(" · "));
}
console.log("=".repeat(60));
