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
    // المقتطف: كثير من الأخبار المهمة لا تذكر سوريا في العنوان بل في السطر الأول
    excerpt: (tag(b, "description") || tag(b, "summary") || tag(b, "content:encoded") || tag(b, "content")).slice(0, 400),
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
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      "accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json;q=0.9, */*;q=0.8",
      "accept-language": "ar,en;q=0.9"
    },
    signal: AbortSignal.timeout(25000), // 25 ثانية كحد أقصى
  });
  if (!res.ok) throw new Error(`الخادم ردّ برمز ${res.status}`);
  return res.text();
}

// ------------------------------------------------------------
// (4-ب) قراءة مشاريع القوانين من بوابة الكونغرس الرسمية
//   لا تغذية RSS هنا، بل "باب بيانات" يحتاج مفتاحاً.
//   المفتاح يأتي من خزنة GitHub عبر متغير البيئة CONGRESS_API_KEY،
//   ولا يُكتب في أي ملف ولا يظهر في السجل.
// ------------------------------------------------------------

// 119 ← "119th"  (لبناء رابط الصفحة العامة للمشروع)
function ordinal(n) {
  const r10 = n % 10, r100 = n % 100;
  if (r10 === 1 && r100 !== 11) return n + "st";
  if (r10 === 2 && r100 !== 12) return n + "nd";
  if (r10 === 3 && r100 !== 13) return n + "rd";
  return n + "th";
}

const BILL_PATH = {
  s: "senate-bill", hr: "house-bill",
  sres: "senate-resolution", hres: "house-resolution",
  sjres: "senate-joint-resolution", hjres: "house-joint-resolution",
  sconres: "senate-concurrent-resolution", hconres: "house-concurrent-resolution",
};

async function readCongress(src) {
  const key = process.env.CONGRESS_API_KEY;
  if (!key) throw new Error("مفتاح CONGRESS_API_KEY غير مضبوط في خزنة المستودع");

  const base = src.base || "https://api.congress.gov/v3";
  const out = [];

  for (const b of src.bills || []) {
    const url = `${base}/bill/${b.congress}/${b.type}/${b.number}/actions` +
                `?format=json&limit=50&api_key=${key}`;
    const data = JSON.parse(await download(url));
    const actions = data.actions || [];

    const page = BILL_PATH[b.type] || "bill";
    const link = `https://www.congress.gov/bill/${ordinal(b.congress)}-congress/${page}/${b.number}/all-actions`;

    actions.forEach((a, i) => {
      if (!a.actionDate || !a.text) return;
      out.push({
        // العنوان يحمل اسم المشروع ثم نص الإجراء الذي وقع عليه
        title: `${b.label} — ${a.text}`,
        // لاصقة فريدة لكل إجراء حتى لا يحذفها كاشف التكرار
        link: `${link}#${a.actionDate}-${i}`,
        rawDate: a.actionDate + "T00:00:00Z",
      });
    });
  }
  return out;
}

// ------------------------------------------------------------
// (5) المرور على كل المصادر
// ------------------------------------------------------------
const keywords  = (cfg.keywords  || []).map((k) => k.toLowerCase());  // مرساة: هل يخص سوريا؟
const relevance = (cfg.relevance || []).map((k) => k.toLowerCase());  // صلة: هل يمسّ الملف الأمريكي وأطرافه؟
const items = [];
const errors = [];

// شرطان لا شرط واحد:
//   (أ) مرساة سورية — وإلا فالخبر ليس خبرنا أصلاً
//   (ب) صلة بالملف — وإلا فهو شأن سوري داخلي لا يخص رصد واشنطن
// قائمة الصلة فارغة ← يُكتفى بالمرساة (سلوك متوافق مع الإعدادات القديمة)
function matchesKeywords(title, excerpt, src) {
  const t = (title + " " + (excerpt || "")).toLowerCase();
  // المصادر السورية الخالصة لا تنشر إلا عن سوريا، فالمرساة فيها مضمونة سلفاً
  if (src.scope !== "syria" && !keywords.some((k) => t.includes(k))) return false;
  if (!relevance.length) return true;
  return relevance.some((k) => t.includes(k));
}

for (const src of cfg.sources) {
  try {
    let raw = [];

    if (src.type === "congress") {
      // مصدر يجلب عدة روابط بنفسه، فلا ننزّل شيئاً مسبقاً
      raw = await readCongress(src);
    } else if (src.type === "federalregister") {
      const body = await download(src.url);
      // مصدر من نوع JSON وليس RSS — السجل الفيدرالي الأمريكي
      const data = JSON.parse(body);
      raw = (data.results || []).map((r) => ({
        title: r.title || "",
        link: r.html_url || "",
        // هذا المصدر يعطي التاريخ بلا ساعة، فنفترض بداية اليوم
        rawDate: r.publication_date ? r.publication_date + "T00:00:00Z" : "",
      }));
    } else {
      raw = parseFeed(await download(src.url));
    }

    let kept = 0;
    let tooOld = 0;
    let offTopic = 0;

    for (const r of raw) {
      if (!r.title || !r.link) continue;

      const d = new Date(r.rawDate);
      if (isNaN(d.getTime())) continue;      // تاريخ غير مفهوم → نتجاهله

      if (d < from || d > now) { tooOld++; continue; }          // خارج النافذة
      if (src.filter && !matchesKeywords(r.title, r.excerpt, src)) { offTopic++; continue; }

      items.push({
        source: src.name,
        sourceId: src.id,
        circle: src.circle,
        title: r.title,
        excerpt: (r.excerpt || "").slice(0, 240),
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
