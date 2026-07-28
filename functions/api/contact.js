// ZENTORA お問い合わせフォーム → Notion 連携
// Cloudflare Pages Functions 版。パス: /api/contact
//
// 環境変数（Cloudflare Pages のプロジェクト設定 → Settings → Environment variables で登録）:
//   NOTION_TOKEN        … Notionインテグレーションのシークレット
//   NOTION_DATABASE_ID  … お問い合わせデータベースのID
//
// Vercelを使う場合はこのフォルダ（functions/）は不要。api/contact.js を使う。

const NOTION_VERSION = "2022-06-28";

function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost({ request, env }) {
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { "Content-Type": "application/json", ...CORS },
    });

  if (!env.NOTION_TOKEN || !env.NOTION_DATABASE_ID) {
    return json({ error: "server_not_configured" }, 500);
  }

  try {
    const body = await request.json();
    const name = (body.name || "").trim();
    const company = (body.company || "").trim();
    const email = (body.email || "").trim();
    const tel = (body.tel || "").trim();
    const message = (body.message || "").trim();

    if ((body._gotcha || "").trim() !== "") {
      return json({ ok: true }); // ハニーポット
    }

    if (!name || !email || !message || !isEmail(email)) {
      return json({ error: "invalid_input" }, 400);
    }

    const properties = {
      "氏名": { title: [{ text: { content: name.slice(0, 200) } }] },
      "メールアドレス": { email: email.slice(0, 200) },
      "お問い合わせ内容": { rich_text: [{ text: { content: message.slice(0, 2000) } }] },
      "ステータス": { select: { name: "未対応" } },
    };
    if (company) properties["法人名"] = { rich_text: [{ text: { content: company.slice(0, 200) } }] };
    if (tel) properties["電話番号"] = { phone_number: tel.slice(0, 50) };

    const r = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.NOTION_TOKEN}`,
        "Content-Type": "application/json",
        "Notion-Version": NOTION_VERSION,
      },
      body: JSON.stringify({
        parent: { database_id: env.NOTION_DATABASE_ID },
        properties,
      }),
    });

    if (!r.ok) {
      console.error("Notion API error:", r.status, await r.text());
      return json({ error: "notion_failed" }, 502);
    }

    return json({ ok: true });
  } catch (e) {
    console.error("Handler error:", e);
    return json({ error: "server_error" }, 500);
  }
}
