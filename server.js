
import express from "express";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Please upload an image file."));
    }
  }
});

app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.send("StudyWorld AI backend is running!");
});

app.post("/api/solve", upload.single("photo"), async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "Server API key is not configured yet."
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const question = (req.body.question || "").trim();
    const language = req.body.language || "Hindi";
    const photo = req.file;

    if (!question && !photo) {
      return res.status(400).json({
        error: "Please enter a question or upload a photo."
      });
    }

    const allowedLanguages = ["Hindi", "English", "Hinglish"];
    const answerLanguage = allowedLanguages.includes(language)
      ? language
      : "Hindi";

    const prompt = `
You are StudyWorld AI, a helpful school doubt-solving tutor.

Solve the student's question accurately.
Answer in ${answerLanguage}.
Explain the solution step by step in simple language.
For maths, show calculations and the final answer.
For science, explain the concept clearly.
If the image is unclear or information is missing, say so.
Never invent unreadable text from an image.

Student's question:
${question || "Please read and solve the question in the attached image."}
`;

    const contents = [{ text: prompt }];

    if (photo) {
      contents.push({
        inlineData: {
          mimeType: photo.mimetype,
          data: photo.buffer.toString("base64")
        }
      });
    }

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents
    });

    res.json({
      answer: result.text || "No answer was returned. Please try again."
    });
  } catch (error) {
    console.error("Solve error:", error.message);
    res.status(500).json({
      error: "Could not solve the question. Please try again."
    });
  }
});

app.use((error, req, res, next) => {
  console.error(error.message);
  res.status(400).json({
    error: error.message || "Invalid request."
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`StudyWorld backend listening on port ${PORT}`);
});
