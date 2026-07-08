import { useState, useRef, useEffect } from 'react';

export type ChartType = 
  | 'line' 
  | 'bar' 
  | 'horizontalBar' 
  | 'pie' 
  | 'donut' 
  | 'area' 
  | 'scatter' 
  | 'heatmap' 
  | 'radar' 
  | 'funnel' 
  | 'waterfall' 
  | 'none';

interface DataPoint {
  label?: string;
  value?: number;
  x?: string | number;
  y?: string | number;
  forecast?: boolean;
}

interface DataVisualizerProps {
  type: ChartType;
  title: string;
  data: DataPoint[];
}

export default function DataVisualizer({ type, title, data }: DataVisualizerProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (type === 'none' || !data || data.length === 0) return null;

  // Filter data if any filter chip is active
  const filteredData = activeFilter 
    ? data.filter(d => d.label === activeFilter || d.x === activeFilter) 
    : data;

  const width = 600;
  const height = 280;
  const padding = { top: 30, right: 30, bottom: 40, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Helper for numeric extraction
  const getVal = (d: DataPoint) => d.value ?? (typeof d.y === 'number' ? d.y : parseFloat(String(d.y || 0)));

  // SVG Export trigger
  const downloadSVG = () => {
    if (!svgRef.current) return;
    const svgString = new XMLSerializer().serializeToString(svgRef.current);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const downloadLink = document.createElement('a');
    downloadLink.href = svgUrl;
    downloadLink.download = `${title.toLowerCase().replace(/\s+/g, '_')}.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  // CSV Export trigger
  const exportCSV = () => {
    let headers = ['Label', 'Value'];
    if (type === 'heatmap') headers = ['X', 'Y', 'Correlation'];
    else if (type === 'scatter') headers = ['X', 'Y'];

    const rows = data.map(d => {
      if (type === 'heatmap') return [d.x, d.y, d.value];
      if (type === 'scatter') return [d.x, d.y];
      return [d.label || d.x || '', getVal(d)];
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${title.toLowerCase().replace(/\s+/g, '_')}_data.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Rendering logic for different charts
  const renderLineAndArea = (isArea = false) => {
    const vals = filteredData.map(getVal);
    const maxVal = Math.max(...vals, 1);
    const minVal = 0;

    const points = filteredData.map((d, i) => {
      const val = getVal(d);
      const x = padding.left + (filteredData.length > 1 ? (i / (filteredData.length - 1)) * chartWidth : 0);
      const y = padding.top + chartHeight - ((val - minVal) / (maxVal - minVal)) * chartHeight;
      return { x, y, label: d.label || String(d.x || ''), value: val, forecast: d.forecast };
    });

    const forecastStartIndex = points.findIndex(p => p.forecast);
    let histPoints = forecastStartIndex === -1 ? points : points.slice(0, forecastStartIndex + 1);
    let forePoints = forecastStartIndex === -1 ? [] : points.slice(forecastStartIndex);

    const histPath = histPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const forePath = forePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    let areaPath = '';
    if (isArea && points.length > 0) {
      areaPath = `${points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`;
    }

    return (
      <g>
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00C48C" stopOpacity="0.4"/>
            <stop offset="100%" stopColor="#00C48C" stopOpacity="0.0"/>
          </linearGradient>
        </defs>

        {/* Y Axis Gridlines */}
        {[0, maxVal / 2, maxVal].map((t, idx) => {
          const y = padding.top + chartHeight - (t / maxVal) * chartHeight;
          return (
            <g key={idx}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
              <text x={padding.left - 8} y={y + 3} fill="#64748b" fontSize="8" textAnchor="end">{Math.round(t).toLocaleString()}</text>
            </g>
          );
        })}

        {/* Area fill */}
        {isArea && areaPath && (
          <path d={areaPath} fill="url(#areaGradient)"/>
        )}

        {/* Paths */}
        {histPath && (
          <path d={histPath} fill="none" stroke="#00C48C" strokeWidth="2.5" strokeLinecap="round" className="transition-all duration-300"/>
        )}
        {forePath && (
          <path d={forePath} fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 3"/>
        )}

        {/* Circles */}
        {points.map((p, idx) => (
          <g key={idx} 
             className="cursor-pointer group"
             onMouseEnter={(e) => {
               setHoveredIndex(idx);
               setTooltipPos({ x: p.x, y: p.y - 12 });
             }}
             onMouseLeave={() => setHoveredIndex(null)}
          >
            <circle cx={p.x} cy={p.y} r={hoveredIndex === idx ? "6" : "4.5"} fill={p.forecast ? "#8B5CF6" : "#00C48C"} stroke="#0D121F" strokeWidth="1.5" className="transition-all"/>
            {/* Axis labels */}
            {points.length <= 15 || idx % Math.round(points.length / 5) === 0 ? (
              <text x={p.x} y={height - padding.bottom + 14} fill="#64748b" fontSize="8" textAnchor="middle">{p.label}</text>
            ) : null}
          </g>
        ))}
      </g>
    );
  };

  const renderBar = (isHorizontal = false) => {
    const vals = filteredData.map(getVal);
    const maxVal = Math.max(...vals, 1);
    const totalCount = filteredData.length;

    return (
      <g>
        {isHorizontal ? (
          // Horizontal Bar Layout
          filteredData.map((d, i) => {
            const val = getVal(d);
            const label = d.label || String(d.x || '');
            const barHeight = Math.min(20, chartHeight / totalCount - 6);
            const y = padding.top + (i / totalCount) * chartHeight + (chartHeight / totalCount - barHeight) / 2;
            const barWidth = (val / maxVal) * chartWidth;

            return (
              <g key={i} 
                 className="cursor-pointer"
                 onMouseEnter={() => {
                   setHoveredIndex(i);
                   setTooltipPos({ x: padding.left + barWidth, y: y + barHeight / 2 });
                 }}
                 onMouseLeave={() => setHoveredIndex(null)}
              >
                <text x={padding.left - 8} y={y + barHeight / 2 + 3} fill="#64748b" fontSize="8" textAnchor="end" className="truncate max-w-[50px]">{label}</text>
                <rect 
                  x={padding.left} 
                  y={y} 
                  width={barWidth} 
                  height={barHeight} 
                  rx="3" 
                  fill={hoveredIndex === i ? "#00A877" : "url(#barGrad)"}
                  className="transition-all duration-300"
                />
              </g>
            );
          })
        ) : (
          // Vertical Bar Layout
          <g>
            <defs>
              <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00C48C"/>
                <stop offset="100%" stopColor="#8B5CF6"/>
              </linearGradient>
            </defs>

            {/* Y Axis Grid */}
            {[0, maxVal / 2, maxVal].map((t, idx) => {
              const y = padding.top + chartHeight - (t / maxVal) * chartHeight;
              return (
                <g key={idx}>
                  <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
                  <text x={padding.left - 8} y={y + 3} fill="#64748b" fontSize="8" textAnchor="end">{Math.round(t).toLocaleString()}</text>
                </g>
              );
            })}

            {filteredData.map((d, i) => {
              const val = getVal(d);
              const label = d.label || String(d.x || '');
              const barWidth = Math.min(30, chartWidth / totalCount - 8);
              const x = padding.left + (i / totalCount) * chartWidth + (chartWidth / totalCount - barWidth) / 2;
              const barHeight = (val / maxVal) * chartHeight;
              const y = padding.top + chartHeight - barHeight;

              return (
                <g key={i} 
                   className="cursor-pointer"
                   onMouseEnter={() => {
                     setHoveredIndex(i);
                     setTooltipPos({ x: x + barWidth / 2, y: y });
                   }}
                   onMouseLeave={() => setHoveredIndex(null)}
                >
                  <rect 
                    x={x} 
                    y={y} 
                    width={barWidth} 
                    height={Math.max(barHeight, 3)} 
                    rx="4" 
                    fill={hoveredIndex === i ? "#00A877" : "url(#barGrad)"}
                    className="transition-all duration-300"
                  />
                  <text x={x + barWidth / 2} y={height - padding.bottom + 14} fill="#64748b" fontSize="8" textAnchor="middle">{label.slice(0, 8)}</text>
                </g>
              );
            })}
          </g>
        )}
      </g>
    );
  };

  const renderPieOrDonut = (isDonut = false) => {
    const vals = filteredData.map(getVal);
    const total = vals.reduce((a, b) => a + b, 0);
    const radius = Math.min(chartWidth, chartHeight) / 2.2;
    const centerX = width / 2;
    const centerY = height / 2;

    const colors = [
      '#00C48C', '#8B5CF6', '#3B82F6', '#EF4444', '#F59E0B', 
      '#EC4899', '#14B8A6', '#87A2FF', '#FFB3B3', '#D3E4CD'
    ];

    let accumAngle = 0;

    return (
      <g>
        {filteredData.map((d, i) => {
          const val = getVal(d);
          const percent = total > 0 ? val / total : 0;
          const sliceAngle = percent * 360;

          // Compute SVG arc points
          const x1 = centerX + radius * Math.cos((accumAngle - 90) * Math.PI / 180);
          const y1 = centerY + radius * Math.sin((accumAngle - 90) * Math.PI / 180);
          accumAngle += sliceAngle;
          const x2 = centerX + radius * Math.cos((accumAngle - 90) * Math.PI / 180);
          const y2 = centerY + radius * Math.sin((accumAngle - 90) * Math.PI / 180);

          const largeArcFlag = sliceAngle > 180 ? 1 : 0;

          const pathData = `
            M ${centerX} ${centerY}
            L ${x1} ${y1}
            A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}
            Z
          `;

          const color = colors[i % colors.length];
          const textX = centerX + (radius * 0.7) * Math.cos((accumAngle - sliceAngle / 2 - 90) * Math.PI / 180);
          const textY = centerY + (radius * 0.7) * Math.sin((accumAngle - sliceAngle / 2 - 90) * Math.PI / 180);

          return (
            <g key={i} 
               className="cursor-pointer"
               onMouseEnter={() => {
                 setHoveredIndex(i);
                 setTooltipPos({ x: textX, y: textY });
               }}
               onMouseLeave={() => setHoveredIndex(null)}
            >
              <path 
                d={pathData} 
                fill={color} 
                stroke="#0D121F" 
                strokeWidth="1.5"
                opacity={hoveredIndex === i ? 0.95 : 0.8}
                className="transition-all duration-200"
              />
              {percent > 0.05 && (
                <text x={textX} y={textY} fill="white" fontSize="8" fontWeight="bold" textAnchor="middle">
                  {Math.round(percent * 100)}%
                </text>
              )}
            </g>
          );
        })}

        {isDonut && (
          // Donut inner hole
          <circle cx={centerX} cy={centerY} r={radius * 0.55} fill="#0D121F"/>
        )}
      </g>
    );
  };

  const renderScatter = () => {
    // Collect coordinates
    const xs = filteredData.map(d => typeof d.x === 'number' ? d.x : parseFloat(String(d.x || 0)));
    const ys = filteredData.map(getVal);

    const maxX = Math.max(...xs, 1);
    const maxY = Math.max(...ys, 1);

    return (
      <g>
        {/* Gridlines */}
        {[0, 0.5, 1].map((ratio, idx) => {
          const x = padding.left + ratio * chartWidth;
          const y = padding.top + ratio * chartHeight;
          return (
            <g key={idx}>
              <line x1={x} y1={padding.top} x2={x} y2={height - padding.bottom} stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
              
              <text x={padding.left - 8} y={y + 3} fill="#64748b" fontSize="8" textAnchor="end">{Math.round(ratio * maxY).toLocaleString()}</text>
              <text x={x} y={height - padding.bottom + 12} fill="#64748b" fontSize="8" textAnchor="middle">{Math.round(ratio * maxX).toLocaleString()}</text>
            </g>
          );
        })}

        {filteredData.map((d, i) => {
          const cx = padding.left + ((xs[i] / maxX) * chartWidth);
          const cy = padding.top + chartHeight - ((ys[i] / maxY) * chartHeight);

          return (
            <g key={i}
               className="cursor-pointer"
               onMouseEnter={() => {
                 setHoveredIndex(i);
                 setTooltipPos({ x: cx, y: cy });
               }}
               onMouseLeave={() => setHoveredIndex(null)}
            >
              <circle cx={cx} cy={cy} r={hoveredIndex === i ? 7 : 5} fill="#00C48C" stroke="#0D121F" strokeWidth="1.5" className="transition-all"/>
            </g>
          );
        })}
      </g>
    );
  };

  const renderHeatmap = () => {
    // Unique list of X and Y fields
    const xs = Array.from(new Set(data.map(d => String(d.x))));
    const ys = Array.from(new Set(data.map(d => String(d.y))));

    const stepX = chartWidth / xs.length;
    const stepY = chartHeight / ys.length;

    return (
      <g>
        {xs.map((xVal, xi) => {
          return ys.map((yVal, yi) => {
            const d = data.find(item => String(item.x) === xVal && String(item.y) === yVal);
            const val = d ? d.value ?? 0 : 0;
            const rx = padding.left + xi * stepX;
            const ry = padding.top + yi * stepY;

            // Map color scale: positive -> green/emerald, negative -> purple/indigo
            let color = "rgba(255,255,255,0.04)";
            if (val > 0) color = `rgba(0, 196, 140, ${val})`;
            else if (val < 0) color = `rgba(139, 92, 246, ${Math.abs(val)})`;

            return (
              <g key={`${xi}-${yi}`}
                 className="cursor-pointer"
                 onMouseEnter={() => {
                   setHoveredIndex(xi * 100 + yi);
                   setTooltipPos({ x: rx + stepX / 2, y: ry + stepY / 2 });
                 }}
                 onMouseLeave={() => setHoveredIndex(null)}
              >
                <rect 
                  x={rx} 
                  y={ry} 
                  width={stepX - 2} 
                  height={stepY - 2} 
                  fill={color} 
                  rx="2"
                />
                {stepX > 35 && (
                  <text x={rx + stepX / 2} y={ry + stepY / 2 + 3} fill={Math.abs(val) > 0.4 ? "white" : "#94a3b8"} fontSize="8" textAnchor="middle" fontWeight="bold">
                    {val.toFixed(2)}
                  </text>
                )}
                {/* Axis labels */}
                {yi === 0 && (
                  <text x={rx + stepX / 2} y={height - padding.bottom + 14} fill="#64748b" fontSize="7" textAnchor="middle" className="truncate max-w-[40px]">{xVal}</text>
                )}
                {xi === 0 && (
                  <text x={padding.left - 8} y={ry + stepY / 2 + 3} fill="#64748b" fontSize="7" textAnchor="end">{yVal}</text>
                )}
              </g>
            );
          });
        })}
      </g>
    );
  };

  const renderFunnel = () => {
    const vals = filteredData.map(getVal);
    const maxVal = Math.max(...vals, 1);
    const n = filteredData.length;

    return (
      <g>
        {filteredData.map((d, i) => {
          const val = getVal(d);
          const label = d.label || String(d.x || '');
          const w1 = (val / maxVal) * chartWidth;
          const w2 = i < n - 1 ? (getVal(filteredData[i + 1]) / maxVal) * chartWidth : w1 * 0.7;

          const hStep = chartHeight / n;
          const y1 = padding.top + i * hStep;
          const y2 = y1 + hStep - 6;

          const c = width / 2;

          // Polygon path mapping: trapezoid for funnel segment
          const pointsStr = `
            ${c - w1 / 2},${y1}
            ${c + w1 / 2},${y1}
            ${c + w2 / 2},${y2}
            ${c - w2 / 2},${y2}
          `;

          return (
            <g key={i}
               className="cursor-pointer"
               onMouseEnter={() => {
                 setHoveredIndex(i);
                 setTooltipPos({ x: c, y: (y1 + y2) / 2 });
               }}
               onMouseLeave={() => setHoveredIndex(null)}
            >
              <polygon 
                points={pointsStr} 
                fill={hoveredIndex === i ? "#00A877" : "rgba(0, 196, 140, " + (1 - (i * 0.15)) + ")"}
                stroke="#0D121F"
                strokeWidth="1.5"
                className="transition-all"
              />
              <text x={c - w1 / 2 - 12} y={(y1 + y2) / 2 + 3} fill="#64748b" fontSize="8" textAnchor="end">{label}</text>
              <text x={c} y={(y1 + y2) / 2 + 3} fill="white" fontSize="8" fontWeight="bold" textAnchor="middle">{val.toLocaleString()}</text>
            </g>
          );
        })}
      </g>
    );
  };

  const renderRadar = () => {
    const vals = filteredData.map(getVal);
    const maxVal = Math.max(...vals, 1);
    const n = filteredData.length;
    const cX = width / 2;
    const cY = height / 2;
    const rMax = Math.min(chartWidth, chartHeight) / 2.2;

    // Generate grid rings
    const rings = [0.25, 0.5, 0.75, 1];
    
    // Convert polar angle & value ratio to coordinates
    const getCoord = (idx: number, ratio: number) => {
      const angle = (idx / n) * 2 * Math.PI - Math.PI / 2;
      return {
        x: cX + rMax * ratio * Math.cos(angle),
        y: cY + rMax * ratio * Math.sin(angle)
      };
    };

    const polyPoints = filteredData.map((d, idx) => {
      const coord = getCoord(idx, getVal(d) / maxVal);
      return `${coord.x},${coord.y}`;
    }).join(' ');

    return (
      <g>
        {/* Draw background rings */}
        {rings.map((ratio, idx) => {
          const points = Array.from({ length: n }).map((_, i) => {
            const coord = getCoord(i, ratio);
            return `${coord.x},${coord.y}`;
          }).join(' ');

          return (
            <g key={idx}>
              <polygon points={points} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
              <text x={cX} y={cY - rMax * ratio + 10} fill="#64748b" fontSize="6" textAnchor="middle">
                {Math.round(ratio * maxVal).toLocaleString()}
              </text>
            </g>
          );
        })}

        {/* Draw web axes */}
        {Array.from({ length: n }).map((_, idx) => {
          const outer = getCoord(idx, 1);
          const label = filteredData[idx].label || String(filteredData[idx].x || '');
          return (
            <g key={idx}>
              <line x1={cX} y1={cY} x2={outer.x} y2={outer.y} stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
              <text x={outer.x} y={outer.y > cY ? outer.y + 8 : outer.y - 4} fill="#64748b" fontSize="7" textAnchor="middle">
                {label}
              </text>
            </g>
          );
        })}

        {/* Dynamic polygon representation */}
        {polyPoints && (
          <polygon 
            points={polyPoints} 
            fill="rgba(0, 196, 140, 0.25)" 
            stroke="#00C48C" 
            strokeWidth="2"
          />
        )}

        {/* Axis dots */}
        {filteredData.map((d, idx) => {
          const val = getVal(d);
          const p = getCoord(idx, val / maxVal);
          return (
            <circle 
              key={idx}
              cx={p.x} 
              cy={p.y} 
              r="4.5" 
              fill="#00C48C" 
              stroke="#0D121F" 
              strokeWidth="1.5"
              className="cursor-pointer"
              onMouseEnter={() => {
                setHoveredIndex(idx);
                setTooltipPos({ x: p.x, y: p.y - 10 });
              }}
              onMouseLeave={() => setHoveredIndex(null)}
            />
          );
        })}
      </g>
    );
  };

  const renderWaterfall = () => {
    const vals = filteredData.map(getVal);
    // waterfall runs cumulative: start at 0, walk steps
    const cumulative = [];
    let cur = 0;
    vals.forEach(v => {
      cumulative.push({ start: cur, end: cur + v, value: v });
      cur += v;
    });

    const maxCum = Math.max(...cumulative.map(c => Math.max(c.start, c.end)), 1);
    const minCum = Math.min(0, ...cumulative.map(c => Math.min(c.start, c.end)));
    const range = maxCum - minCum;

    const n = filteredData.length;

    return (
      <g>
        {/* Axis Grid lines */}
        {[minCum, maxCum / 2, maxCum].map((t, idx) => {
          const y = padding.top + chartHeight - ((t - minCum) / range) * chartHeight;
          return (
            <g key={idx}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
              <text x={padding.left - 8} y={y + 3} fill="#64748b" fontSize="8" textAnchor="end">{Math.round(t).toLocaleString()}</text>
            </g>
          );
        })}

        {cumulative.map((c, i) => {
          const label = filteredData[i].label || String(filteredData[i].x || '');
          const w = Math.min(32, chartWidth / n - 8);
          const x = padding.left + (i / n) * chartWidth + (chartWidth / n - w) / 2;

          const topVal = Math.max(c.start, c.end);
          const bottomVal = Math.min(c.start, c.end);

          const y = padding.top + chartHeight - ((topVal - minCum) / range) * chartHeight;
          const h = ((topVal - bottomVal) / range) * chartHeight;

          // Color coded: positive green, negative red
          const color = c.value >= 0 ? "#00C48C" : "#EF4444";

          return (
            <g key={i}
               className="cursor-pointer"
               onMouseEnter={() => {
                 setHoveredIndex(i);
                 setTooltipPos({ x: x + w / 2, y: y });
               }}
               onMouseLeave={() => setHoveredIndex(null)}
            >
              <rect 
                x={x} 
                y={y} 
                width={w} 
                height={Math.max(h, 3)} 
                fill={hoveredIndex === i ? "#3B82F6" : color}
                rx="2"
                className="transition-all"
              />
              <text x={x + w / 2} y={height - padding.bottom + 14} fill="#64748b" fontSize="7" textAnchor="middle">{label}</text>
            </g>
          );
        })}
      </g>
    );
  };

  const getChartContent = () => {
    switch (type) {
      case 'line': return renderLineAndArea(false);
      case 'area': return renderLineAndArea(true);
      case 'bar': return renderBar(false);
      case 'horizontalBar': return renderBar(true);
      case 'pie': return renderPieOrDonut(false);
      case 'donut': return renderPieOrDonut(true);
      case 'scatter': return renderScatter();
      case 'heatmap': return renderHeatmap();
      case 'funnel': return renderFunnel();
      case 'radar': return renderRadar();
      case 'waterfall': return renderWaterfall();
      default: return null;
    }
  };

  return (
    <div className="relative mt-5 rounded-2xl border border-white/10 bg-[#0E131F]/90 p-5 shadow-lg shadow-black/25">
      <div className="flex items-center justify-between pb-3 border-b border-white/5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-350">{title}</h4>
        
        <div className="flex gap-2 text-[10px]">
          <button 
            className="px-2.5 py-1 rounded bg-[#00C48C]/15 text-[#67f0c3] hover:bg-[#00C48C]/25 transition cursor-pointer"
            onClick={downloadSVG}
          >
            Download SVG
          </button>
          <button 
            className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-750 transition cursor-pointer"
            onClick={exportCSV}
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Filter chips (if category data and not heatmap) */}
      {type !== 'heatmap' && type !== 'scatter' && data.length > 5 && data.length <= 10 && (
        <div className="flex flex-wrap gap-1 mt-3">
          <button 
            onClick={() => setActiveFilter(null)}
            className={`px-2 py-0.5 rounded text-[8px] uppercase tracking-wider font-semibold border ${!activeFilter ? 'bg-[#00C48C] text-[#03110c] border-[#00C48C]' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}
          >
            All
          </button>
          {data.map((d, i) => {
            const lbl = d.label || String(d.x || '');
            if (!lbl) return null;
            return (
              <button 
                key={i}
                onClick={() => setActiveFilter(activeFilter === lbl ? null : lbl)}
                className={`px-2 py-0.5 rounded text-[8px] uppercase tracking-wider font-semibold border ${activeFilter === lbl ? 'bg-[#00C48C] text-[#03110c] border-[#00C48C]' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}
              >
                {lbl}
              </button>
            );
          })}
        </div>
      )}

      {/* SVG Canvas */}
      <div className="mt-4 flex justify-center items-center overflow-x-auto">
        <svg 
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`} 
          className="w-full max-w-[560px] h-auto overflow-visible select-none"
        >
          {/* Chart Border Box */}
          <rect x={padding.left} y={padding.top} width={chartWidth} height={chartHeight} fill="rgba(255,255,255,0.01)" stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
          
          {getChartContent()}
        </svg>
      </div>

      {/* Custom Hover Tooltip */}
      {hoveredIndex !== null && (
        <div 
          className="absolute z-30 pointer-events-none rounded bg-[#020617] border border-white/15 px-2 py-1 text-[9px] font-bold text-white shadow-md transition-all duration-75"
          style={{ 
            left: `${(tooltipPos.x / width) * 100}%`, 
            top: `${(tooltipPos.y / height) * 100}%`,
            transform: 'translate(-50%, -100%)' 
          }}
        >
          {type === 'heatmap' ? (
            <div>
              <div>X: {data[hoveredIndex]?.x}</div>
              <div>Y: {data[hoveredIndex]?.y}</div>
              <div className="text-[#00C48C] mt-0.5">Corr: {data[hoveredIndex]?.value}</div>
            </div>
          ) : type === 'scatter' ? (
            <div>
              <div>X: {data[hoveredIndex]?.x}</div>
              <div className="text-[#00C48C]">Y: {data[hoveredIndex]?.y}</div>
            </div>
          ) : (
            <div>
              <span>{filteredData[hoveredIndex]?.label || filteredData[hoveredIndex]?.x}: </span>
              <span className="text-[#00C48C]">{getVal(filteredData[hoveredIndex]).toLocaleString()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
