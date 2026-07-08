export function executePlan(df, plan, dbState) {
  if (!df || df.length === 0) {
    return { data: [], kpis: [], summary: "No data available" };
  }

  const { temporalCol, numericCols, categoricalCols } = dbState;
  let workingDf = [...df];

  // 1. FILTERING
  const filters = plan.filters || [];
  filters.forEach(f => {
    const { col, op, val } = f;
    if (!col || val === undefined || val === null) return;
    
    workingDf = workingDf.filter(row => {
      const rowVal = row[col];
      if (rowVal === undefined || rowVal === null) return false;

      const strRowVal = String(rowVal).toLowerCase().trim();
      const strVal = String(val).toLowerCase().trim();

      switch (op) {
        case '==':
        case 'equals':
          return strRowVal === strVal;
        case '!=':
        case 'ne':
          return strRowVal !== strVal;
        case '>':
          return parseFloat(rowVal) > parseFloat(val);
        case '<':
          return parseFloat(rowVal) < parseFloat(val);
        case '>=':
          return parseFloat(rowVal) >= parseFloat(val);
        case '<=':
          return parseFloat(rowVal) <= parseFloat(val);
        case 'contains':
          return strRowVal.includes(strVal);
        case 'in':
          const valArray = Array.isArray(val) ? val.map(v => String(v).toLowerCase().trim()) : [strVal];
          return valArray.includes(strRowVal);
        default:
          return true;
      }
    });
  });

  // 2. TEMPORAL BUCKETING HELPER
  const formatTimeBucket = (dateStr, bucketType) => {
    if (!dateStr) return 'Unknown';
    const parsed = Date.parse(dateStr);
    if (isNaN(parsed)) {
      // If it is already a quarter or month name, return as is
      return String(dateStr);
    }
    const d = new Date(parsed);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    
    switch (bucketType) {
      case 'year':
        return `${y}`;
      case 'quarter':
        const q = Math.floor(d.getMonth() / 3) + 1;
        return `${y}-Q${q}`;
      case 'month':
        return `${y}-${m}`;
      case 'week':
        // Simple week of year calculation
        const start = new Date(y, 0, 1);
        const diff = d.getTime() - start.getTime();
        const oneDay = 1000 * 60 * 60 * 24;
        const dayOfYear = Math.floor(diff / oneDay);
        const w = Math.ceil((dayOfYear + start.getDay() + 1) / 7);
        return `${y}-W${String(w).padStart(2, '0')}`;
      case 'day':
      default:
        return `${y}-${m}-${String(d.getDate()).padStart(2, '0')}`;
    }
  };

  // 3. GROUPING & AGGREGATION
  const dimension = plan.dimension || null;
  const metrics = plan.metrics || (numericCols.length > 0 ? [numericCols[0]] : []);
  const operations = plan.operations || metrics.map(() => 'SUM');

  let results = [];

  const aggregateList = (vals, op) => {
    const numericVals = vals.map(v => parseFloat(v)).filter(v => !isNaN(v));
    if (numericVals.length === 0) return 0;

    switch (op.toUpperCase()) {
      case 'SUM':
        return numericVals.reduce((a, b) => a + b, 0);
      case 'AVG':
      case 'MEAN':
        return numericVals.reduce((a, b) => a + b, 0) / numericVals.length;
      case 'MIN':
        return Math.min(...numericVals);
      case 'MAX':
        return Math.max(...numericVals);
      case 'COUNT':
        return vals.length;
      case 'DISTINCT_COUNT':
        return new Set(vals).size;
      case 'MEDIAN':
        const sorted = [...numericVals].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      default:
        return numericVals.reduce((a, b) => a + b, 0);
    }
  };

  if (dimension) {
    const grouped = {};
    const isTemporalDim = (dimension === temporalCol);

    workingDf.forEach(row => {
      let key = row[dimension];
      if (isTemporalDim && plan.timeBucket) {
        key = formatTimeBucket(key, plan.timeBucket);
      }
      key = key !== undefined && key !== null && key !== '' ? String(key) : 'Other';

      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(row);
    });

    Object.entries(grouped).forEach(([label, rowsInGroup]) => {
      const resultItem = { label };
      metrics.forEach((metric, index) => {
        const op = operations[index] || operations[0] || 'SUM';
        const vals = rowsInGroup.map(r => r[metric]);
        resultItem[metric] = aggregateList(vals, op);
      });
      // Store a default value field for single-metric visualizer convenience
      if (metrics.length > 0) {
        resultItem.value = resultItem[metrics[0]];
      }
      results.push(resultItem);
    });

    // Chronological sorting if grouping by dates/temporal dimension
    if (isTemporalDim) {
      results.sort((a, b) => {
        const da = Date.parse(a.label);
        const db = Date.parse(b.label);
        return !isNaN(da) && !isNaN(db) ? da - db : a.label.localeCompare(b.label);
      });
    }

  } else {
    // Global summary grouping
    const resultItem = { label: 'Total summary' };
    metrics.forEach((metric, index) => {
      const op = operations[index] || operations[0] || 'SUM';
      const vals = workingDf.map(r => r[metric]);
      resultItem[metric] = aggregateList(vals, op);
    });
    if (metrics.length > 0) {
      resultItem.value = resultItem[metrics[0]];
    }
    results.push(resultItem);
  }

  // 4. SORTING & LIMITS (on grouped aggregates)
  if (plan.sort && results.length > 0) {
    const sortCol = plan.sort.col || metrics[0];
    const sortDir = plan.sort.dir || 'DESC';
    results.sort((a, b) => {
      const valA = a[sortCol] !== undefined ? a[sortCol] : a.value;
      const valB = b[sortCol] !== undefined ? b[sortCol] : b.value;
      
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDir === 'DESC' ? valB - valA : valA - valB;
      }
      return sortDir === 'DESC' 
        ? String(valB).localeCompare(String(valA)) 
        : String(valA).localeCompare(String(valB));
    });
  }

  if (plan.limit && results.length > 0) {
    results = results.slice(0, plan.limit);
  }

  // 5. REGRESSION TREND FORECASTING
  const forecastPoints = [];
  if (plan.forecast && temporalCol && metrics.length > 0) {
    const targetMetric = metrics[0];
    
    // Sort chronology for forecasting
    const timeGrouped = {};
    workingDf.forEach(row => {
      const time = formatTimeBucket(row[temporalCol], plan.timeBucket || 'month');
      const val = parseFloat(row[targetMetric]) || 0;
      timeGrouped[time] = (timeGrouped[time] || 0) + val;
    });

    const chronLabels = Object.keys(timeGrouped).sort((a, b) => {
      const da = Date.parse(a);
      const db = Date.parse(b);
      return !isNaN(da) && !isNaN(db) ? da - db : a.localeCompare(b);
    });

    const historical = chronLabels.map(label => ({
      label,
      value: Math.round(timeGrouped[label] * 100) / 100,
      forecast: false
    }));

    if (historical.length >= 2) {
      const y = historical.map(h => h.value);
      const x = y.map((_, i) => i);
      const n = x.length;
      
      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
      for (let i = 0; i < n; i++) {
        sumX += x[i];
        sumY += y[i];
        sumXY += x[i] * y[i];
        sumXX += x[i] * x[i];
      }
      const denom = (n * sumXX) - (sumX * sumX);
      const m = denom === 0 ? 0 : ((n * sumXY) - (sumX * sumY)) / denom;
      const c = (sumY - (m * sumX)) / n;

      for (let step = 1; step <= 3; step++) {
        const predX = n + step - 1;
        let predY = m * predX + c;
        if (predY < 0) predY = 0;
        
        forecastPoints.push({
          label: `P+${step} (Forecast)`,
          value: Math.round(predY * 100) / 100,
          forecast: true
        });
      }
    }
  }

  // 6. OUTLIERS SCAN
  let outlierPoints = [];
  if (plan.outliers && metrics.length > 0) {
    const targetMetric = metrics[0];
    const vals = workingDf.map(r => parseFloat(r[targetMetric])).filter(v => !isNaN(v));
    if (vals.length >= 4) {
      const sorted = [...vals].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const iqr = q3 - q1;
      const lower = q1 - 1.5 * iqr;
      const upper = q3 + 1.5 * iqr;
      
      outlierPoints = workingDf
        .filter(row => {
          const val = parseFloat(row[targetMetric]);
          return !isNaN(val) && (val < lower || val > upper);
        })
        .map(row => ({
          label: dimension ? String(row[dimension] || 'Anomaly') : 'Anomaly',
          value: parseFloat(row[targetMetric]),
          outlier: true
        }));
    }
  }

  return {
    results,
    forecastPoints,
    outlierPoints,
    filtersApplied: filters,
    operationType: operations[0] || 'SUM',
    targetMetric: metrics[0] || null,
    totalCount: workingDf.length
  };
}
