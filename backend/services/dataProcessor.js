export function processDataset(headers, rows, columnTypes) {
  const { temporalCol, numericCols, categoricalCols, textCols } = columnTypes;
  const totalRows = rows.length;
  const totalCols = headers.length;

  // 1. Data Quality Analysis
  // Count missing values per column
  const missingCounts = {};
  headers.forEach(col => {
    missingCounts[col] = rows.filter(r => {
      const v = r[col];
      return v === null || v === undefined || v === '';
    }).length;
  });

  const totalMissing = Object.values(missingCounts).reduce((a, b) => a + b, 0);

  // Count duplicate records
  const serializedRows = rows.map(r => JSON.stringify(r));
  const uniqueSerialized = new Set(serializedRows);
  const duplicateCount = totalRows - uniqueSerialized.size;

  // Unique values count per column
  const uniqueCounts = {};
  headers.forEach(col => {
    uniqueCounts[col] = new Set(rows.map(r => r[col]).filter(v => v !== null && v !== undefined && v !== '')).size;
  });

  // Outlier detection using IQR
  const outlierDetails = {};
  let totalOutliers = 0;
  numericCols.forEach(col => {
    const values = rows
      .map(r => parseFloat(r[col]))
      .filter(v => typeof v === 'number' && !isNaN(v));
    
    if (values.length >= 4) {
      const sorted = [...values].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const iqr = q3 - q1;
      const lower = q1 - 1.5 * iqr;
      const upper = q3 + 1.5 * iqr;
      
      const outliers = values.filter(v => v < lower || v > upper);
      outlierDetails[col] = {
        count: outliers.length,
        q1,
        q3,
        iqr,
        lowerBound: lower,
        upperBound: upper
      };
      totalOutliers += outliers.length;
    } else {
      outlierDetails[col] = { count: 0, q1: 0, q3: 0, iqr: 0, lowerBound: 0, upperBound: 0 };
    }
  });

  // Data Quality Score (0-100)
  // Penalize missing values, duplicates, and outliers
  const missingRate = totalRows > 0 ? (totalMissing / (totalRows * totalCols)) : 0;
  const duplicateRate = totalRows > 0 ? (duplicateCount / totalRows) : 0;
  const outlierRate = (totalRows > 0 && numericCols.length > 0) ? (totalOutliers / (totalRows * numericCols.length)) : 0;
  
  let qualityScore = 100 - (missingRate * 150) - (duplicateRate * 100) - (outlierRate * 50);
  qualityScore = Math.max(0, Math.min(100, Math.round(qualityScore)));

  // 2. Numerical Summary Statistics
  const summaryStats = {};
  numericCols.forEach(col => {
    const values = rows
      .map(r => parseFloat(r[col]))
      .filter(v => typeof v === 'number' && !isNaN(v));
    
    if (values.length > 0) {
      const sum = values.reduce((a, b) => a + b, 0);
      const mean = sum / values.length;
      
      // Median
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      
      // Std Dev
      let varianceSum = 0;
      values.forEach(v => {
        varianceSum += Math.pow(v - mean, 2);
      });
      const stdDev = values.length > 1 ? Math.sqrt(varianceSum / (values.length - 1)) : 0;

      summaryStats[col] = {
        sum,
        mean,
        median,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        stdDev,
        count: values.length
      };
    } else {
      summaryStats[col] = { sum: 0, mean: 0, median: 0, min: 0, max: 0, stdDev: 0, count: 0 };
    }
  });

  // 3. Correlation Matrix
  const correlationMatrix = {};
  numericCols.forEach(col1 => {
    correlationMatrix[col1] = {};
    numericCols.forEach(col2 => {
      if (col1 === col2) {
        correlationMatrix[col1][col2] = 1;
      } else {
        const pairs = rows
          .map(r => [parseFloat(r[col1]), parseFloat(r[col2])])
          .filter(([v1, v2]) => !isNaN(v1) && !isNaN(v2));
        
        if (pairs.length > 1) {
          const x = pairs.map(p => p[0]);
          const y = pairs.map(p => p[1]);
          const n = pairs.length;
          
          let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
          for (let i = 0; i < n; i++) {
            sumX += x[i];
            sumY += y[i];
            sumXY += x[i] * y[i];
            sumXX += x[i] * x[i];
            sumYY += y[i] * y[i];
          }
          const num = (n * sumXY) - (sumX * sumY);
          const den = Math.sqrt(((n * sumXX) - (sumX * sumX)) * ((n * sumYY) - (sumY * sumY)));
          correlationMatrix[col1][col2] = den === 0 ? 0 : Math.round((num / den) * 100) / 100;
        } else {
          correlationMatrix[col1][col2] = 0;
        }
      }
    });
  });

  // 4. Categorical Distributions (Top classes for UI rendering)
  const categoricalDistributions = {};
  categoricalCols.forEach(col => {
    const counts = {};
    rows.forEach(r => {
      const val = r[col] || 'Missing';
      counts[val] = (counts[val] || 0) + 1;
    });
    
    // Sort and take top 10
    const distribution = Object.entries(counts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
      
    categoricalDistributions[col] = distribution;
  });

  // 5. Growth Rates (MoM/YoY) if Temporal column exists
  let growthAnalysis = null;
  if (temporalCol && numericCols.length > 0) {
    const primaryNum = numericCols[0];
    const grouped = {};
    rows.forEach(r => {
      const time = r[temporalCol];
      const val = parseFloat(r[primaryNum]) || 0;
      grouped[time] = (grouped[time] || 0) + val;
    });

    // Chronological sort
    const timeLabels = Object.keys(grouped).sort((a, b) => {
      const da = Date.parse(a);
      const db = Date.parse(b);
      return !isNaN(da) && !isNaN(db) ? da - db : a.localeCompare(b);
    });

    const growthPoints = [];
    for (let i = 0; i < timeLabels.length; i++) {
      const curLabel = timeLabels[i];
      const curVal = grouped[curLabel];
      let momGrowth = 0;
      if (i > 0) {
        const prevVal = grouped[timeLabels[i - 1]];
        momGrowth = prevVal > 0 ? ((curVal - prevVal) / prevVal) * 100 : 0;
      }
      growthPoints.push({
        label: curLabel,
        value: curVal,
        growthPercentage: Math.round(momGrowth * 10) / 10
      });
    }

    // Overall metrics
    const initialVal = growthPoints[0]?.value || 0;
    const finalVal = growthPoints[growthPoints.length - 1]?.value || 0;
    const totalGrowthPct = initialVal > 0 ? ((finalVal - initialVal) / initialVal) * 100 : 0;

    growthAnalysis = {
      points: growthPoints,
      overallGrowthPercentage: Math.round(totalGrowthPct * 10) / 10
    };
  }

  return {
    totalRows,
    totalCols,
    missingCounts,
    totalMissing,
    duplicateCount,
    uniqueCounts,
    outliers: outlierDetails,
    totalOutliers,
    qualityScore,
    summaryStats,
    correlationMatrix,
    categoricalDistributions,
    growthAnalysis,
    forecastReadiness: (temporalCol !== null && numericCols.length > 0 && totalRows >= 5)
  };
}
