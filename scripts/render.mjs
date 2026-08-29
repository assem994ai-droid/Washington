// ============================================================
//  باني اللوحة — منصة «رصد واشنطن»
//  يقرأ:  data/analysis.json      (الوقائع، بُنيت بالقواعد)
//         content/commentary.json (طبقتا الحكم — تُكتبان بشرياً)
//         data/*.json             (الأرشيف، لسجل الدورات)
//  يبني:  docs/index.html + docs/analysis.json
// ============================================================

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";

const a = JSON.parse(readFileSync("data/analysis.json", "utf8"));

// طبقتا الحكم — اختياريتان. غيابهما لا يكسر اللوحة.
let say = { files: {}, standing: [], openPoints: [] };
if (existsSync("content/commentary.json")) {
  try { say = { files: {}, standing: [], openPoints: [], ...JSON.parse(readFileSync("content/commentary.json", "utf8")) }; }
  catch { /* ملف تالف يُتجاهل */ }
}

// عنوان المستودع — غيّره فقط إن نقلت المشروع
const REPO = "assem994ai-droid/Washington";
const RUN_URL = `https://github.com/${REPO}/actions/workflows/cycle.yml`;

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const p2 = (n) => String(n).padStart(2, "0");
const fmt = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
};

// ------------------------------------------------------------
// خلاصة الدورة: نص بشري إن وُجد، وإلا جملة مبنية من الأرقام
// ------------------------------------------------------------
function autoBrief() {
  const t = a.totals;
  if (!t.items) return "لم تُنتج هذه الدورة أي بند ضمن نافذتها الزمنية. الصفر هنا نتيجة لا عطل.";
  const top = a.files[0];
  const bits = [`${t.items} بنداً في ${t.files} ملفات ضمن نافذة أربع وعشرين ساعة.`];
  if (top) bits.push(`الملف الأعلى أولوية: ${top.label} (${top.verification}).`);
  if (t.stale) bits.push(`${t.stale} من الملفات بلا جديد منذ الدورة السابقة.`);
  if (t.contested) bits.push(`${t.contested} ملف موسوم «متنازع عليه» — لا يُبنى عليه قرار قبل تحقق ثانٍ.`);
  return bits.join(" ");
}

const brief = say.cycleNote || autoBrief();

// أي ملف يتصدّر كـ«عاجل»؟ المحدَّد يدوياً، وإلا الأعلى أولوية إن كان فيه جديد
const urgentId = say.urgent || (a.files[0] && a.files[0].newItems > 0 ? a.files[0].id : null);
const urgent = a.files.find((f) => f.id === urgentId) || null;
const rest = a.files.filter((f) => f !== urgent);

const vClass = (v) => v.startsWith("متنازع") ? "v-contested" : v.startsWith("مصدران") ? "v-ok" : "v-single";

const itemsList = (f) => `
    <ul class="items">${f.items.map((i) => `
      <li${i.seenBefore ? ' class="old"' : ""}>${i.seenBefore ? "" : '<span class="tag-new">جديد</span> '}<a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.title)}</a><span class="meta">${esc(i.source)} · ${fmt(i.publishedAt)} UTC${i.seenBefore ? " · سبق عرضه" : ""}</span></li>`).join("")}
    </ul>`;

const pending = (what) => `<div class="pending">${what}</div>`;

// ------------------------------------------------------------
// بطاقة ملف
// ------------------------------------------------------------
const card = (f) => {
  const c = say.files[f.id] || {};
  return `
  <article class="card${f.contested ? " contested" : ""}${f.stale ? " stale-card" : ""}">
    <div class="chips">
      <span class="chip cat">${esc(f.circles[0] || "")}</span>
      <span class="chip ${vClass(f.verification)}">${esc(f.verification)}</span>
      <span class="chip ${f.stale ? "stale" : f.isFollowUp ? "follow" : "fresh"}">${esc(f.history)}</span>
    </div>
    <h4>${esc(f.label)}</h4>

    <p class="layer">الخبر</p>
    ${itemsList(f)}

    <p class="layer">تعليق مباشر</p>
    ${c.comment ? `<div class="comment"><p>${esc(c.comment)}</p></div>`
                : pending("لم يُكتب تعليق لهذا الملف في هذه الدورة.")}

    <p class="layer">التحليل</p>
    ${c.analysis ? `<p class="analysis">${esc(c.analysis)}</p>`
                 : pending("لم يُكتب تحليل لهذا الملف في هذه الدورة.")}

    <div class="foot"><span class="lbl">المصادر:</span> ${f.sources.map(esc).join(" · ")}</div>
  </article>`;
};

// ------------------------------------------------------------
// كتلة العاجل
// ------------------------------------------------------------
const urgentBlock = (f) => {
  const c = say.files[f.id] || {};
  return `
  <section class="urgent" aria-label="الملف الأبرز">
    <div class="eyebrow"><span class="dot"></span> الأبرز في هذه الدورة</div>
    <h3>${esc(f.label)}</h3>
    <div class="stamp-row">
      <span class="stamp">${esc(f.verification)}</span>
      <span class="stamp">${f.independentSources} مصدر مستقل</span>
      <span class="stamp">${esc(f.history)}</span>
    </div>
    <p class="layer u">الخبر</p>
    ${itemsList(f)}
    <p class="layer u">تعليق مباشر</p>
    ${c.comment ? `<div class="comment"><p>${esc(c.comment)}</p></div>`
                : `<div class="pending">لم يُكتب تعليق لهذا الملف في هذه الدورة.</div>`}
    <p class="layer u">التحليل</p>
    ${c.analysis ? `<p class="analysis">${esc(c.analysis)}</p>`
                 : `<div class="pending">لم يُكتب تحليل لهذا الملف في هذه الدورة.</div>`}
  </section>`;
};

// ------------------------------------------------------------
// سجل الدورات السابقة
// ------------------------------------------------------------
function archiveRows() {
  let names = [];
  try { names = readdirSync("data"); } catch { return []; }
  const rows = [];
  for (const n of names) {
    if (!n.endsWith(".json") || n === "latest.json" || n === "analysis.json") continue;
    try {
      const d = JSON.parse(readFileSync(`data/${n}`, "utf8"));
      rows.push({ at: d.cycle.generatedAt, total: (d.items || []).length });
    } catch { /* تجاهل */ }
  }
  rows.sort((x, y) => new Date(y.at) - new Date(x.at));
  return rows.slice(0, 12);
}
const rows = archiveRows();

const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>رصد واشنطن</title>
<meta name="description" content="رصد يومي للشأن الأمريكي وتأثيره على سوريا — نافذة زمنية صارمة، وثلاث طبقات لكل ملف.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Markazi+Text:wght@500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root{
    --bg:#F6F3EC; --surface:#FFFFFF; --surface-alt:#EFEAE0;
    --ink:#1E2430; --ink-muted:#5B6472; --ink-faint:#8A8F7E;
    --accent:#A8791E; --accent-ink:#5E4310; --border:#DEDACC;
    --ok:#2F6B4F; --ok-bg:#E7EFE9; --ok-border:#BFD9CB;
    --challenge:#9B4429; --watch:#48526C; --watch-bg:#E7E9F0; --watch-border:#C9CEDD;
    --urgent-bg:#221B10; --urgent-ink:#F3E9D2; --urgent-accent:#E0B24C;
    --comment-bg:#EFE6D2; --comment-ink:#5E4310; --comment-accent:#A8791E;
    --shadow:0 1px 2px rgba(30,36,48,.06), 0 8px 24px -12px rgba(30,36,48,.12);
  }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      --bg:#12161D; --surface:#1A2029; --surface-alt:#212836;
      --ink:#EAE6DA; --ink-muted:#9BA3B2; --ink-faint:#6B7280;
      --accent:#D3AC4E; --accent-ink:#F3E4BC; --border:#2B3240;
      --ok:#7FCBA3; --ok-bg:#1B2A22; --ok-border:#2C4536;
      --challenge:#E39B7A; --watch:#A6B0CB; --watch-bg:#1F2433; --watch-border:#323A52;
      --urgent-bg:#1B1508; --urgent-ink:#F3E9D2; --urgent-accent:#E7BE5E;
      --comment-bg:#2A2313; --comment-ink:#E7BE5E; --comment-accent:#D3AC4E;
      --shadow:0 1px 2px rgba(0,0,0,.3), 0 8px 24px -12px rgba(0,0,0,.5);
    }
  }
  :root[data-theme="dark"]{
    --bg:#12161D; --surface:#1A2029; --surface-alt:#212836;
    --ink:#EAE6DA; --ink-muted:#9BA3B2; --ink-faint:#6B7280;
    --accent:#D3AC4E; --accent-ink:#F3E4BC; --border:#2B3240;
    --ok:#7FCBA3; --ok-bg:#1B2A22; --ok-border:#2C4536;
    --challenge:#E39B7A; --watch:#A6B0CB; --watch-bg:#1F2433; --watch-border:#323A52;
    --urgent-bg:#1B1508; --urgent-ink:#F3E9D2; --urgent-accent:#E7BE5E;
    --comment-bg:#2A2313; --comment-ink:#E7BE5E; --comment-accent:#D3AC4E;
    --shadow:0 1px 2px rgba(0,0,0,.3), 0 8px 24px -12px rgba(0,0,0,.5);
  }
  *{box-sizing:border-box}
  html{background:var(--bg)}
  body{margin:0;background:var(--bg);color:var(--ink);direction:rtl;line-height:1.65;
    font-family:"IBM Plex Sans Arabic","Noto Sans Arabic","Segoe UI",Tahoma,sans-serif;
    font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
  a{color:var(--accent);text-decoration-thickness:1px;text-underline-offset:2px}
  a:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
  .wrap{max-width:1000px;margin:0 auto;padding:0 20px 64px}

  header.masthead{border-bottom:1px solid var(--border);padding:28px 0 20px;margin-bottom:20px}
  .masthead-row{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap}
  h1{font-family:"Markazi Text",serif;font-weight:700;font-size:clamp(2rem,4.5vw,2.75rem);margin:0;line-height:1.15}
  .tagline{color:var(--ink-muted);font-size:.95rem;margin:4px 0 0;max-width:58ch}
  .meta-tags{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .tag{font-size:.72rem;padding:4px 10px;border-radius:999px;border:1px solid var(--border);
    color:var(--ink-muted);background:var(--surface);white-space:nowrap}
  .tag.internal{color:var(--accent-ink);background:var(--surface-alt);border-color:var(--accent)}
  .updated{font-size:.82rem;color:var(--ink-faint);margin-top:10px}

  .runbar{background:var(--surface);border:1px solid var(--border);border-inline-start:5px solid var(--ok);
    border-radius:12px;padding:14px 20px;margin-bottom:8px;box-shadow:var(--shadow);
    display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
  .runbar h2{font-family:"Markazi Text",serif;font-size:1.15rem;margin:0 0 2px;font-weight:700;color:var(--ok)}
  .runbar p{margin:0;font-size:.82rem;color:var(--ink-muted);max-width:60ch}
  .runbtn{font-size:.9rem;font-weight:600;background:var(--ok);color:var(--bg);border-radius:8px;
    padding:9px 20px;text-decoration:none;white-space:nowrap}
  .runbtn:hover{filter:brightness(1.08)}
  .fresh{font-size:.79rem;color:var(--ink-faint);margin:0 0 16px;min-height:1.2em}
  .fresh.hot{color:var(--ok);font-weight:600}

  .scope{background:var(--surface-alt);border:1px dashed var(--border);border-radius:10px;
    padding:10px 16px;margin-bottom:18px;font-size:.83rem;color:var(--ink-muted)}
  .scope b{color:var(--accent-ink)}

  .brief{background:var(--surface);border:1px solid var(--border);border-inline-start:5px solid var(--accent);
    border-radius:12px;padding:18px 22px;margin-bottom:18px;box-shadow:var(--shadow)}
  .brief h2{font-family:"Markazi Text",serif;font-size:1.3rem;margin:0 0 8px;font-weight:700;color:var(--accent-ink)}
  .brief p{margin:0;font-size:.94rem;max-width:80ch}

  .urgent{background:var(--urgent-bg);color:var(--urgent-ink);border-radius:14px;padding:22px 26px;
    margin-bottom:18px;box-shadow:var(--shadow);border-inline-start:5px solid var(--urgent-accent)}
  .urgent .eyebrow{font-size:.74rem;letter-spacing:.06em;color:var(--urgent-accent);font-weight:600;
    display:flex;align-items:center;gap:8px}
  .urgent .eyebrow .dot{width:7px;height:7px;border-radius:50%;background:var(--urgent-accent)}
  .urgent h3{font-family:"Markazi Text",serif;font-weight:700;font-size:clamp(1.3rem,3vw,1.7rem);margin:8px 0 10px;line-height:1.25}
  .urgent .stamp-row{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:6px}
  .urgent .stamp{font-size:.68rem;font-weight:600;padding:3px 9px;border-radius:999px;
    border:1px solid color-mix(in srgb, var(--urgent-accent) 45%, transparent);color:var(--urgent-accent)}
  .urgent .layer.u{color:var(--urgent-accent)}
  .urgent .items li{color:color-mix(in srgb, var(--urgent-ink) 88%, transparent)}
  .urgent .items a{color:var(--urgent-ink)}
  .urgent .items .meta{color:color-mix(in srgb, var(--urgent-ink) 60%, transparent)}
  .urgent .analysis{color:color-mix(in srgb, var(--urgent-ink) 90%, transparent);max-width:74ch;font-size:.92rem}
  .urgent .comment{background:color-mix(in srgb, var(--urgent-accent) 16%, transparent);
    border-inline-start:3px solid var(--urgent-accent);border-radius:6px;padding:10px 13px;margin:2px 0 6px}
  .urgent .comment p{color:var(--urgent-ink);margin:0;font-style:italic;font-size:.9rem;max-width:74ch}
  .urgent .pending{background:color-mix(in srgb, var(--urgent-ink) 8%, transparent);
    border-color:color-mix(in srgb, var(--urgent-ink) 25%, transparent);color:color-mix(in srgb, var(--urgent-ink) 65%, transparent)}
  .urgent .tag-new{background:var(--urgent-accent);color:var(--urgent-bg)}

  .section-head{display:flex;align-items:center;gap:12px;margin:26px 0 12px}
  .section-head h3{font-family:"Markazi Text",serif;font-size:1.35rem;margin:0;font-weight:700;color:var(--ink-muted)}
  .section-head .rule{flex:1;min-width:20px;height:1px;background:var(--border);align-self:center}

  .card{background:var(--surface);border:1px solid var(--border);border-inline-start:4px solid var(--accent);
    border-radius:12px;padding:17px 20px;margin-bottom:13px;box-shadow:var(--shadow)}
  .card.contested{border-inline-start-color:var(--challenge)}
  .card.stale-card{opacity:.74}
  .card h4{font-family:"Markazi Text",serif;font-size:1.28rem;margin:2px 0 10px;font-weight:700;line-height:1.3}
  .chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px}
  .chip{font-size:.68rem;font-weight:600;padding:2px 9px;border-radius:999px;
    border:1px solid var(--border);color:var(--ink-muted);background:var(--surface-alt);white-space:nowrap}
  .chip.cat{background:var(--watch-bg);color:var(--watch);border-color:var(--watch-border)}
  .chip.v-ok{color:var(--ok);border-color:var(--ok);background:transparent}
  .chip.v-single{color:var(--watch);border-color:var(--watch);background:transparent}
  .chip.v-contested{color:var(--challenge);border-color:var(--challenge);background:transparent;border-style:dashed}
  .chip.follow{color:var(--accent-ink);border-color:var(--accent)}
  .chip.stale{color:var(--ink-faint);border-style:dashed}

  .layer{font-size:.68rem;font-weight:700;letter-spacing:.05em;color:var(--ink-faint);margin:13px 0 5px}
  .items{margin:0;padding-inline-start:18px}
  .items li{margin-bottom:8px;font-size:.91rem}
  .items li.old{color:var(--ink-muted)}
  .items .meta{display:block;font-size:.75rem;color:var(--ink-faint);margin-top:1px}
  .tag-new{font-size:.62rem;font-weight:700;padding:1px 6px;border-radius:4px;
    background:var(--ok);color:var(--bg);margin-inline-end:4px;vertical-align:2px}
  .comment{background:var(--comment-bg);border-inline-start:3px solid var(--comment-accent);
    border-radius:7px;padding:9px 12px;margin:2px 0 6px}
  .comment p{color:var(--comment-ink);margin:0;font-size:.88rem;font-style:italic;max-width:76ch}
  .analysis{margin:0;font-size:.89rem;color:var(--ink-muted);max-width:78ch}
  .pending{background:var(--surface-alt);border:1px dashed var(--border);border-radius:7px;
    padding:9px 12px;font-size:.83rem;color:var(--ink-faint)}
  .foot{display:flex;gap:8px;font-size:.77rem;color:var(--ink-faint);
    border-top:1px dashed var(--border);padding-top:8px;margin-top:12px;flex-wrap:wrap}
  .foot .lbl{font-weight:600}

  .note{background:var(--surface-alt);border:1px dashed var(--border);border-radius:10px;
    padding:14px 18px;font-size:.85rem;color:var(--ink-muted);margin-bottom:13px}
  .note b{color:var(--ink)}

  .standing{background:var(--surface);border:1px solid var(--border);border-inline-start:4px solid var(--watch);
    border-radius:12px;padding:17px 20px;margin-bottom:13px}
  .standing h4{font-family:"Markazi Text",serif;font-size:1.1rem;margin:0 0 6px;color:var(--watch);font-weight:700}
  .standing ol,.standing ul{margin:6px 0 0;padding-inline-start:20px;font-size:.86rem;color:var(--ink-muted)}
  .standing li{margin-bottom:5px}
  .standing .sub+.sub{margin-top:14px;padding-top:14px;border-top:1px dashed var(--border)}

  details.archive{border:1px solid var(--border);border-radius:12px;background:var(--surface);margin-top:18px}
  details.archive summary{cursor:pointer;list-style:none;padding:14px 20px;font-weight:600;font-size:.9rem;
    display:flex;justify-content:space-between;align-items:center}
  details.archive summary::-webkit-details-marker{display:none}
  details.archive summary::after{content:"▾";color:var(--ink-faint)}
  .archive-body{padding:0 20px 18px;border-top:1px solid var(--border)}
  .archive-body table{width:100%;border-collapse:collapse;font-size:.84rem;margin-top:12px}
  .archive-body td{padding:6px 0;border-bottom:1px dashed var(--border);color:var(--ink-muted)}
  .archive-body td:last-child{text-align:end}

  footer.about{margin-top:28px;padding-top:18px;border-top:1px solid var(--border);
    font-size:.81rem;color:var(--ink-faint);max-width:78ch}
  footer.about strong{color:var(--ink-muted)}
  footer.about p{margin:0 0 9px}
</style>
</head>
<body>
<div class="wrap">

  <header class="masthead">
    <div class="masthead-row">
      <div>
        <h1>رصد واشنطن</h1>
        <p class="tagline">رصد الشأن الأمريكي وتأثيره على سوريا — نافذة زمنية صارمة، وثلاث طبقات لكل ملف: الخبر، تعليق مباشر، تحليل</p>
      </div>
      <div class="meta-tags">
        <span class="tag internal">نسخة تجريبية · للاستخدام الداخلي</span>
        <span class="tag">الدورة اليومية</span>
      </div>
    </div>
    <p class="updated">آخر دورة: ${fmt(a.cycle.generatedAt)} UTC · ${a.totals.items} بند · ${a.totals.files} ملف · ${a.totals.stale} بلا جديد</p>
  </header>

  <section class="runbar">
    <div>
      <h2>تحديث الآن</h2>
      <p>يفتح صفحة التشغيل في GitHub. اضغط هناك <b>Run workflow</b>، ثم عُد إلى هذه الصفحة — ستكتشف الدورة الجديدة وتحدّث نفسها.</p>
    </div>
    <a class="runbtn" href="${RUN_URL}" target="_blank" rel="noopener">تحديث الآن ↗</a>
  </section>
  <p class="fresh" id="fresh"></p>

  <div class="scope"><b>نطاق هذه الدورة:</b> كل بند أدناه وقع أو نُشر بين ${fmt(a.cycle.from)} و${fmt(a.cycle.to)} بتوقيت UTC. ما هو أقدم من فتح النافذة لا يُعرض، ويبقى في الأرشيف الداخلي.</div>

  <section class="brief">
    <h2>خلاصة الدورة</h2>
    <p>${esc(brief)}</p>
  </section>

  ${urgent ? urgentBlock(urgent) : ""}

  ${rest.length ? `<div class="section-head"><h3>بقية الملفات</h3><span class="rule"></span></div>` + rest.map(card).join("") : ""}

  ${!a.files.length ? `<div class="note">لا بنود ضمن نافذة هذه الدورة.</div>` : ""}

  ${a.emptyCircles.length ? `<div class="note"><b>دوائر لم تُنتج بنداً ضمن النافذة:</b> ${a.emptyCircles.map(esc).join(" · ")}. تُذكر بالاسم لا بالصمت — الصفر هنا معلومة لا عطل.</div>` : ""}

  ${a.errors.length ? `<div class="note"><b>مصادر تعذّر الوصول إليها:</b> ${a.errors.map((e) => esc(e.source) + " (" + esc(e.message) + ")").join(" · ")}</div>` : ""}

  ${(say.standing.length || say.openPoints.length) ? `
  <div class="section-head"><h3>معايير ثابتة للمراقبة</h3><span class="rule"></span><span class="chip">غير مؤرَّخة — لا تُقرأ كخبر</span></div>
  <div class="standing">
    ${say.standing.length ? `<div class="sub"><h4>عتبات الانتقال إلى السيناريو الأسوأ</h4>
      <p style="margin:0;font-size:.85rem;color:var(--ink-muted)">تُفعَّل فقط عند تحقق أيٍّ منها فعلياً بتاريخ محدد، لا كتذكير متكرر:</p>
      <ol>${say.standing.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div>` : ""}
    ${say.openPoints.length ? `<div class="sub"><h4>نقاط تحتاج تحققاً إضافياً</h4>
      <ul>${say.openPoints.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
  </div>` : ""}

  <details class="archive">
    <summary>الأرشيف — سجل الدورات (${rows.length})</summary>
    <div class="archive-body">
      <table>${rows.map((r) => `<tr><td>${fmt(r.at)} UTC</td><td>${r.total} بند</td></tr>`).join("")}</table>
    </div>
  </details>

  <footer class="about">
    <p><strong>كيف تُبنى هذه اللوحة:</strong> تُجمع البنود آلياً ضمن نافذة زمنية صارمة يفرضها البرنامج، ثم تُنسب إلى ملفات بقاموس ثنائي اللغة، وتُحسب درجة التحقق من عدد المصادر المستقلة، ويُكشف النفي، وتُقارن بالأرشيف لتمييز الجديد عن المكرر. طبقة الخبر آلية بالكامل؛ التعليق والتحليل حكم بشري يُكتب في <code>content/commentary.json</code>.</p>
    <p><strong>تنبيه استخدام:</strong> الوسوم مؤشرات آلية لا أحكام نهائية، والبنود الموسومة «متنازع عليه» لا يُبنى عليها قرار قبل تحقق ثانٍ مستقل.</p>
    <p>نسخة تجريبية للاستخدام الداخلي.</p>
  </footer>

</div>

<script>
(function(){
  var CURRENT = ${JSON.stringify(a.cycle.generatedAt)};
  var el = document.getElementById("fresh");
  if(!el) return;
  function since(){
    var m = Math.round((Date.now() - new Date(CURRENT).getTime())/60000);
    if(m < 1) return "الآن";
    if(m < 60) return "منذ " + m + " دقيقة";
    var h = Math.floor(m/60);
    if(h < 24) return "منذ " + h + " ساعة";
    return "منذ " + Math.floor(h/24) + " يوم";
  }
  function paint(){ el.textContent = "آخر دورة: " + since(); }
  paint(); setInterval(paint, 30000);
  setInterval(function(){
    if(document.visibilityState !== "visible") return;
    fetch("analysis.json?t=" + Date.now(), { cache: "no-store" })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){
        if(!d || !d.cycle || d.cycle.generatedAt === CURRENT) return;
        el.className = "fresh hot";
        el.textContent = "وصلت دورة أحدث — يجري تحديث الصفحة…";
        setTimeout(function(){ location.reload(); }, 1200);
      })
      .catch(function(){});
  }, 30000);
})();
</script>
</body>
</html>
`;

mkdirSync("docs", { recursive: true });
writeFileSync("docs/index.html", html, "utf8");
writeFileSync("docs/analysis.json", JSON.stringify(a, null, 2) + "\n", "utf8");
console.log(`بُنيت docs/index.html — ${a.totals.files} ملف، ${a.totals.items} بند` +
            (urgent ? ` · الأبرز: ${urgent.label}` : "") +
            ` · تعليقات مكتوبة: ${Object.keys(say.files).length}`);
