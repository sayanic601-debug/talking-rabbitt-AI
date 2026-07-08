import { useState } from 'react';
import DataVisualizer from './DataVisualizer';

interface ColumnInfo {
  name: string;
  type: string;
}

interface SummaryStat {
  sum: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
  count: number;
}

interface OutlierDetail {
  count: number;
  q1: number;
  q3: number;
  iqr: number;
  lowerBound: number;
  upperBound: number;
}

interface AnalyticsData {
  totalRows: number;
  totalCols: number;
  missingCounts: Record<string, number>;
  totalMissing: number;
  duplicateCount: number;
  uniqueCounts: Record<string, number>;
  outliers: Record<string, OutlierDetail>;
  totalOutliers: number;
  qualityScore: number;
  summaryStats: Record<string, SummaryStat>;
  correlationMatrix: Record<string, Record<string, number>>;
  categoricalDistributions: Record<string, Array<{ label: string; count: number }>>;
  growthAnalysis: { points: Array<{ label: string; value: number }>; overallGrowthPercentage: number } | null;
  forecastReadiness: boolean;
}

interface DatasetInfo {
  filename: string;
  rowCount: number;
  columns: ColumnInfo[];
  temporalColumn: string | null;
  numericColumns: string[];
  categoricalColumns: string[];
  textColumns: string[];
  analytics: AnalyticsData;
  previewRows?: Record<string, any>[];
}

interface AutoDashboardProps {
  datasetInfo: DatasetInfo;
}

export default function AutoDashboard({ datasetInfo }: AutoDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'stats' | 'correlations' | 'distributions' | 'raw_data'>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const { analytics, columns, filename, previewRows = [] } = datasetInfo;
  
  if (!analytics) return null;

  // Format numbers nicely
  const fNum = (n: number) => (n % 1 === 0 ? n.toLocaleString() : n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 }));

  // Color coding for Quality score
  const getQualityColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10';
    if (score >= 50) return 'text-amber-400 border-amber-500/20 bg-amber-500/10';
    return 'text-red-400 border-red-500/20 bg-red-500/10';
  };

  // 1. Heatmap Data formatter
  const heatmapData = [];
  const matrix = analytics.correlationMatrix || {};
  Object.keys(matrix).forEach(col1 => {
    Object.keys(matrix[col1] || {}).forEach(col2 => {
      heatmapData.push({
        x: col1,
        y: col2,
        value: matrix[col1][col2]
      });
    });
  });

  // 2. Filter raw preview rows
  const filteredRows = previewRows.filter(row => 
    Object.values(row).some(val => 
      String(val).toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  // Pagination for raw data
  const totalPages = Math.ceil(filteredRows.length / itemsPerPage);
  const paginatedRows = filteredRows.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="flex flex-col gap-6 text-white">
      {/* Executive KPI Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {/* Quality Card */}
        <div className={`rounded-2xl border p-4 shadow-md ${getQualityColor(analytics.qualityScore)}`}>
          <div className="text-[10px] uppercase tracking-wider font-semibold opacity-75">Data Quality Score</div>
          <div className="mt-2 text-3xl font-bold font-mono">{analytics.qualityScore}%</div>
          <div className="text-[9px] mt-1 opacity-80">Ingestion health rating</div>
        </div>

        {/* Dimension Card */}
        <div className="rounded-2xl border border-white/10 bg-[#0E131F] p-4 shadow-md">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Dimensions</div>
          <div className="mt-2 text-3xl font-bold font-mono text-[#00C48C]">
            {datasetInfo.rowCount.toLocaleString()} <span className="text-sm font-normal text-slate-450">rows</span>
          </div>
          <div className="text-[9px] mt-1 text-slate-400">{columns.length} schema fields</div>
        </div>

        {/* Quality Audit Cards */}
        <div className="rounded-2xl border border-white/10 bg-[#0E131F] p-4 shadow-md">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Anomalies Detected</div>
          <div className="mt-2 text-3xl font-bold font-mono text-amber-400">
            {analytics.totalOutliers + analytics.duplicateCount}
          </div>
          <div className="text-[9px] mt-1 text-slate-400">
            {analytics.totalOutliers} outliers • {analytics.duplicateCount} duplicates
          </div>
        </div>

        {/* Column Types Summary */}
        <div className="rounded-2xl border border-white/10 bg-[#0E131F] p-4 shadow-md">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Forecast Readiness</div>
          <div className="mt-2 flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${analytics.forecastReadiness ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
            <span className="text-lg font-bold">
              {analytics.forecastReadiness ? 'Highly Ready' : 'Insufficient Data'}
            </span>
          </div>
          <div className="text-[9px] mt-1 text-slate-400">Requires temporal + numeric metrics</div>
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b border-white/10 text-sm overflow-x-auto gap-2">
        {(['overview', 'stats', 'correlations', 'distributions', 'raw_data'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-2.5 px-4 font-medium transition cursor-pointer relative border-b-2 capitalize ${
              activeTab === tab 
                ? 'border-[#00C48C] text-[#00C48C] font-semibold' 
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            {tab.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      <div className="min-h-72">
        {/* OVERVIEW PANEL */}
        {activeTab === 'overview' && (
          <div className="flex flex-col gap-6">
            <div className="rounded-2xl border border-white/10 bg-[#0E131F]/50 p-5">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Schema & Missing Values Profile</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/15 text-slate-400 font-semibold">
                      <th className="py-2.5">Column Name</th>
                      <th className="py-2.5">Data Type</th>
                      <th className="py-2.5">Unique Values</th>
                      <th className="py-2.5">Missing Values</th>
                      <th className="py-2.5">Outliers</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-300">
                    {columns.map(c => {
                      const missing = analytics.missingCounts[c.name] || 0;
                      const unique = analytics.uniqueCounts[c.name] || 0;
                      const outlier = analytics.outliers[c.name]?.count || 0;
                      
                      return (
                        <tr key={c.name} className="hover:bg-white/5">
                          <td className="py-3 font-semibold text-white">{c.name}</td>
                          <td className="py-3">
                            <span className={`px-2 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold ${
                              c.type === 'temporal' ? 'bg-amber-500/25 text-amber-300' :
                              c.type === 'numeric' ? 'bg-emerald-500/25 text-emerald-300' :
                              c.type === 'categorical' ? 'bg-purple-500/25 text-purple-300' : 'bg-slate-700/25 text-slate-450'
                            }`}>
                              {c.type}
                            </span>
                          </td>
                          <td className="py-3 font-mono">{unique.toLocaleString()}</td>
                          <td className="py-3">
                            {missing > 0 ? (
                              <span className="text-red-400 font-semibold">{missing.toLocaleString()} ({Math.round(missing / datasetInfo.rowCount * 100)}%)</span>
                            ) : (
                              <span className="text-emerald-400">None</span>
                            )}
                          </td>
                          <td className="py-3">
                            {outlier > 0 ? (
                              <span className="text-amber-400 font-semibold">{outlier.toLocaleString()}</span>
                            ) : (
                              <span className="text-slate-500">None</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* STATISTICS PANEL */}
        {activeTab === 'stats' && (
          <div className="rounded-2xl border border-white/10 bg-[#0E131F]/50 p-5">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Numerical Summary Statistics</h3>
            {Object.keys(analytics.summaryStats || {}).length === 0 ? (
              <div className="text-slate-400 text-sm">No numeric columns detected for statistical profiling.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/15 text-slate-400 font-semibold">
                      <th className="py-2.5">Column</th>
                      <th className="py-2.5">Sum</th>
                      <th className="py-2.5">Average</th>
                      <th className="py-2.5">Median</th>
                      <th className="py-2.5">Min</th>
                      <th className="py-2.5">Max</th>
                      <th className="py-2.5">Std Deviation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-350 font-mono">
                    {Object.entries(analytics.summaryStats).map(([col, stats]) => (
                      <tr key={col} className="hover:bg-white/5">
                        <td className="py-3 font-semibold text-white font-sans">{col}</td>
                        <td className="py-3">{fNum(stats.sum)}</td>
                        <td className="py-3 text-emerald-400">{fNum(stats.mean)}</td>
                        <td className="py-3">{fNum(stats.median)}</td>
                        <td className="py-3 text-slate-400">{fNum(stats.min)}</td>
                        <td className="py-3 text-slate-100">{fNum(stats.max)}</td>
                        <td className="py-3">{fNum(stats.stdDev)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* CORRELATIONS PANEL */}
        {activeTab === 'correlations' && (
          <div className="flex flex-col gap-4">
            {heatmapData.length === 0 ? (
              <div className="text-slate-400 text-sm rounded-2xl border border-white/10 bg-[#0E131F]/50 p-5">
                Correlation requires at least two numeric columns.
              </div>
            ) : (
              <DataVisualizer 
                type="heatmap"
                title="Linear Correlation Coefficients (Pearson)"
                data={heatmapData}
              />
            )}
          </div>
        )}

        {/* DISTRIBUTIONS PANEL */}
        {activeTab === 'distributions' && (
          <div className="grid gap-6 md:grid-cols-2">
            {Object.keys(analytics.categoricalDistributions || {}).length === 0 ? (
              <div className="text-slate-400 text-sm col-span-2 rounded-2xl border border-white/10 bg-[#0E131F]/50 p-5">
                No categorical columns found to calculate distributions.
              </div>
            ) : (
              Object.entries(analytics.categoricalDistributions).map(([col, dist]) => {
                const chartData = dist.map(p => ({ label: p.label, value: p.count }));
                return (
                  <div key={col}>
                    <DataVisualizer
                      type="bar"
                      title={`Top values in ${col}`}
                      data={chartData}
                    />
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* RAW DATA PANEL */}
        {activeTab === 'raw_data' && (
          <div className="rounded-2xl border border-white/10 bg-[#0E131F]/50 p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Raw Dataset Preview (First 100 Rows)</h3>
              <input
                className="rounded-xl border border-white/10 bg-[#05070B] px-3.5 py-1.5 text-xs text-white outline-none focus:border-[#00C48C]/40 transition w-full sm:w-56"
                placeholder="Search preview rows..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            {previewRows.length === 0 ? (
              <div className="text-slate-400 text-xs">No records available for preview.</div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="overflow-x-auto max-h-96 pr-1">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-white/15 text-slate-400 font-semibold sticky top-0 bg-[#0E131F] z-10">
                        {columns.map(c => (
                          <th key={c.name} className="py-2.5 pr-4 whitespace-nowrap">{c.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-350 font-mono">
                      {paginatedRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-white/5">
                          {columns.map(c => (
                            <td key={c.name} className="py-2.5 pr-4 truncate max-w-[200px]" title={String(row[c.name] ?? '')}>
                              {String(row[c.name] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-white/5 pt-3 text-xs text-slate-400">
                    <span>Showing Page {currentPage} of {totalPages} ({filteredRows.length} filtered rows)</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="px-2.5 py-1 rounded bg-slate-800 text-slate-200 hover:bg-slate-750 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="px-2.5 py-1 rounded bg-slate-800 text-slate-200 hover:bg-slate-750 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
