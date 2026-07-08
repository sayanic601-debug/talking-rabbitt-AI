import { executePlan } from './dataEngine.js';

export function queryLocal(prompt, dbState, analytics) {
  const promptLower = prompt.toLowerCase();
  const { df, filename, columns, temporalCol, numericCols, categoricalCols } = dbState;

  // Initialize Plan
  const plan = {
    dimension: null,
    metrics: [],
    operations: [],
    filters: [],
    sort: null,
    limit: 10,
    timeBucket: null,
    forecast: false,
    outliers: false,
    visualization: 'none'
  };

  // 1. DYNAMIC METRIC DETECTION
  // Match any numeric column name present in the prompt
  numericCols.forEach(col => {
    if (promptLower.includes(col.toLowerCase())) {
      plan.metrics.push(col);
    }
  });
  // Fallback to first numeric column if none matched
  if (plan.metrics.length === 0 && numericCols.length > 0) {
    plan.metrics.push(numericCols[0]);
  }

  // 2. DYNAMIC DIMENSION DETECTION
  // Match any categorical/temporal column name present in the prompt
  let matchedDim = null;
  categoricalCols.forEach(col => {
    if (promptLower.includes(col.toLowerCase())) {
      matchedDim = col;
    }
  });
  if (temporalCol && promptLower.includes(temporalCol.toLowerCase())) {
    matchedDim = temporalCol;
  }
  // Fallback to primary temporal or categorical if none specified
  if (!matchedDim) {
    if (temporalCol && ['forecast', 'predict', 'trend', 'future', 'time', 'monthly', 'quarterly', 'yearly', 'history'].some(kw => promptLower.includes(kw))) {
      matchedDim = temporalCol;
    } else if (categoricalCols.length > 0) {
      matchedDim = categoricalCols[0];
    }
  }
  plan.dimension = matchedDim;

  // 3. DYNAMIC OPERATION DETECTION
  const targetMetric = plan.metrics[0];
  let op = 'SUM';
  if (['average', 'avg', 'mean'].some(kw => promptLower.includes(kw))) {
    op = 'AVG';
  } else if (['minimum', 'min', 'lowest'].some(kw => promptLower.includes(kw))) {
    op = 'MIN';
  } else if (['maximum', 'max', 'highest'].some(kw => promptLower.includes(kw))) {
    op = 'MAX';
  } else if (['median'].some(kw => promptLower.includes(kw))) {
    op = 'MEDIAN';
  } else if (['distinct count', 'unique count'].some(kw => promptLower.includes(kw))) {
    op = 'DISTINCT_COUNT';
  } else if (['count', 'number of'].some(kw => promptLower.includes(kw))) {
    op = 'COUNT';
  }
  plan.operations = [op];

  // 4. DYNAMIC FILTER DETECTION (Scan unique values in categorical columns)
  categoricalCols.forEach(col => {
    // Get unique classes for this column
    const dist = analytics.categoricalDistributions[col] || [];
    dist.forEach(item => {
      const valStr = String(item.label).toLowerCase().trim();
      // If prompt contains this category value, add a filter
      if (promptLower.includes(` ${valStr} `) || promptLower.endsWith(` ${valStr}`) || promptLower.startsWith(`${valStr} `) || promptLower === valStr) {
        plan.filters.push({
          col,
          op: '==',
          val: item.label
        });
      }
    });
  });

  // 5. SORT & LIMITS
  plan.sort = { col: targetMetric, dir: 'DESC' };
  if (promptLower.includes('bottom') || promptLower.includes('lowest') || promptLower.includes('worst')) {
    plan.sort.dir = 'ASC';
  }
  
  // Detect top/bottom limits (e.g. "top 5", "worst 3")
  const limitMatch = promptLower.match(/(?:top|bottom|best|worst)\s+(\d+)/);
  if (limitMatch && limitMatch[1]) {
    plan.limit = parseInt(limitMatch[1]);
  }

  // 6. FORECAST & OUTLIER INDICATORS
  if (['forecast', 'predict', 'trend', 'future', 'projection'].some(kw => promptLower.includes(kw))) {
    plan.forecast = true;
    plan.visualization = 'line';
    plan.timeBucket = 'month'; // default
    if (promptLower.includes('quarter')) plan.timeBucket = 'quarter';
    if (promptLower.includes('year')) plan.timeBucket = 'year';
    if (promptLower.includes('day')) plan.timeBucket = 'day';
  }

  if (['anomaly', 'anomalies', 'outlier', 'outliers', 'skew', 'fraud'].some(kw => promptLower.includes(kw))) {
    plan.outliers = true;
  }

  // Choose chart type
  if (plan.visualization === 'none' || !plan.visualization) {
    if (plan.dimension === temporalCol) {
      plan.visualization = 'line';
    } else if (plan.dimension) {
      if (promptLower.includes('pie') || promptLower.includes('donut') || promptLower.includes('share') || promptLower.includes('proportion')) {
        plan.visualization = 'donut';
      } else {
        plan.visualization = 'bar';
      }
    }
  }

  // 7. EXECUTE PLAN
  console.log(`[LOCAL ANALYZER] Dynamic plan generated:`, JSON.stringify(plan));
  const engineResults = executePlan(df, plan, dbState);
  console.log(`[LOCAL ANALYZER] Engine results computed. Records returned: ${engineResults.results.length}`);

  // 8. FORMAT LOCAL RESPONSE
  const formattedResults = engineResults.results.map(r => ({
    label: r.label,
    value: r[targetMetric] !== undefined ? r[targetMetric] : r.value
  }));

  const response = {
    text: '',
    kpis: [],
    graph: {
      type: plan.visualization,
      title: `${op} of ${targetMetric} ${plan.dimension ? `grouped by ${plan.dimension}` : ''}`,
      data: formattedResults
    },
    nextQuestions: [
      `Show outliers in ${targetMetric}`,
      `Forecast ${targetMetric} trend`,
      `Verify correlation matrix`
    ]
  };

  const fVal = (val) => (typeof val === 'number' ? (val % 1 === 0 ? val.toLocaleString() : val.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })) : String(val));

  // Build KPIs and written text narrative based on operation
  if (plan.forecast && engineResults.forecastPoints.length > 0) {
    const histPoints = engineResults.results.map(r => ({
      label: r.label,
      value: r[targetMetric] !== undefined ? r[targetMetric] : r.value,
      forecast: false
    }));
    const forePoints = engineResults.forecastPoints;
    const combinedData = [...histPoints, ...forePoints];
    
    const lastVal = histPoints[histPoints.length - 1]?.value || 0;
    const finalFore = forePoints[forePoints.length - 1]?.value || 0;
    const change = lastVal > 0 ? Math.round(((finalFore - lastVal) / lastVal) * 1000) / 10 : 0;

    response.graph.data = combinedData;
    response.graph.type = 'line';
    response.graph.title = `Generative Trend Forecast: ${targetMetric} over ${temporalCol}`;

    response.kpis = [
      { label: `Historical ${targetMetric} Sum`, value: fVal(histPoints.reduce((a, b) => a + b.value, 0)), trend: 'up', change: 'Total cumulative actuals' },
      { label: `Projected Final Value`, value: fVal(finalFore), trend: change >= 0 ? 'up' : 'down', change: `${change >= 0 ? '+' : ''}${change}% corridor shift` }
    ];

    response.text = `### Executive Summary: Chronological Forecast
A regression-based time-series forecasting model was fit over **${histPoints.length} chronological periods** of historical data for \`${targetMetric}\` grouped by \`${temporalCol}\`.

**Key Findings:**
- The trend projects an **${change >= 0 ? 'upward growth' : 'expected contraction'} corridor** over the subsequent 3 periods.
- The final projected value is expected to reach **${fVal(finalFore)}** (representing a **${change >= 0 ? '+' : ''}${change}%** change from the last historical record of **${fVal(lastVal)}**).

**Business Impact:**
Staffing resources and inventory capacities should be adjusted dynamically to align with this forecasted corridor.`;
  }
  else if (plan.outliers && engineResults.outlierPoints.length > 0) {
    response.graph.data = engineResults.outlierPoints;
    response.graph.type = 'bar';
    response.graph.title = `Outlier Analysis: ${targetMetric} Anomalies`;

    response.kpis = [
      { label: `Total Outliers`, value: engineResults.outlierPoints.length.toLocaleString(), trend: 'down', change: `Using IQR threshold bounds` }
    ];

    const outlierList = engineResults.outlierPoints.slice(0, 5).map(o => `- Cohort **${o.label}**: value **${fVal(o.value)}**`).join('\n');

    response.text = `### Executive Summary: Outlier & Anomaly Audit
An IQR (Interquartile Range) scan was run on \`${targetMetric}\` to flag transaction anomalies lying more than 1.5 times the IQR below Q1 or above Q3.

**Key Findings:**
- Detected **${engineResults.outlierPoints.length} outlier data records**.
- Top anomalies:
${outlierList}

**Business Impact:**
Verify if these values represent legitimate high-value transactions or data recording discrepancies.`;
  }
  else {
    // Standard group by or filter report
    const totalSum = formattedResults.reduce((a, b) => a + b.value, 0);
    const maxItem = formattedResults.sort((a, b) => b.value - a.value)[0];
    const minItem = formattedResults[formattedResults.length - 1];

    response.kpis = [
      { label: `Aggregated ${targetMetric}`, value: fVal(totalSum), trend: 'up', change: `${op} operation total` }
    ];
    if (maxItem) {
      response.kpis.push({ label: `Top ${plan.dimension || 'Cohort'}`, value: maxItem.label, trend: 'up', change: `${fVal(maxItem.value)} value` });
    }

    const filterContext = plan.filters.map(f => `where **${f.col} = "${f.val}"**`).join(' and ');
    const desc = plan.dimension 
      ? `grouped by **${plan.dimension}**${filterContext ? ` (${filterContext})` : ''}` 
      : `${filterContext ? `filtered for ${filterContext}` : ''}`;

    response.text = `### Executive Summary: Dynamic Data Profiling
Processed mathematical aggregates for \`${targetMetric}\` using a **${op}** operation, ${desc}.

**Key Findings:**
- Total aggregated dataset volume: **${fVal(totalSum)}**.
${maxItem ? `- Highest performing category: **${maxItem.label}** with a value of **${fVal(maxItem.value)}**.` : ''}
${minItem && minItem !== maxItem ? `- Lowest performing category: **${minItem.label}** with a value of **${fVal(minItem.value)}**.` : ''}

**Recommended Actions:**
- Investigate segment variances between top and bottom contributors to optimize operational budget.`;
  }

  return response;
}
