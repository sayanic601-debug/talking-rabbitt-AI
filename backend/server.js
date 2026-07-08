import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import our modular BI Copilot services
import { parseCSV, detectColumnTypes } from './services/csvIngestion.js';
import { processDataset } from './services/dataProcessor.js';
import { generateExecutionPlan, generateInsights, clearHistory } from './services/llmReasoning.js';
import { queryLocal } from './services/localAnalyzer.js';
import { executePlan } from './services/dataEngine.js';

// Simple native helper to load environment variables from .env file
function loadEnv() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const envPath = path.join(__dirname, '.env');
    console.log("DEBUG loadEnv: resolved path =", envPath);
    if (fs.existsSync(envPath)) {
      const envText = fs.readFileSync(envPath, 'utf-8');
      console.log("DEBUG loadEnv: raw envText =\n", envText);
      envText.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const index = trimmed.indexOf('=');
          if (index > 0) {
            const key = trimmed.substring(0, index).trim();
            let val = trimmed.substring(index + 1).trim();
            if (val.startsWith('"') && val.endsWith('"')) {
              val = val.substring(1, val.length - 1);
            } else if (val.startsWith("'") && val.endsWith("'")) {
              val = val.substring(1, val.length - 1);
            }
            process.env[key] = val;
          }
        }
      });
    }
  } catch (e) {
    console.warn("Could not load .env file:", e.message);
  }
}
loadEnv();
console.log("DEBUG loadEnv: GEMINI_API_KEY =", process.env.GEMINI_API_KEY ? `[Length: ${process.env.GEMINI_API_KEY.length}, Starts with: "${process.env.GEMINI_API_KEY.slice(0, 5)}..."]` : "undefined");

const app = express();
const port = process.env.PORT || 8000;

// Enable CORS and JSON body parser
app.use(cors());
app.use(express.json());

// Global request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.method === 'POST' && req.url !== '/api/upload') {
    console.log(`[REQUEST BODY]`, JSON.stringify(req.body));
  }
  next();
});

// Root path health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: "healthy",
    message: "Talking Rabbitt API Server is active.",
    endpoints: {
      upload: "POST /api/upload",
      query: "POST /api/query"
    }
  });
});

// Set up Multer for handling file uploads in memory
const upload = multer({ storage: multer.memoryStorage() });

// Global in-memory storage for the uploaded dataset & calculated analytics
let dbState = {
  df: null,            // Array of parsed row objects
  filename: null,
  columns: [],         // Array of column schema objects: { name, type }
  temporalCol: null,   // Temporal column name
  numericCols: [],     // Array of numeric column names
  categoricalCols: [], // Array of categorical column names
  textCols: [],         // Array of text/long-string column names
  booleanCols: [],     // Array of boolean columns
  primaryKeyCandidates: [], // Primary key candidate columns
  relationships: []    // Detected 1-to-many relationships
};

let analyticsState = null; // Stores advanced data profile calculations

// Ingestion API endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    console.warn("[UPLOAD] No file found in req.file");
    return res.status(400).json({
      success: false,
      error: "No file uploaded."
    });
  }

  const filename = req.file.originalname;
  console.log(`[UPLOAD] File received: "${filename}" (${req.file.size} bytes, mimetype: ${req.file.mimetype})`);

  if (!filename.endsWith('.csv')) {
    console.warn(`[UPLOAD] Rejected non-CSV file: "${filename}"`);
    return res.status(400).json({
      success: false,
      error: "Only CSV files are supported."
    });
  }

  try {
    const csvText = req.file.buffer.toString('utf-8');
    console.log(`[UPLOAD] CSV content character length: ${csvText.length}`);
    
    // 1. Ingest/Parse CSV
    const { headers, rows } = parseCSV(csvText);
    console.log(`[CSV PARSER] Headers found:`, headers);
    console.log(`[CSV PARSER] Rows parsed: ${rows.length}`);

    if (rows.length === 0) {
      console.warn("[CSV PARSER] Parsed 0 rows from file.");
      return res.status(400).json({
        success: false,
        error: "The uploaded CSV file is empty."
      });
    }

    // 2. Classify Column Types
    const columnTypes = detectColumnTypes(headers, rows);
    const { 
      temporalCol, 
      numericCols, 
      categoricalCols, 
      textCols, 
      booleanCols, 
      primaryKeyCandidates, 
      relationships 
    } = columnTypes;
    console.log(`[CSV ANALYST] Types - Temporal: "${temporalCol}", Numeric:`, numericCols, `, Categorical:`, categoricalCols, `, Text:`, textCols, `, Boolean:`, booleanCols);

    // 3. Compute Comprehensive Analytics Summaries
    analyticsState = processDataset(headers, rows, columnTypes);
    console.log(`[CSV ANALYST] Data quality and statistical summaries successfully calculated.`);

    // 4. Save in global database state
    dbState = {
      df: rows,
      filename,
      columns: headers.map(name => {
        let type = 'unknown';
        if (name === temporalCol) type = 'temporal';
        else if (numericCols.includes(name)) type = 'numeric';
        else if (categoricalCols.includes(name)) type = 'categorical';
        else if (textCols.includes(name)) type = 'text';
        else if (booleanCols.includes(name)) type = 'boolean';
        return { name, type };
      }),
      temporalCol,
      numericCols,
      categoricalCols,
      textCols,
      booleanCols,
      primaryKeyCandidates,
      relationships
    };

    // Reset Chat Memory on new file upload
    clearHistory();
    console.log(`[UPLOAD] In-memory database updated. Conversation memory cleared.`);

    return res.json({
      success: true,
      message: "CSV file uploaded, parsed, and analyzed successfully.",
      data: {
        filename: dbState.filename,
        rowCount: dbState.df.length,
        columns: dbState.columns,
        temporalColumn: dbState.temporalCol,
        numericColumns: dbState.numericCols,
        categoricalColumns: dbState.categoricalCols,
        textColumns: dbState.textCols,
        booleanColumns: dbState.booleanCols,
        primaryKeyCandidates: dbState.primaryKeyCandidates,
        relationships: dbState.relationships,
        analytics: analyticsState,
        previewRows: dbState.df.slice(0, 100)
      }
    });

  } catch (error) {
    console.error(`[EXCEPTION] Error in upload handler:`, error);
    return res.status(500).json({
      success: false,
      error: `Error parsing CSV: ${error.message}`
    });
  }
});

// Query API endpoint
app.post('/api/query', async (req, res) => {
  const { prompt } = req.body;
  console.log(`[QUERY] Received query prompt: "${prompt}"`);
  if (!prompt) {
    console.warn("[QUERY] Missing prompt");
    return res.status(400).json({ success: false, error: "Prompt is required." });
  }

  if (!dbState.df || dbState.df.length === 0) {
    console.log("[QUERY] Request failed: No active dataset loaded in memory.");
    return res.status(400).json({
      success: false,
      error: "It looks like you haven't uploaded a CSV file yet. Please upload a dataset first so that Rabbit can analyze it."
    });
  }

  const activeKey = process.env.GEMINI_API_KEY;
  const isGeminiOffline = !activeKey || activeKey === "YOUR_GEMINI_API_KEY_HERE" || activeKey.startsWith("YOUR_");

  try {
    let resultPayload;
    if (isGeminiOffline) {
      console.log("[QUERY] Running local analytical fallback engine (Gemini API offline)...");
      resultPayload = queryLocal(prompt, dbState, analyticsState);
    } else {
      console.log("[QUERY] Running two-pass dynamic AI reasoning engine...");
      
      // Pass 1: Plan
      const plan = await generateExecutionPlan(prompt, dbState, analyticsState);
      
      // Pass 2: Calculate
      const engineResults = executePlan(dbState.df, plan, dbState);
      
      // Pass 3: Synthesize Insights
      resultPayload = await generateInsights(prompt, plan, engineResults, dbState, analyticsState);
      
      // Attach SVG Graph details from computed results
      let finalGraph = { type: 'none', title: '', data: [] };
      if (plan.visualization && plan.visualization !== 'none') {
        let chartData = [];
        const targetMetric = engineResults.targetMetric;
        
        if (plan.forecast && engineResults.forecastPoints.length > 0) {
          const hist = engineResults.results.map(r => ({
            label: r.label,
            value: r[targetMetric] !== undefined ? r[targetMetric] : r.value,
            forecast: false
          }));
          chartData = [...hist, ...engineResults.forecastPoints];
        } else if (plan.outliers && engineResults.outlierPoints.length > 0) {
          chartData = engineResults.outlierPoints;
        } else {
          chartData = engineResults.results.map(r => ({
            label: r.label,
            value: r[targetMetric] !== undefined ? r[targetMetric] : r.value
          }));
        }

        finalGraph = {
          type: plan.visualization,
          title: plan.forecast 
            ? `Generative Trend Forecast: ${targetMetric} over ${dbState.temporalCol}`
            : `${engineResults.operationType} of ${targetMetric} ${plan.dimension ? `by ${plan.dimension}` : ''}`,
          data: chartData
        };
      }
      
      resultPayload.graph = finalGraph;
    }

    return res.json({
      success: true,
      data: resultPayload
    });

  } catch (error) {
    console.error("[EXCEPTION] Error in query handler:", error);
    return res.status(500).json({
      success: false,
      error: `AI analytics failed: ${error.message}`
    });
  }
});

// Support Chat chatbot route with Gemini API integration
app.post('/api/support-chat', async (req, res) => {
  const { prompt } = req.body;
  console.log(`[SUPPORT CHAT] Received chat prompt: "${prompt}"`);
  if (!prompt) {
    console.warn("[SUPPORT CHAT] Missing prompt");
    return res.status(400).json({ detail: "Prompt is required." });
  }

  const activeKey = process.env.GEMINI_API_KEY;

  if (!activeKey || activeKey === "YOUR_GEMINI_API_KEY_HERE" || activeKey.startsWith("YOUR_")) {
    console.log("[SUPPORT CHAT] Gemini API Key is not configured. Returning fallback local response.");
    return res.json({
      text: "Hi! I am the Rabbit Support chatbot assistant. To enable real-time AI responses, please configure your Gemini API Key in the backend `.env` file (`backend/.env`).\n\nIn the meantime, feel free to ask me general questions about the interface!"
    });
  }

  try {
    console.log(`[SUPPORT CHAT] Invoking Gemini API...`);
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${activeKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are a helpful customer support chatbot assistant inside the Talking Rabbitt business intelligence platform. Be concise and answer this question: ${prompt}`
          }]
        }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`[SUPPORT CHAT] Gemini API returned error status ${response.status}:`, JSON.stringify(errorData));
      return res.status(response.status).json({ detail: errorData.error?.message || "Error calling Gemini API." });
    }

    const data = await response.json();
    console.log(`[SUPPORT CHAT] Gemini API success response received.`);
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response.";
    return res.json({ text: replyText.trim() });

  } catch (error) {
    console.error(`[EXCEPTION] Error invoking Gemini API:`, error);
    return res.status(500).json({ detail: `Gemini API call failed: ${error.message}` });
  }
});

// Start Express server
app.listen(port, () => {
  console.log(`Talking Rabbitt backend listening at http://localhost:${port}`);
});
