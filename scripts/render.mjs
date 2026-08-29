// ============================================================
//  باني اللوحة — منصة «رصد واشنطن»
//  يقرأ data/analysis.json ويبني صفحة docs/index.html
//  الطبقة الأولى (الخبر) تُملأ آلياً بالكامل.
//  الطبقتان الثانية والثالثة (تعليق مباشر / تحليل) تُترك لهما
//  مواضع صريحة، لأنهما حكم لا مطابقة.
// ============================================================

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const a = JSON.parse(readFileSync("data/analysis.json", "utf8"));

// حماية: أي نص يدخل الصفحة يُنظَّف من رموز HTML
const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const fmt = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
};

const vClass = (v) =>
  v.startsWith("متنازع") ? "v-contested" : v.startsWith("مصدران") ? "v-ok" : "v-single";

const fileCard = (f) => `
  <article class="card${f.contested ? " contested" : ""}">
    <div class="chips">
      <span class="chip ${vClass(f.verification)}">${esc(f.verification)}</span>
      <span class="chip">${f.independentSources} مصدر مستقل</span>
      <span class="chip ${f.isFollowUp ? "follow" : "fresh"}">${esc(f.history)}</span>
    </div>
    <h3>${esc(f.label)}</h3>

    <p class="layer">الخبر</p>
    <ul class="items">
      ${f.items.map((i) => `
      <li>
        <a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.title)}</a>
        <span class="meta">${esc(i.source)} · ${fmt(i.publishedAt)}</span>
      </li>`).join("")}
    </ul>

    <p class="layer">تعليق مباشر</p>
    <div class="pending">بانتظار طبقة الحكم — تُكتب في المحادثة ولا تُنتج آلياً.</div>

    <p class="layer">التحليل</p>
    <div class="pending">بانتظار طبقة الحكم — السياق، الأولوية، قابلية التأثير السوري، والموقف السوري المعلن بشرطه.</div>
  </article>`;

const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>رصد واشنطن</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Markazi+Text:wght@600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root{
    --bg:#F6F3EC; --surface:#FFFFFF; --surface-alt:#EFEAE0;
    --ink:#1E2430; --ink-muted:#5B6472; --ink-faint:#8A8F7E;
    --accent:#A8791E; --accent-ink:#5E4310; --border:#DEDACC;
    --ok:#2F6B4F; --single:#48526C; --contested:#9B4429;
    --shadow:0 1px 2px rgba(30,36,48,.06), 0 8px 24px -12px rgba(30,36,48,.12);
  }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      --bg:#12161D; --surface:#1A2029; --surface-alt:#212836;
      --ink:#EAE6DA; --ink-muted:#9BA3B2; --ink-faint:#6B7280;
      --accent:#D3AC4E; --accent-ink:#F3E4BC; --border:#2B3240;
      --ok:#7FCBA3; --single:#A6B0CB; --contested:#E39B7A;
      --shadow:0 1px 2px rgba(0,0,0,.3), 0 8px 24px -12px rgba(0,0,0,.5);
    }
  }
  :root[data-theme="dark"]{
    --bg:#12161D; --surface:#1A2029; --surface-alt:#212836;
    --ink:#EAE6DA; --ink-muted:#9BA3B2; --ink-faint:#6B7280;
    --accent:#D3AC4E; --accent-ink:#F3E4BC; --border:#2B3240;
    --ok:#7FCBA3; --single:#A6B0CB; --contested:#E39B7A;
    --shadow:0 1px 2px rgba(0,0,0,.3), 0 8px 24px -12px rgba(0,0,0,.5);
  }
  *{box-sizing:border-box}
  html{background:var(--bg)}
  body{margin:0;background:var(--bg);color:var(--ink);direction:rtl;line-height:1.65;
    font-family:"IBM Plex Sans Arabic","Noto Sans Arabic","Segoe UI",Tahoma,sans-serif;
    font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
  a{color:var(--accent);text-underline-offset:2px}
  .wrap{max-width:960px;margin:0 auto;padding:0 20px 64px}
  header{border-bottom:1px solid var(--border);padding:28px 0 18px;margin-bottom:20px}
  h1{font-family:"Markazi Text",serif;font-weight:700;font-size:clamp(2rem,4.5vw,2.6rem);margin:0;line-height:1.15}
  .tagline{color:var(--ink-muted);font-size:.92rem;margin:4px 0 0}
  .stamp{font-size:.82rem;color:var(--ink-faint);margin-top:10px}
  .strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:22px}
  .cell{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px}
  .cell .k{font-size:.68rem;font-weight:700;letter-spacing:.04em;color:var(--ink-faint);display:block}
  .cell .v{font-size:1.15rem;font-weight:700}
  .card{background:var(--surface);border:1px solid var(--border);border-inline-start:4px solid var(--accent);
    border-radius:12px;padding:18px 20px;margin-bottom:14px;box-shadow:var(--shadow)}
  .card.contested{border-inline-start-color:var(--contested)}
  .card h3{font-family:"Markazi Text",serif;font-size:1.35rem;margin:2px 0 12px;font-weight:700}
  .chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px}
  .chip{font-size:.68rem;font-weight:600;padding:2px 9px;border-radius:999px;
    border:1px solid var(--border);color:var(--ink-muted);background:var(--surface-alt)}
  .chip.v-ok{color:var(--ok);border-color:var(--ok);background:transparent}
  .chip.v-single{color:var(--single);border-color:var(--single);background:transparent}
  .chip.v-contested{color:var(--contested);border-color:var(--contested);background:transparent;border-style:dashed}
  .chip.follow{color:var(--accent-ink);border-color:var(--accent)}
  .layer{font-size:.68rem;font-weight:700;letter-spacing:.05em;color:var(--ink-faint);margin:14px 0 5px}
  .items{margin:0;padding-inline-start:18px}
  .items li{margin-bottom:9px;font-size:.92rem}
  .items .meta{display:block;font-size:.76rem;color:var(--ink-faint);margin-top:2px}
  .pending{background:var(--surface-alt);border:1px dashed var(--border);border-radius:8px;
    padding:10px 13px;font-size:.84rem;color:var(--ink-muted)}
  .note{background:var(--surface-alt);border:1px dashed var(--border);border-radius:10px;
    padding:14px 18px;font-size:.86rem;color:var(--ink-muted);margin-bottom:14px}
  .note b{color:var(--ink)}
  footer{margin-top:30px;padding-top:18px;border-top:1px solid var(--border);
    font-size:.8rem;color:var(--ink-faint);max-width:76ch}
</style>
</head>
<body>
<div class="wrap">

  <header>
    <h1>رصد واشنطن</h1>
    <p class="tagline">رصد الشأن الأمريكي وتأثيره على سوريا — طبقة الوقائع مبنية آلياً</p>
    <p class="stamp">نافذة الدورة: ${fmt(a.cycle.from)} ← ${fmt(a.cycle.to)} · بُنيت ${fmt(a.cycle.generatedAt)}</p>
  </header>

  <div class="strip">
    <div class="cell"><span class="k">بنود</span><span class="v">${a.totals.items}</span></div>
    <div class="cell"><span class="k">ملفات</span><span class="v">${a.totals.files}</span></div>
    <div class="cell"><span class="k">متابعات</span><span class="v">${a.totals.followUps}</span></div>
    <div class="cell"><span class="k">متنازع عليه</span><span class="v">${a.totals.contested}</span></div>
    <div class="cell"><span class="k">دورات بالأرشيف</span><span class="v">${a.totals.archiveCycles}</span></div>
  </div>

  ${a.files.length ? a.files.map(fileCard).join("") :
    `<div class="note">لا بنود ضمن نافذة هذه الدورة.</div>`}

  ${a.emptyCircles.length ? `<div class="note"><b>دوائر لم تُنتج بنداً ضمن النافذة:</b> ${a.emptyCircles.map(esc).join(" · ")}. تُذكر بالاسم لا بالصمت — الصفر هنا معلومة لا عطل.</div>` : ""}

  ${a.errors.length ? `<div class="note"><b>مصادر تعذّر الوصول إليها:</b> ${a.errors.map((e) => esc(e.source) + " (" + esc(e.message) + ")").join(" · ")}</div>` : ""}

  <footer>
    <p><b>كيف بُنيت هذه الصفحة:</b> جُمعت البنود آلياً ضمن نافذة زمنية صارمة، ثم نُسبت إلى ملفات بقاموس ثنائي اللغة، وحُسبت درجة التحقق من عدد المصادر المستقلة، وقورنت بالأرشيف لتمييز الجديد عن المتابعة. كل ذلك بالقواعد، بلا ذكاء اصطناعي.</p>
    <p><b>ما ليس فيها:</b> التعليق المباشر والتحليل — وهما حكم لا مطابقة، ويُكتبان بمراجعة بشرية. الوسوم أعلاه مؤشرات آلية لا أحكاماً نهائية.</p>
    <p>نسخة تجريبية للاستخدام الداخلي.</p>
  </footer>

</div>
</body>
</html>
`;

mkdirSync("docs", { recursive: true });
writeFileSync("docs/index.html", html, "utf8");
console.log(`بُنيت docs/index.html — ${a.totals.files} ملف، ${a.totals.items} بند`);
