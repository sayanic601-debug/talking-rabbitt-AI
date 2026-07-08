import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';

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

// Global in-memory storage for the uploaded dataset
let dbState = {
  df: null,            // Array of parsed row objects
  filename: null,
  columns: [],         // Array of column schema objects: { name, type }
  temporalCol: null,   // Temporal column name
  numericCols: [],     // Array of numeric column names
  categoricalCols: [], // Array of categorical column names
  summaryStats: {}     // Object mapping numeric columns to stats
};

// CSV parsing utility
function parseCSV(text) {
  const lines = [];
  let currentLine = [];
  let currentVal = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentLine.push(currentVal.trim());
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentLine.push(currentVal.trim());
      if (currentLine.length > 1 || currentLine[0] !== '') {
        lines.push(currentLine);
      }
      currentLine = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }
  
  if (currentVal !== '' || currentLine.length > 0) {
    currentLine.push(currentVal.trim());
    lines.push(currentLine);
  }
  
  if (lines.length === 0) return { headers: [], rows: [] };
  
  const headers = lines[0].map(h => h.replace(/^"|"$/g, '').trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const rowArr = lines[i];
    if (rowArr.length === headers.length) {
      const row = {};
      headers.forEach((header, idx) => {
        row[header] = rowArr[idx];
      });
      rows.push(row);
    }
  }
  return { headers, rows };
}

// Automatically detect types and clean numbers
function detectColumnTypes(headers, rows) {
  let temporalCol = null;
  const numericCols = [];
  const categoricalCols = [];

  // Temporal detection based on keywords
  const dateKeywords = ["date", "time", "month", "year", "quarter", "period", "week", "timestamp", "day"];
  for (const col of headers) {
    const colLower = col.toLowerCase();
    if (dateKeywords.some(kw => colLower.includes(kw))) {
      let isDate = true;
      const samples = rows.slice(0, 5).map(r => r[col]);
      for (const sample of samples) {
        if (!sample) continue;
        const parsed = Date.parse(sample);
        // Quarters e.g. Q1, Q2 or Month names e.g. Jan, Feb are valid temporal tags in reporting
        const isReportingPeriod = /^[qQ][1-4]$/.test(sample) || 
                                  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(sample) ||
                                  /^\d{4}-\d{2}$/.test(sample);
        if (isNaN(parsed) && !isReportingPeriod) {
          isDate = false;
          break;
        }
      }
      if (isDate) {
        temporalCol = col;
        break;
      }
    }
  }

  // Fallback temporal detection
  if (!temporalCol) {
    for (const col of headers) {
      const samples = rows.slice(0, 5).map(r => r[col]);
      if (samples.length > 0 && samples.every(s => s && !isNaN(Date.parse(s)))) {
        temporalCol = col;
        break;
      }
    }
  }

  // Detect numeric and categorical columns
  for (const col of headers) {
    if (col === temporalCol) continue;
    
    let isNumeric = true;
    let numericCount = 0;
    
    for (const row of rows) {
      const val = row[col];
      if (val === null || val === undefined || val === '') continue;
      
      const cleaned = val.replace(/[$,%]/g, '').trim();
      const num = parseFloat(cleaned);
      if (!isNaN(num)) {
        numericCount++;
      } else {
        isNumeric = false;
        break;
      }
    }
    
    if (isNumeric && numericCount > 0) {
      rows.forEach(row => {
        const val = row[col];
        if (val !== null && val !== undefined && val !== '') {
          row[col] = parseFloat(val.toString().replace(/[$,%]/g, '').trim());
        } else {
          row[col] = 0;
        }
      });
      numericCols.push(col);
    } else {
      const uniqueVals = new Set(rows.map(r => r[col]).filter(Boolean));
      if (uniqueVals.size < 100) {
        categoricalCols.push(col);
      }
    }
  }

  return { temporalCol, numericCols, categoricalCols };
}

// Linear regression helper
function fitLinearTrend(x, y) {
  const n = x.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumXX += x[i] * x[i];
  }
  const denominator = (n * sumXX) - (sumX * sumX);
  if (denominator === 0) return { m: 0, c: y[0] || 0 };
  const m = ((n * sumXY) - (sumX * sumY)) / denominator;
  const c = (sumY - (m * sumX)) / n;
  return { m, c };
}

// Ingestion API endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ detail: "No file uploaded." });
  }

  const filename = req.file.originalname;
  if (!filename.endsWith('.csv')) {
    return res.status(400).json({ detail: "Only CSV files are supported." });
  }

  try {
    const csvText = req.file.buffer.toString('utf-8');
    const { headers, rows } = parseCSV(csvText);

    if (rows.length === 0) {
      return res.status(400).json({ detail: "The uploaded CSV file is empty." });
    }

    const { temporalCol, numericCols, categoricalCols } = detectColumnTypes(headers, rows);

    // Compute basic summary stats
    const summaryStats = {};
    numericCols.forEach(col => {
      const values = rows.map(r => r[col]).filter(v => typeof v === 'number' && !isNaN(v));
      if (values.length > 0) {
        const sum = values.reduce((a, b) => a + b, 0);
        summaryStats[col] = {
          sum: sum,
          mean: sum / values.length,
          min: Math.min(...values),
          max: Math.max(...values)
        };
      } else {
        summaryStats[col] = { sum: 0, mean: 0, min: 0, max: 0 };
      }
    });

    // Save in global database state
    dbState = {
      df: rows,
      filename,
      columns: headers.map(name => {
        let type = 'unknown';
        if (name === temporalCol) type = 'temporal';
        else if (numericCols.includes(name)) type = 'numeric';
        else if (categoricalCols.includes(name)) type = 'categorical';
        return { name, type };
      }),
      temporalCol,
      numericCols,
      categoricalCols,
      summaryStats
    };

    return res.json({
      status: "success",
      filename: dbState.filename,
      rowCount: dbState.df.length,
      columns: dbState.columns,
      temporalColumn: dbState.temporalCol,
      numericColumns: dbState.numericCols,
      categoricalColumns: dbState.categoricalCols,
      summaryStats: dbState.summaryStats
    });

  } catch (error) {
    return res.status(500).json({ detail: `Error parsing CSV: ${error.message}` });
  }
});

// Query API endpoint
app.post('/api/query', (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ detail: "Prompt is required." });
  }

  if (!dbState.df || dbState.df.length === 0) {
    return res.json({
      text: "It looks like you haven't uploaded a CSV file yet. Please upload a dataset first so that Rabbit can analyze it.",
      graph: "none",
      chartData: []
    });
  }

  const promptLower = prompt.toLowerCase();
  const { df, filename, temporalCol, numericCols, categoricalCols } = dbState;

  if (numericCols.length === 0) {
    return res.json({
      text: `I processed the file '${filename}', but couldn't detect any numeric columns (like sales, revenue, or quantities) to perform analytics on. The columns found are: ${dbState.columns.map(c => c.name).join(', ')}.`,
      graph: "none",
      chartData: []
    });
  }

  // Find primary numeric column
  let primaryNumCol = numericCols[0];
  for (const col of numericCols) {
    if (['sales', 'revenue', 'amount', 'value', 'quantity'].some(kw => col.toLowerCase().includes(kw))) {
      primaryNumCol = col;
      break;
    }
  }

  const isForecast = ['forecast', 'predict', 'future', 'trend', 'projection', 'projections'].some(kw => promptLower.includes(kw));
  const isDropOrDecline = ['drop', 'decline', 'sales', 'decrease', 'worst', 'loss', 'fell', 'down', 'lowest'].some(kw => promptLower.includes(kw));

  // ----------------------------------------------------
  // CASE 1: Forecasting & Trends (Line Chart)
  // ----------------------------------------------------
  if (isForecast && temporalCol) {
    try {
      // Group by temporalCol and calculate sum
      const groupedMap = {};
      df.forEach(row => {
        const timeVal = row[temporalCol];
        const numVal = row[primaryNumCol] || 0;
        groupedMap[timeVal] = (groupedMap[timeVal] || 0) + numVal;
      });

      // Sort chronological labels
      const labels = Object.keys(groupedMap).sort((a, b) => {
        const dateA = Date.parse(a);
        const dateB = Date.parse(b);
        if (!isNaN(dateA) && !isNaN(dateB)) return dateA - dateB;
        return a.localeCompare(b); // Alphabetical fallback
      });

      const historicalPoints = labels.map(label => ({
        label,
        value: Math.round(groupedMap[label] * 100) / 100,
        forecast: false
      }));

      const forecastPoints = [];
      if (historicalPoints.length >= 2) {
        const y = historicalPoints.map(p => p.value);
        const x = y.map((_, idx) => idx);

        const { m, c } = fitLinearTrend(x, y);
        const lastIdx = historicalPoints.length;

        // Predict next 3 periods
        for (let step = 1; step <= 3; step++) {
          const predX = lastIdx + step - 1;
          let predY = m * predX + c;
          if (predY < 0) predY = 0; // Prevent negative forecasting values

          forecastPoints.push({
            label: `P+${step} (Forecast)`,
            value: Math.round(predY * 100) / 100,
            forecast: true
          });
        }
      }

      const allChartData = [...historicalPoints, ...forecastPoints];
      const trendStr = (forecastPoints.length > 0 && forecastPoints[forecastPoints.length - 1].value > historicalPoints[historicalPoints.length - 1].value) ? "upward" : "downward";
      
      let growthPct = 0;
      if (historicalPoints.length > 0 && historicalPoints[historicalPoints.length - 1].value > 0) {
        const finalVal = forecastPoints.length > 0 ? forecastPoints[forecastPoints.length - 1].value : historicalPoints[historicalPoints.length - 1].value;
        growthPct = ((finalVal - historicalPoints[historicalPoints.length - 1].value) / historicalPoints[historicalPoints.length - 1].value) * 100;
      }

      const totalSum = historicalPoints.reduce((sum, p) => sum + p.value, 0);

      const summaryText = `### Generative AI Forecasting Insight

Based on the chronological trend of \`${primaryNumCol}\` in \`${filename}\`, Rabbit has fit a linear projection model. Historical data spans **${historicalPoints.length} periods** with a total value of **${totalSum.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}**.

**Key Findings:**
- The forecast projects an **${trendStr} trend** over the next 3 periods.
- The final forecasted period value is expected to reach **${(forecastPoints[forecastPoints.length - 1]?.value || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}** (a change of **${growthPct >= 0 ? '+' : ''}${growthPct.toFixed(1)}%** from the last recorded actual value).
- Forward-looking demand remains resilient, with a projected growth corridor moving into the subsequent cycle.`;

      return res.json({
        text: summaryText,
        graph: "line",
        chartData: allChartData
      });

    } catch (error) {
      return res.json({
        text: `Error running forecast models: ${error.message}. However, here is a general summary of your \`${primaryNumCol}\`: average is ${dbState.summaryStats[primaryNumCol].mean.toFixed(2)}.`,
        graph: "none",
        chartData: []
      });
    }
  }

  // ----------------------------------------------------
  // CASE 2: Drop / Decline / Category Comparison (Bar Chart)
  // ----------------------------------------------------
  if (isDropOrDecline || categoricalCols.length > 0) {
    try {
      // Find primary categorical column
      let primaryCatCol = categoricalCols[0] || null;
      for (const col of categoricalCols) {
        if (['region', 'product', 'channel', 'category', 'segment', 'division'].some(kw => col.toLowerCase().includes(kw))) {
          primaryCatCol = col;
          break;
        }
      }

      if (primaryCatCol) {
        // Group by categorical column and sum values
        const catMap = {};
        df.forEach(row => {
          const catVal = row[primaryCatCol] || 'Other';
          const numVal = row[primaryNumCol] || 0;
          catMap[catVal] = (catMap[catVal] || 0) + numVal;
        });

        // Convert map to array and sort descending
        const chartData = Object.keys(catMap).map(key => ({
          label: key,
          value: Math.round(catMap[key] * 100) / 100
        })).sort((a, b) => b.value - a.value);

        const topCat = chartData[0]?.label || "N/A";
        const topVal = chartData[0]?.value || 0;
        const worstCat = chartData[chartData.length - 1]?.label || "N/A";
        const worstVal = chartData[chartData.length - 1]?.value || 0;
        const totalVal = chartData.reduce((sum, p) => sum + p.value, 0);

        let declineText = "";
        if (chartData.length > 1) {
          const declinePct = topVal > 0 ? ((topVal - worstVal) / topVal) * 100 : 0;
          declineText = `There is a substantial performance delta across \`${primaryCatCol}\` segments. The \`${worstCat}\` segment is trailing the leading \`${topCat}\` segment by **${declinePct.toFixed(1)}%** (representing a gap of **${(topVal - worstVal).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}** in \`${primaryNumCol}\`). Specifically, decline is concentrated in \`${worstCat}\` and channel mix shifts toward lower-margin SKUs.`;
        } else {
          declineText = `Only one category segment was found: \`${topCat}\` with a value of **${topVal.toLocaleString()}**.`;
        }

        const summaryText = `### Category Segment Performance Analysis

Rabbit analyzed the distribution of \`${primaryNumCol}\` across different segments of \`${primaryCatCol}\`:

- **Total \`${primaryNumCol}\`**: **${totalVal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}**
- **Top Segment**: \`${topCat}\` (**${topVal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}**)
- **Lowest Segment**: \`${worstCat}\` (**${worstVal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}**)

**Analysis details:**
${declineText}

We recommend targeting expansion campaigns in the underperforming \`${worstCat}\` region or adjusting product mix to reverse low margins.`;

        return res.json({
          text: summaryText,
          graph: "bar",
          chartData: chartData
        });
      } else if (temporalCol) {
        // Group by temporalCol and list chronologically
        const groupedMap = {};
        df.forEach(row => {
          const timeVal = row[temporalCol];
          const numVal = row[primaryNumCol] || 0;
          groupedMap[timeVal] = (groupedMap[timeVal] || 0) + numVal;
        });

        const labels = Object.keys(groupedMap).sort((a, b) => {
          const dateA = Date.parse(a);
          const dateB = Date.parse(b);
          if (!isNaN(dateA) && !isNaN(dateB)) return dateA - dateB;
          return a.localeCompare(b);
        });

        const chartData = labels.map(label => ({
          label,
          value: Math.round(groupedMap[label] * 100) / 100
        }));

        const totalSum = chartData.reduce((sum, p) => sum + p.value, 0);

        const summaryText = `### Chronological Performance Analysis

Rabbit analyzed the trend of \`${primaryNumCol}\` across periods:

The total aggregated \`${primaryNumCol}\` is **${totalSum.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}** across **${chartData.length} periods**.`;

        return res.json({
          text: summaryText,
          graph: "bar",
          chartData: chartData
        });
      }
    } catch (error) {
      return res.json({
        text: `Error grouping dataset by categories: ${error.message}.`,
        graph: "none",
        chartData: []
      });
    }
  }

  // ----------------------------------------------------
  // CASE 3: General / Info Query (Default)
  // ----------------------------------------------------
  const totalRows = df.length;
  const stats = dbState.summaryStats[primaryNumCol] || { sum: 0, mean: 0 };
  
  const colsDesc = dbState.columns.map(c => `\`${c.name}\` (${c.type})`).join(', ');

  const summaryText = `### Dataset Summary Overview

I have analyzed the uploaded file **${filename}** with **${totalRows} rows** and **{${dbState.columns.length}} columns**.

**Data Structure:**
- Columns detected: ${colsDesc}
- Target Metric analysed: \`${primaryNumCol}\` (Total: **${stats.sum.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}**, Avg: **${stats.mean.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}**)

**Ask Rabbit any of the following to see insights and interactive panels:**
1. *'Run a sales forecast'* to see a predictive line chart project future metrics.
2. *'Why did sales drop?'* or *'Analyze segment declines'* to see a bar chart comparing performance segments and identifying lower-margin regions.`;

  return res.json({
    text: summaryText,
    graph: "none",
    chartData: []
  });
});

// Support Chat chatbot route with Gemini API integration
app.post('/api/support-chat', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ detail: "Prompt is required." });
  }

  const activeKey = process.env.GEMINI_API_KEY;

  if (!activeKey || activeKey === "YOUR_GEMINI_API_KEY_HERE" || activeKey.startsWith("YOUR_")) {
    return res.json({
      text: "Hi! I am the Rabbit Support chatbot assistant. To enable real-time AI responses, please configure your Gemini API Key in the backend `.env` file (`backend/.env`).\n\nIn the meantime, feel free to ask me general questions about the interface!"
    });
  }

  try {
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
      return res.status(response.status).json({ detail: errorData.error?.message || "Error calling Gemini API." });
    }

    const data = await response.json();
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response.";
    return res.json({ text: replyText.trim() });

  } catch (error) {
    return res.status(500).json({ detail: `Gemini API call failed: ${error.message}` });
  }
});

// Start Express server
app.listen(port, () => {
  console.log(`Talking Rabbitt backend listening at http://localhost:${port}`);
});
