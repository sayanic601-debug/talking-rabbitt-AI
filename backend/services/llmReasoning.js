let conversationHistory = [];

export function clearHistory() {
  conversationHistory = [];
}

export function getHistory() {
  return conversationHistory;
}

export function addHistory(role, text) {
  conversationHistory.push({ role, text });
  if (conversationHistory.length > 20) {
    conversationHistory.shift(); // Keep history size bounded
  }
}

async function callGemini(contents, systemInstructions, key) {
  const userPromptWithSystem = `System instructions: ${systemInstructions}\n\nUser Question/Input: ${JSON.stringify(contents)}\n(Provide the answer in valid JSON output as requested)`;
  
  const payload = [
    {
      role: 'user',
      parts: [{ text: userPromptWithSystem }]
    }
  ];

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: payload,
      generationConfig: {
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errMessage = errorData.error?.message || "Error calling Gemini API.";
    throw new Error(errMessage);
  }

  const responseData = await response.json();
  const rawText = responseData.candidates?.[0]?.content?.parts?.[0]?.text || "";
  
  let cleanJsonStr = rawText.trim();
  if (cleanJsonStr.startsWith("```json")) {
    cleanJsonStr = cleanJsonStr.substring(7);
  }
  if (cleanJsonStr.endsWith("```")) {
    cleanJsonStr = cleanJsonStr.substring(0, cleanJsonStr.length - 3);
  }
  return JSON.parse(cleanJsonStr.trim());
}

// PASS 1: Generate Execution Plan
export async function generateExecutionPlan(prompt, dbState, analytics) {
  const activeKey = process.env.GEMINI_API_KEY;
  if (!activeKey || activeKey === "YOUR_GEMINI_API_KEY_HERE" || activeKey.startsWith("YOUR_")) {
    throw new Error("Gemini API Key is not configured.");
  }

  const schemaStr = dbState.columns.map(c => `- ${c.name} (${c.type})`).join('\n');
  const statsStr = Object.entries(analytics.summaryStats || {})
    .map(([col, stats]) => `- ${col}: Sum=${stats.sum}, Mean=${stats.mean}, Min=${stats.min}, Max=${stats.max}`)
    .join('\n');

  const systemInstructions = `
You are "Rabbit", an expert Database Query Planner and BI Architect.
Your task is to analyze the user's natural language question and translate it into a structured, executable JSON database plan based on the schema and metadata provided.

DATASET SCHEMA:
- File Name: "${dbState.filename}"
- Total Rows: ${analytics.totalRows}
- Columns & Types:
${schemaStr}
- Primary Key Candidates: ${JSON.stringify(dbState.primaryKeyCandidates || [])}
- Relationships: ${JSON.stringify(dbState.relationships || [])}
- Numeric Statistics:
${statsStr}

CONVERSATION HISTORY:
${JSON.stringify(conversationHistory.slice(-4))}

INSTRUCTIONS:
1. Map the user's intent to columns in the schema. (e.g. "sales by month" -> dimension: date column, metrics: ["sales"], operations: ["SUM"], timeBucket: "month").
2. Match column names exactly. Case-sensitive.
3. Determine if the user wants Group By, Filter, Sort, aggregations, forecasting, or outlier scans.
4. Set "forecast": true if the user asks for forecast, trend projections, or future sales.
5. Set "outliers": true if the user asks for anomalies, outliers, or fraud scans.
6. Choose the best chart type in "visualization" based on the data shape:
   - "line" for time series trends / forecasts.
   - "area" for cumulative changes over time.
   - "bar" or "horizontalBar" for discrete category comparisons.
   - "pie" or "donut" for proportions / market shares.
   - "scatter" for comparing two numeric fields.
   - "heatmap" for correlation matrices.
   - "radar" for multi-dimensional profile mapping.
   - "funnel" for funnel analysis.
   - "waterfall" for walking from an initial value to a final value.
   - "none" if no chart is applicable.
7. Support conversation memory. If the user asks "only electronics", look at the history to see what metric and dimension they were query planning for (e.g. Sales by region) and apply a filter: { "col": "Category", "op": "==", "val": "Electronics" }.

YOUR RESPONSE MUST BE EXCLUSIVELY A VALID JSON OBJECT MATCHING THIS SCHEMA:
{
  "dimension": "ColumnName" or null,
  "metrics": ["ColumnName1", "ColumnName2"],
  "operations": ["SUM" | "AVG" | "MIN" | "MAX" | "COUNT" | "MEDIAN" | "DISTINCT_COUNT"],
  "filters": [
    { "col": "ColumnName", "op": "==" | "!=" | ">" | "<" | ">=" | "<=" | "contains" | "in", "val": "FilterValue" }
  ],
  "sort": { "col": "ColumnName", "dir": "DESC" | "ASC" } or null,
  "limit": 10 or null,
  "timeBucket": "year" | "quarter" | "month" | "day" or null,
  "forecast": true | false,
  "outliers": true | false,
  "visualization": "line" | "bar" | "horizontalBar" | "pie" | "donut" | "area" | "scatter" | "heatmap" | "radar" | "funnel" | "waterfall" | "none"
}
`;

  console.log(`[LLM PLANNER] Planning execution for query: "${prompt}"...`);
  const plan = await callGemini({ prompt }, systemInstructions, activeKey);
  console.log(`[LLM PLANNER SUCCESS] Plan generated:`, JSON.stringify(plan));
  return plan;
}

// PASS 2: Generate Written Insights & Business recommendations
export async function generateInsights(prompt, plan, computedData, dbState, analytics) {
  const activeKey = process.env.GEMINI_API_KEY;
  if (!activeKey || activeKey === "YOUR_GEMINI_API_KEY_HERE" || activeKey.startsWith("YOUR_")) {
    throw new Error("Gemini API Key is not configured.");
  }

  const schemaStr = dbState.columns.map(c => `- ${c.name} (${c.type})`).join('\n');

  const systemInstructions = `
You are "Rabbit", a world-class BI Consultant and Senior Strategy Advisor.
Your task is to write a high-impact natural language executive analysis report based on the mathematically exact results calculated on the dataset by our data engine.

USER ORIGINAL PROMPT: "${prompt}"
EXECUTION PLAN APPLIED: ${JSON.stringify(plan)}

SCHEMA METADATA:
- File Name: "${dbState.filename}"
- Columns & Types:
${schemaStr}

MATHEMATICALLY COMPUTED DATA (Aggregated results):
${JSON.stringify(computedData, null, 2)}

INSTRUCTIONS:
1. Synthesize the aggregated data into a professional executive-level commentary. Rely ONLY on the computed data provided.
2. Structure your reply in valid JSON format.
3. Formulate your written response in the "text" field. It must be written using professional Executive Tone and have:
   - ### Executive Summary
   - **Key Findings**
   - **Business Impact**
   - **Recommended Actions**
   - **Potential Risks & Opportunities**
4. Provide high-impact KPI Cards (up to 3) in the "kpis" array: { "label": "KPI Name", "value": "ValueString", "trend": "up" | "down", "change": "ContextString" }.
5. Suggest the next 3 logical questions the user should ask in the "nextQuestions" array.
6. Support conversational context. Remember the history of the conversation.

YOUR RESPONSE MUST BE EXCLUSIVELY A VALID JSON OBJECT MATCHING THIS SCHEMA:
{
  "text": "Your written markdown analysis containing Executive Summary, Key Findings, Business Impact, Recommended Actions, Risks & Opportunities.",
  "kpis": [
    { "label": "KPI Name", "value": "ValueString", "trend": "up" | "down", "change": "ContextString" }
  ],
  "nextQuestions": [
    "Logical next query 1?",
    "Logical next query 2?"
  ]
}
`;

  console.log(`[LLM INSIGHT GENERATOR] Compiling report for query...`);
  const insights = await callGemini({ prompt, plan, computedData }, systemInstructions, activeKey);
  
  // Update conversational history
  addHistory('user', prompt);
  addHistory('assistant', insights.text);
  
  console.log(`[LLM INSIGHT GENERATOR SUCCESS] Report generated.`);
  return insights;
}
