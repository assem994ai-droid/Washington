// ============================================================
//  جامع الأخبار — منصة «رصد واشنطن»
//  ما يفعله هذا الملف، بالترتيب:
//   1) يقرأ قائمة المصادر من config/sources.json
//   2) ينزّل كل مصدر من الإنترنت
//   3) يستخرج منه العناوين والروابط والتواريخ
//   4) يحذف كل ما هو أقدم من نافذة الدورة (24 ساعة افتراضياً)
//   5) يحذف المكرر
//   6) يحفظ الناتج في مجلد data/ كملف JSON مؤرَّخ
//  لا يحتاج أي مكتبات خارجية — Node وحده يكفي.
// ============================================================

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

// ------------------------------------------------------------
// (1) قراءة الإعدادات
// ------------------------------------------------------------
const cfg = JSON.parse(readFileSync("config/sources.json", "utf8"));

// عدد الساعات: يؤخذ من الزر إن مُرّر، وإلا من ملف الإعدادات، وإلا 24
const HOURS = Number(process.env.WINDOW_HOURS) || cfg.windowHours || 24;

const now = new Date();
const from = new Date(now.getTime() - HOURS * 3600 * 1000);

console.log("=".repeat(60));
console.log(`نافذة الدورة: آخر ${HOURS} ساعة`);
console.log(`من: ${from.toISOString()}`);
console.log(`إلى: ${now.toISOString()}`);
console.log("=".repeat(60));

// ------------------------------------------------------------
// (2) أدوات صغيرة لتنظيف النصوص المستخرجة من XML
// ------------------------------------------------------------

// يحوّل نص XML إلى نص عادي: يزيل CDATA والوسوم ورموز HTML
function clean(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")   // يبقى أخيراً وإلا أفسد ما قبله
    .replace(/\s+/g, " ")
    .trim();
}

// يستخرج محتوى وسم معيّن من قطعة XML، مثل <title>...</title>
function tag(block, name) {
  const re = new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">", "i");
  const m = block.match(re);
  return m ? clean(m[1]) : "";
}

// الرابط: في RSS يكون <link>الرابط</link>، وفي Atom يكون <link href="الرابط"/>
function linkOf(block) {
  const rss = tag(block, "link");
  if (rss && rss.startsWith("http")) return rss;
  const m = block.match(/<link[^>]*href="([^"]+)"/i);
  return m ? m[1] : "";
}

// ------------------------------------------------------------
// (3) قراءة تغذية RSS أو Atom
// ------------------------------------------------------------
function parseFeed(xml) {
  // كل خبر محاط بـ <item> في RSS أو <entry> في Atom
  const blocks = xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi) || [];
  return blocks.map((b) => ({
    title: tag(b, "title"),
    link: linkOf(b),
    rawDate:
      tag(b, "pubDate") ||
      tag(b, "published") ||
      tag(b, "updated") ||
      tag(b, "dc:date"),
  }));
}

// ------------------------------------------------------------
// (4) تنزيل صفحة من الإنترنت مع مهلة زمنية
// ------------------------------------------------------------
async function download(url) {
  const res = await fetch(url, {
    headers: { "user-agent": "rasd-washington-collector/1.0" },
    signal: AbortSignal.timeout(25000), // 25 ثانية كحد أقصى
  });
  if (!res.ok) throw new Error(`الخادم ردّ برمز ${res.status}`);
  return res.text();
}

// ------------------------------------------------------------
// (5) المرور على كل المصادر
// ------------------------------------------------------------
const keywords = (cfg.keywords || []).map((k) => k.toLowerCase());
const items = [];
const errors = [];

function matchesKeywords(title) {
  const t = title.toLowerCase();
  return keywords.some((k) => t.includes(k));
}

for (const src of cfg.sources) {
  try {
    const body = await download(src.url);
    let raw = [];

    if (src.type === "federalregister") {
      // مصدر من نوع JSON وليس RSS — السجل الفيدرالي الأمريكي
      const data = JSON.parse(body);
      raw = (data.results || []).map((r) => ({
        title: r.title || "",
        link: r.html_url || "",
        // هذا المصدر يعطي التاريخ بلا ساعة، فنفترض بداية اليوم
        rawDate: r.publication_date ? r.publication_date + "T00:00:00Z" : "",
      }));
    } else {
      raw = parseFeed(body);
    }

    let kept = 0;
    let tooOld = 0;
    let offTopic = 0;

    for (const r of raw) {
      if (!r.title || !r.link) continue;

      const d = new Date(r.rawDate);
      if (isNaN(d.getTime())) continue;      // تاريخ غير مفهوم → نتجاهله

      if (d < from || d > now) { tooOld++; continue; }          // خارج النافذة
      if (src.filter && !matchesKeywords(r.title)) { offTopic++; continue; }

      items.push({
        source: src.name,
        sourceId: src.id,
        circle: src.circle,
        title: r.title,
        link: r.link,
        publishedAt: d.toISOString(),
      });
      kept++;
    }

    console.log(
      `✓ ${src.name} — قُرئ ${raw.length}، ضمن النافذة ${kept}` +
      (tooOld ? `، خارج الوقت ${tooOld}` : "") +
      (offTopic ? `، خارج الموضوع ${offTopic}` : "")
    );
  } catch (e) {
    errors.push({ source: src.name, sourceId: src.id, message: String(e.message || e) });
    console.log(`✗ ${src.name} — فشل: ${e.message || e}`);
  }
}

// ------------------------------------------------------------
// (6) حذف المكرر + الترتيب من الأحدث للأقدم
// ------------------------------------------------------------
const seen = new Set();
const unique = [];
for (const it of items) {
  const key = it.link.split("?")[0];   // نتجاهل ما بعد ? لأنه غالباً تتبّع إعلاني
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push(it);
}
unique.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

// ------------------------------------------------------------
// (7) الحفظ
// ------------------------------------------------------------
const byCircle = {};
const bySource = {};
for (const it of unique) {
  byCircle[it.circle] = (byCircle[it.circle] || 0) + 1;
  bySource[it.source] = (bySource[it.source] || 0) + 1;
}

const output = {
  cycle: {
    generatedAt: now.toISOString(),
    windowHours: HOURS,
    from: from.toISOString(),
    to: now.toISOString(),
  },
  counts: { total: unique.length, byCircle, bySource },
  errors,
  items: unique,
};

mkdirSync("data", { recursive: true });
const stamp = now.toISOString().slice(0, 16).replace(":", "-"); // مثال 2026-08-28T11-30
writeFileSync(`data/${stamp}.json`, JSON.stringify(output, null, 2) + "\n", "utf8");
writeFileSync("data/latest.json", JSON.stringify(output, null, 2) + "\n", "utf8");

console.log("=".repeat(60));
console.log(`المجموع بعد حذف المكرر: ${unique.length} بند`);
for (const [c, n] of Object.entries(byCircle)) console.log(`   • ${c}: ${n}`);
if (errors.length) console.log(`مصادر فشلت: ${errors.length}`);
console.log(`حُفظ في: data/${stamp}.json  و  data/latest.json`);
console.log("=".repeat(60));
