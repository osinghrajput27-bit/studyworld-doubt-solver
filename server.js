import express from "express";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import { OfficeParser } from "officeparser";
import path from "path";

const app = express();

const PORT = process.env.PORT || 3000;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const apiKey = process.env.GEMINI_API_KEY;

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// ------------------------------------
// CONFIGURATION
// ------------------------------------

const MAX_IMAGES = 5;
const MAX_DOCUMENTS = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const MAX_DOCUMENT_TEXT = 50000;
const MAX_TOTAL_DOCUMENT_TEXT = 100000;

const IMAGE_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

const DOCUMENT_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".xlsx",
  ".pptx",
  ".csv",
  ".txt",
  ".rtf"
];

const SYSTEM_PROMPT = `
You are ZAQTIVO AI, a helpful general-purpose AI assistant.

Your responsibilities:
- Answer questions clearly and accurately.
- Explain school topics in simple language when appropriate.
- Solve mathematics questions step by step.
- Understand uploaded images and documents.
- Summarize PDFs and other documents.
- Explain tables and spreadsheet information.
- Help with science, mathematics, coding, writing and general knowledge.
- Translate between languages.
- Reply in the same language the user uses or requests.
- Support multilingual conversations.
- If the user asks in Hindi, reply in Hindi.
- If the user asks in English, reply in English.
- If the user uses another language, try to reply in that language.
- Do not pretend to have searched the internet.
- Do not claim to have performed actions you cannot perform.
- If document content is incomplete or unreadable, clearly explain the limitation.
- Use headings, lists and examples when they improve readability.

You are ZAQTIVO AI.
`;

// ------------------------------------
// EXPRESS SETTINGS
// ------------------------------------

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ------------------------------------
// FILE UPLOAD CONFIGURATION
// ------------------------------------

const storage = multer.memoryStorage();

const upload = multer({
  storage,

  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_IMAGES + MAX_DOCUMENTS
  },

  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    const isImage = Object.prototype.hasOwnProperty.call(
      IMAGE_TYPES,
      extension
    );

    const isDocument = DOCUMENT_EXTENSIONS.includes(extension);

    if (!isImage && !isDocument) {
      return callback(
        new Error(
          "Unsupported file. Please upload PDF, DOCX, XLSX, PPTX, CSV, TXT, RTF, JPG, PNG or WEBP."
        )
      );
    }

    callback(null, true);
  }
});

// ------------------------------------
// DOCUMENT TEXT EXTRACTION
// ------------------------------------

async function extractDocumentText(file) {
  const extension = path.extname(file.originalname).toLowerCase();

  try {
    // Plain text files
    if (extension === ".txt" || extension === ".csv") {
      return file.buffer.toString("utf8").trim();
    }

    // OfficeParser-supported documents
    let parserOptions = {};

    if (extension === ".rtf") {
      parserOptions.fileType = "rtf";
    }

    const ast = await OfficeParser.parseOffice(
      file.buffer,
      parserOptions
    );

    const result = await ast.to("text");

    const extractedText = result?.value || "";

    return extractedText.trim();

  } catch (error) {
    console.error(
      "Document extraction error:",
      file.originalname,
      error.message
    );

    throw new Error(
      `Could not read ${file.originalname}. Please check that the document is valid and not password-protected.`
    );
  }
}

// ------------------------------------
// DOCUMENT PROCESSING
// ------------------------------------

async function processDocuments(files) {
  const documents = [];
  let totalCharacters = 0;

  for (const file of files) {
    const extractedText = await extractDocumentText(file);

    if (!extractedText) {
      throw new Error(
        `${file.originalname} does not contain readable text.`
      );
    }

    const remainingCharacters =
      MAX_TOTAL_DOCUMENT_TEXT - totalCharacters;

    if (remainingCharacters <= 0) {
      break;
    }

    const allowedCharacters = Math.min(
      MAX_DOCUMENT_TEXT,
      remainingCharacters
    );

    const limitedText = extractedText.slice(
      0,
      allowedCharacters
    );

    totalCharacters += limitedText.length;

    documents.push({
      name: file.originalname,
      text: limitedText,
      truncated: extractedText.length > limitedText.length
    });
  }

  return documents;
}

// ------------------------------------
// HEALTH CHECK
// ------------------------------------

app.get("/health", (req, res) => {
  res.json({
    status: "ZAQTIVO AI is running",
    model: MODEL,
    apiKeyConfigured: Boolean(apiKey),
    googleSearchEnabled: false,
    assistantType: "General Purpose AI",
    multipleImageUpload: true,
    documentSupport: true,
    supportedDocuments: DOCUMENT_EXTENSIONS,
    maxImages: MAX_IMAGES,
    maxDocuments: MAX_DOCUMENTS,
    maxFileSizeMB: 10
  });
});

// ------------------------------------
// HOME ROUTE
// ------------------------------------

app.get("/", (req, res) => {
  res.send("ZAQTIVO AI backend is running.");
});

// ------------------------------------
// AI SOLVER ROUTE
// ------------------------------------

app.post(
  "/api/solve",

  upload.fields([
    {
      name: "images",
      maxCount: MAX_IMAGES
    },
    {
      name: "documents",
      maxCount: MAX_DOCUMENTS
    }
  ]),

  async (req, res) => {
    try {
      if (!ai) {
        return res.status(503).json({
          error: "AI service is not configured. Please check the server settings."
        });
      }

      const question = (req.body.question || "").trim();

      const images = req.files?.images || [];
      const documentFiles = req.files?.documents || [];

      if (
        !question &&
        images.length === 0 &&
        documentFiles.length === 0
      ) {
        return res.status(400).json({
          error: "Please enter a question or upload a file."
        });
      }

      // Validate image types
      for (const file of images) {
        const extension = path.extname(
          file.originalname
        ).toLowerCase();

        const expectedMime = IMAGE_TYPES[extension];

        if (
          !expectedMime ||
          file.mimetype !== expectedMime
        ) {
          return res.status(400).json({
            error: `Unsupported image: ${file.originalname}`
          });
        }
      }

      // Extract document contents
      const documents = await processDocuments(
        documentFiles
      );

      // Build AI prompt
      let prompt = question || "Please analyze the uploaded files and explain their contents.";

      if (documents.length > 0) {
        prompt += "\n\nUPLOADED DOCUMENT CONTENT:\n";

        documents.forEach((document, index) => {
          prompt += `\n\nDOCUMENT ${index + 1}: ${document.name}\n`;
          prompt += "------------------------------\n";
          prompt += document.text;

          if (document.truncated) {
            prompt += "\n\n[Document text was shortened because of the processing limit.]";
          }
        });

        prompt += "\n\nPlease use the document content above to answer the user's question.";
      }

      // Prepare Gemini content
      const parts = [
        {
          text: prompt
        }
      ];

      // Add uploaded images
      for (const file of images) {
        parts.push({
          inlineData: {
            mimeType: file.mimetype,
            data: file.buffer.toString("base64")
          }
        });
      }

      // Call Gemini
      const response = await ai.models.generateContent({
        model: MODEL,

        contents: [
          {
            role: "user",
            parts
          }
        ],

        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0.5
        }
      });

      const answer = response.text || "";

      if (!answer.trim()) {
        return res.status(502).json({
          error: "AI could not generate an answer. Please try again."
        });
      }

      return res.json({
        success: true,
        answer,
        model: MODEL,
        imagesProcessed: images.length,
        documentsProcessed: documents.length,
        documentNames: documents.map(
          document => document.name
        )
      });

    } catch (error) {
      console.error("AI SOLVER ERROR:", error);

      const message = error.message || "";

      if (
        message.includes("429") ||
        message.toLowerCase().includes("quota")
      ) {
        return res.status(429).json({
          error: "AI free quota is currently unavailable. Please try again later."
        });
      }

      if (
        message.includes("503") ||
        message.toLowerCase().includes("high demand")
      ) {
        return res.status(503).json({
          error: "AI is currently busy. Please try again later."
        });
      }

      return res.status(500).json({
        error: message || "Something went wrong while processing your request."
      });
    }
  }
);

// ------------------------------------
// MULTER ERROR HANDLING
// ------------------------------------

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: "Each file must be 10 MB or smaller."
      });
    }

    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        error: "Too many files uploaded."
      });
    }

    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        error: "Too many files or an unexpected upload field."
      });
    }

    return res.status(400).json({
      error: error.message
    });
  }

  if (error) {
    return res.status(400).json({
      error: error.message || "File upload failed."
    });
  }

  next();
});

// ------------------------------------
// START SERVER
// ------------------------------------

app.listen(PORT, () => {
  console.log(`ZAQTIVO AI server running on port ${PORT}`);
  console.log(`Model: ${MODEL}`);
  console.log(`Google Search: Disabled`);
  console.log(`Multiple image upload: Enabled`);
  console.log(`Document support: Enabled`);
});
