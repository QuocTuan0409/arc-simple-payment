// Vercel Serverless Function — calls Google Gemini Flash API
// Free tier: 1500 requests/day, 15 req/min on gemini-2.0-flash
//
// Env var required (set in Vercel Dashboard → Project → Settings → Environment Variables):
//   GEMINI_API_KEY = AIzaSy...your_key_here...
//
// Local testing: set in frontend/.env.local (gitignored) OR use `vercel dev`

const SYSTEM_PROMPT = `You are the AgentPay Assistant, a helpful AI inside a Web3 demo app.

CONTEXT:
- Users interact with AgentPay — on-chain spending controls for autonomous AI agents — built on Arc Testnet.
- Arc is Circle's stablecoin-native Layer-1 blockchain where USDC is the native gas token.
- The app's smart contract enforces three rules: daily limit, per-tx limit, service allowlist.
- The user can register an agent, send payments, whitelist services, pause/unpause, and view activity via natural-language chat commands handled by regex.

YOUR ROLE:
- Answer general Web3/DeFi/AI-agent questions, especially about Arc, stablecoins, USDC, bridging (CCTP), agentic economy, and how AgentPay helps.
- Keep responses concise: 2–4 short paragraphs MAX. Use plain text, no markdown headers.
- If the user asks to perform an action (send/register/pause/whitelist), guide them to the exact command syntax — DO NOT execute anything yourself.
  Available commands:
    register agent 5 daily 0.1 pertx name MyBot
    send 0.01 to 0xADDRESS memo "label"
    whitelist 0xADDRESS
    pause / unpause
    show my budget / show activity / show whitelist
- Never invent contract addresses, tx hashes, or balances. If unsure, say so.
- This is a hackathon demo on Arc Testnet — no real money. Mention this briefly when relevant.

TONE: Friendly, concise, technical when needed. Reply in the same language the user uses (English or Vietnamese).`;

export default async function handler(req, res) {
  // CORS — allow your own Vercel domain + localhost for testing
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Server config error: GEMINI_API_KEY not set in environment variables.",
    });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const userMessage = (body?.message || "").trim();
  if (!userMessage) {
    return res.status(400).json({ error: "Missing 'message' field" });
  }
  if (userMessage.length > 2000) {
    return res.status(400).json({ error: "Message too long (max 2000 chars)" });
  }

  // Optional: conversation history (array of { role: "user" | "model", text: "..." })
  const history = Array.isArray(body?.history) ? body.history.slice(-10) : [];

  // Build Gemini contents array
  // System instruction goes in `systemInstruction`, conversation in `contents`
  const contents = [];
  for (const turn of history) {
    if (turn && typeof turn.text === "string" && (turn.role === "user" || turn.role === "model")) {
      contents.push({ role: turn.role, parts: [{ text: turn.text }] });
    }
  }
  contents.push({ role: "user", parts: [{ text: userMessage }] });

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  try {
    const aiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 600,
          topP: 0.95,
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Gemini API error:", aiRes.status, errText);
      return res.status(502).json({
        error: `Gemini API returned ${aiRes.status}`,
        detail: errText.slice(0, 300),
      });
    }

    const data = await aiRes.json();
    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      "I'm not sure how to answer that. Try a more specific question about Arc, USDC, AgentPay, or the available chat commands.";

    return res.status(200).json({
      reply,
      model: "gemini-2.0-flash",
      finishReason: data?.candidates?.[0]?.finishReason || null,
    });
  } catch (err) {
    console.error("Chat handler error:", err);
    return res.status(500).json({
      error: "Failed to reach Gemini API",
      detail: String(err?.message || err).slice(0, 300),
    });
  }
}
