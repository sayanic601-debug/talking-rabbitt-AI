export function parseCSV(text) {
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
      if (currentLine.length > 1 || (currentLine.length === 1 && currentLine[0] !== '')) {
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

export function detectColumnTypes(headers, rows) {
  let temporalCol = null;
  const numericCols = [];
  const categoricalCols = [];
  const textCols = [];
  const booleanCols = [];
  const primaryKeyCandidates = [];
  const relationships = [];
  const totalRows = rows.length;

  // 1. Temporal Detection
  const dateKeywords = ["date", "time", "month", "year", "quarter", "period", "week", "timestamp", "day"];
  for (const col of headers) {
    const colLower = col.toLowerCase();
    if (dateKeywords.some(kw => colLower.includes(kw))) {
      let isDate = true;
      const samples = rows.slice(0, 10).map(r => r[col]);
      for (const sample of samples) {
        if (sample === null || sample === undefined || sample === '') continue;
        const parsed = Date.parse(sample);
        const isReportingPeriod = /^[qQ][1-4]$/.test(sample) || 
                                  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(sample) ||
                                  /^\d{4}-\d{2}$/.test(sample) ||
                                  /^\d{4}-[qQ][1-4]$/.test(sample) ||
                                  /^[qQ][1-4]-\d{4}$/.test(sample);
        if (isNaN(parsed) && !isReportingPeriod) {
          isDate = false;
          break;
        }
      }
      if (isDate && samples.some(s => s !== null && s !== undefined && s !== '')) {
        temporalCol = col;
        break;
      }
    }
  }

  // Fallback temporal detection
  if (!temporalCol) {
    for (const col of headers) {
      const samples = rows.slice(0, 10).map(r => r[col]);
      if (samples.length > 0 && samples.every(s => s && !/^\d+$/.test(s) && !isNaN(Date.parse(s)))) {
        temporalCol = col;
        break;
      }
    }
  }

  // 2. Identify Boolean, Numeric, Categorical, Text
  for (const col of headers) {
    if (col === temporalCol) continue;

    // Get all non-empty values
    const values = rows.map(r => r[col]).filter(v => v !== null && v !== undefined && v !== '');
    
    // Check if Boolean
    const booleanValues = new Set(['true', 'false', '0', '1', 'yes', 'no', 'y', 'n']);
    const uniqueVals = new Set(values.map(v => String(v).toLowerCase().trim()));
    
    let isBoolean = uniqueVals.size > 0 && [...uniqueVals].every(v => booleanValues.has(v));
    if (isBoolean) {
      booleanCols.push(col);
      categoricalCols.push(col); // A boolean is also categorical
      continue;
    }

    // Check if Numeric
    let isNumeric = true;
    let numericCount = 0;
    for (const val of values) {
      const cleaned = String(val).replace(/[$,%]/g, '').trim();
      const num = Number(cleaned);
      if (!isNaN(num)) {
        numericCount++;
      } else {
        isNumeric = false;
        break;
      }
    }

    if (isNumeric && numericCount > 0) {
      // Convert in-place to float for faster calculation later
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
      // Categorical vs Text based on cardinality
      const uniqueCount = new Set(values).size;
      if (uniqueCount < 100 || (totalRows > 0 && uniqueCount / totalRows < 0.05)) {
        categoricalCols.push(col);
      } else {
        textCols.push(col);
      }
    }
  }

  // 3. Primary Key Candidates
  for (const col of headers) {
    const values = rows.map(r => r[col]).filter(v => v !== null && v !== undefined && v !== '');
    const missingCount = totalRows - values.length;
    const uniqueCount = new Set(values).size;
    
    if (missingCount === 0 && uniqueCount === totalRows && !textCols.includes(col)) {
      primaryKeyCandidates.push(col);
    }
  }

  // 4. Relationships (Cardinality matching for 1-to-many relationships)
  const idCols = headers.filter(c => 
    c.toLowerCase().endsWith('id') || 
    c.toLowerCase().endsWith('code') || 
    categoricalCols.includes(c)
  );

  for (let i = 0; i < idCols.length; i++) {
    for (let j = 0; j < idCols.length; j++) {
      if (i === j) continue;
      const colA = idCols[i];
      const colB = idCols[j];

      // Check if for every value of B, there is exactly one value of A
      const bToAMap = {};
      let isOneToMany = true;
      for (const row of rows) {
        const valA = row[colA];
        const valB = row[colB];
        if (valA === undefined || valB === undefined) continue;
        
        if (bToAMap[valB] !== undefined && bToAMap[valB] !== valA) {
          isOneToMany = false;
          break;
        }
        bToAMap[valB] = valA;
      }

      if (isOneToMany && Object.keys(bToAMap).length > 0) {
        // If colA has fewer unique values than colB, then A is the parent (1) and B is the child (N)
        const uniqueA = new Set(rows.map(r => r[colA])).size;
        const uniqueB = new Set(rows.map(r => r[colB])).size;
        if (uniqueA < uniqueB) {
          relationships.push({
            parent: colA,
            child: colB,
            type: "1-to-many"
          });
        }
      }
    }
  }

  return { 
    temporalCol, 
    numericCols, 
    categoricalCols, 
    textCols, 
    booleanCols, 
    primaryKeyCandidates, 
    relationships 
  };
}
