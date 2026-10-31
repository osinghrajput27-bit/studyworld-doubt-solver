
import express from "express";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = "gemini-3.5-flash-lite";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static("."));

const apiKey = process.env.GEMINI_API_KEY;

const ai = apiKey
  ? new GoogleGenAI({ apiKey })
  : null;

const SYSTEM_INSTRUCTION = `
You are ZAQTIVO AI, a helpful and intelligent conversational assistant.

LANGUAGE:
- Follow the language requested by the user.
- Otherwise answer in the language of the latest message.
- Support Hindi, English, Hinglish and other supported languages.

GENERAL:
- Give accurate, clear and useful answers.
- Never invent facts.
- Explain educational questions step by step when useful.
- If uncertain, say so honestly.
- Keep simple answers concise.

CODE FORMATTING:
- Preserve all code syntax.
- Never remove curly braces, parentheses or semicolons.
- CSS selectors must use opening and closing braces.
- HTML tags must be properly opened and closed.
- JavaScript syntax must remain valid.
- If the user asks for code only, return only code.
- Do not add explanations when code only is requested.
- Return complete code blocks when appropriate.

IMAGE QUESTIONS:
- Carefully inspect uploaded images.
- Solve all clearly visible questions when asked.
- Preserve question numbering.
- Mention unreadable parts honestly.

Be friendly, natural and helpful.
`;

function repairSimpleCss(text) {
  if (typeof text !== "string") return text;

  // Extract CSS from a fenced code block, if present.
  const match = text.match(/```(?:css)?\s*([\s\S]*?)```/i);
  const source = match ? match[1].trim() : text.trim();

  const lines = source.split(/\r?\n/);

  const isDeclaration = line =>
    /^\s*[\w-]+\s*:\s*[^{}]+;?\s*$/.test(line);

  for (let i = 0; i < lines.length - 1; i++) {
    const selector = lines[i].trim();

    const validSelector =
      /^(body|html|:root|\*|[.#][\w-]+|[a-zA-Z][\w-]*)$/.test(selector);

    if (
      !validSelector ||
      selector.includes("{") ||
      !isDeclaration(lines[i + 1])
    ) continue;

    const declarations = [];
    let j = i + 1;

    while (j < lines.length && isDeclaration(lines[j])) {
      let value = lines[j].trim();
      if (!value.endsWith(";")) value += ";";
      declarations.push("  " + value);
      j++;
    }

    lines.splice(
      i,
      j - i,
      selector + " {",
      ...declarations,
      "}"
    );
  }

  const repaired = lines.join("\n");

  return match
    ? "```css\n" + repaired + "\n```"
    : repaired;
}

app.get("/health", (req, res) => {
  res.json({
    status: "ZAQTIVO AI is running",
    model: MODEL,
    apiKeyConfigured: Boolean(apiKey)
  });
});

app.post("/api/solve", upload.single("image"), async (req, res) => {
  const startedAt = Date.now();

  try {
    console.log("\n========== NEW AI REQUEST ==========");

    if (!ai) {
      console.error("GEMINI_API_KEY is missing.");

      return res.status(500).json({
        error: "AI service configuration is missing."
      });
    }

    const question = (req.body.question || "").trim();

    console.log("Question:", question || "[Image question]");
    console.log("Image uploaded:", Boolean(req.file));

    if (!question && !req.file) {
      return res.status(400).json({
        error: "Please ask a question or upload an image."
      });
    }

    if (req.file && !req.file.mimetype.startsWith("image/")) {
      return res.status(400).json({
        error: "Please upload a valid image."
      });
    }

    const parts = [{
      text: question ||
        "Carefully read and answer the question in this image."
    }];

    if (req.file) {
      parts.push({
        inlineData: {
          mimeType: req.file.mimetype,
          data: req.file.buffer.toString("base64")
        }
      });
    }

    console.log("Sending request to Gemini:", MODEL);

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{
        role: "user",
        parts
      }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.2,
        maxOutputTokens: 4096
      }
    });

    const rawAnswer = response.text || "";

    console.log("\n===== GEMINI RAW RESPONSE =====");
    console.log(rawAnswer);
    console.log("===== END RAW RESPONSE =====");

    if (!rawAnswer.trim()) {
      console.error("Gemini returned an empty response.");

      return res.status(502).json({
        error: "AI could not generate an answer. Please try again."
      });
    }

    const answer = repairSimpleCss(rawAnswer);

    console.log("\n===== FINAL RESPONSE =====");
    console.log(answer);
    console.log("===== END FINAL RESPONSE =====");

    console.log("Response time:", Date.now() - startedAt, "ms");
    console.log("========== REQUEST COMPLETE ==========\n");

    return res.json({
      answer,
      responseTime: Date.now() - startedAt
    });

  } catch (error) {
    console.error("\n===== ZAQTIVO AI ERROR =====");
    console.error("Name:", error?.name);
    console.error("Message:", error?.message);
    console.error("Status:", error?.status);
    console.error("========== ERROR END ==========\n");

    return res.status(500).json({
      error: "AI se answer nahi mil paya. Dobara try karo."
    });
  }
});

app.listen(PORT, () => {
  console.log(`ZAQTIVO AI running on port ${PORT}`);
});
