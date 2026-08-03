// ZENTORA ホームページ — Worker エントリポイント
//
// 役割は2つだけ：
//  1. /api/contact への POST を受けて Notion にお問い合わせを保存する
//  2. それ以外のリクエストは静的ファイル（index.html 等）をそのまま返す
//
// 必要な環境変数（Cloudflareのダッシュボード側で設定）:
//   NOTION_TOKEN        … Notionインテグレーションのシークレット
//   NOTION_DATABASE_ID  … お問い合わせデータベースのID

const NOTION_VERSION = "2022-06-28";

function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function handleContact(request, env) {
  if (!env.NOTION_TOKEN || !env.NOTION_DATABASE_ID) {
    return json({ error: "server_not_configured" }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const name = (body.name || "").trim();
  const company = (body.company || "").trim();
  const email = (body.email || "").trim();
  const tel = (body.tel || "").trim();
  const message = (body.message || "").trim();

  // ハニーポット（bot対策）。埋まっていたら黙って成功扱いにする。
  if ((body._gotcha || "").trim() !== "") {
    return json({ ok: true });
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
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS });
      }
      if (request.method === "POST") {
        return handleContact(request, env);
      }
      return json({ error: "method_not_allowed" }, 405);
    }

    // それ以外は静的ファイル（index.html など）を返す
    return env.ASSETS.fetch(request);
  },
};
