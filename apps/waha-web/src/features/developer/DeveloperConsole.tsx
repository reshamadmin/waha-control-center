import React, { useState, useEffect } from "react";
import axios from "axios";
import { 
  Sliders, Database, AlertCircle, Loader2, Download, 
  Upload, Terminal, ToggleLeft, ToggleRight, RefreshCw, BarChart2 
} from "lucide-react";

export const DeveloperConsole: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"overview" | "logs" | "metrics" | "backup">("overview");
  const [diagnostics, setDiagnostics] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);

  const fetchDiagnostics = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/dev/diagnostics");
      if (res.data.status === "success") {
        setDiagnostics(res.data.diagnostics);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to load developer diagnostics.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFlag = async (key: string, currentState: boolean) => {
    setToggleLoading(key);
    try {
      await axios.post(`/api/dev/feature-flags/${key}/toggle`, { isEnabled: !currentState });
      // Reload details
      await fetchDiagnostics();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to toggle feature flag.");
    } finally {
      setToggleLoading(null);
    }
  };

  const handleExportBackup = async () => {
    try {
      const res = await axios.get("/api/dev/backup/export", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `waha_db_backup_${Date.now()}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      alert("Failed to export database tables backup.");
    }
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const backupData = JSON.parse(text);

        setImportLoading(true);
        const res = await axios.post("/api/dev/backup/import", { backupData });
        if (res.data.status === "success") {
          alert("Database schema tables successfully restored!");
          fetchDiagnostics();
        }
      } catch (err: any) {
        alert(err.response?.data?.message || "Failed to parse and import backup file.");
      } finally {
        setImportLoading(false);
      }
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    fetchDiagnostics();
  }, []);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 select-none text-left">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-ink mb-1 flex items-center gap-2">
            <Terminal className="w-6 h-6 text-accent" /> Developer Console
          </h1>
          <p className="text-xs text-muted">Staging environment live telemetry diagnostics console.</p>
        </div>
        <button
          onClick={fetchDiagnostics}
          className="p-2 border border-line hover:bg-slate-50 rounded-xl transition-all shadow-sm"
          title="Reload metrics"
        >
          <RefreshCw className="w-4 h-4 text-muted" />
        </button>
      </div>

      {error && (
        <div className="p-4 bg-danger/10 border border-danger/20 text-danger text-xs font-semibold rounded-2xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Tabs list */}
      <div className="flex border-b border-line gap-1 text-xs font-semibold">
        {(["overview", "logs", "metrics", "backup"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 capitalize border-b-2 transition-all -mb-px ${
              activeTab === tab
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted">
          <Loader2 className="w-8 h-8 animate-spin text-accent mb-2" />
          <p className="text-xs font-medium">Extracting telemetry logs...</p>
        </div>
      ) : !diagnostics ? (
        <p className="text-xs text-muted text-center py-10">No diagnostics data loaded.</p>
      ) : (
        <div className="space-y-6">
          
          {/* Overview Tab Content */}
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Releases Information */}
              <div className="bg-white border border-line rounded-2xl p-5 shadow-sm space-y-4 md:col-span-2">
                <h3 className="font-bold text-xs text-ink uppercase tracking-wider">Release & Environment</h3>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="p-3 bg-slate-50 border border-line rounded-xl">
                    <div className="text-[10px] font-semibold text-muted mb-0.5">Application Version</div>
                    <div className="font-bold text-ink">{diagnostics.release.appVersion}</div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-line rounded-xl">
                    <div className="text-[10px] font-semibold text-muted mb-0.5">Git Commit Hash</div>
                    <div className="font-bold text-ink font-mono">{diagnostics.release.gitCommit}</div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-line rounded-xl">
                    <div className="text-[10px] font-semibold text-muted mb-0.5">Database Schema Version</div>
                    <div className="font-bold text-ink">v{diagnostics.release.dbVersion}</div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-line rounded-xl">
                    <div className="text-[10px] font-semibold text-muted mb-0.5">Active Environment</div>
                    <div className="font-bold text-ink uppercase tracking-wider">{diagnostics.release.environment}</div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-line rounded-xl">
                    <div className="text-[10px] font-semibold text-muted mb-0.5">WAHA Session Engine</div>
                    <div className="font-bold text-ink">{diagnostics.waha.connected ? "CONNECTED" : "DISCONNECTED"}</div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-line rounded-xl">
                    <div className="text-[10px] font-semibold text-muted mb-0.5">Build compiled Date</div>
                    <div className="font-bold text-ink">{diagnostics.release.buildDate}</div>
                  </div>
                </div>
              </div>

              {/* Feature Flags Controls */}
              <div className="bg-white border border-line rounded-2xl p-5 shadow-sm space-y-4">
                <h3 className="font-bold text-xs text-ink uppercase tracking-wider flex items-center gap-1">
                  <Sliders className="w-4 h-4 text-accent" /> Capability Feature Flags
                </h3>
                <div className="space-y-3.5 divide-y divide-slate-100">
                  {diagnostics.featureFlags.map((flag: any, idx: number) => {
                    const isEnabled = !!flag.is_enabled;
                    const isToggling = toggleLoading === flag.flag_key;

                    return (
                      <div key={flag.flag_key} className={`flex justify-between items-center py-2 ${idx > 0 ? "pt-3" : ""}`}>
                        <div>
                          <div className="text-xs font-bold text-ink">{flag.flag_name}</div>
                          <div className="text-[10px] text-muted font-mono">{flag.flag_key}</div>
                        </div>

                        <button
                          disabled={isToggling}
                          onClick={() => handleToggleFlag(flag.flag_key, isEnabled)}
                          className={`p-1 rounded-lg transition-all ${isToggling ? "opacity-40" : ""}`}
                        >
                          {isEnabled ? (
                            <ToggleRight className="w-7 h-7 text-accent" />
                          ) : (
                            <ToggleLeft className="w-7 h-7 text-muted" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}

          {/* System Logs Tab Content */}
          {activeTab === "logs" && (
            <div className="bg-white border border-line rounded-2xl overflow-hidden shadow-sm flex flex-col max-h-[60vh]">
              <div className="p-4 border-b border-line bg-slate-50 flex justify-between items-center">
                <h3 className="font-bold text-xs text-ink uppercase tracking-wider flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-accent shrink-0" /> Live System Logs (Last 50 Logs)
                </h3>
              </div>

              <div className="flex-1 overflow-x-auto overflow-y-auto">
                <table className="w-full text-xs text-left divide-y divide-line border-collapse">
                  <thead className="bg-slate-50 text-[10px] font-bold text-muted uppercase tracking-wider sticky top-0 z-10 border-b border-line select-none">
                    <tr>
                      <th className="px-5 py-3.5">Level</th>
                      <th className="px-5 py-3.5">Source</th>
                      <th className="px-5 py-3.5">Message</th>
                      <th className="px-5 py-3.5">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-white font-mono">
                    {diagnostics.logs.map((log: any) => {
                      const isError = log.level === "ERROR" || log.level === "FATAL";
                      const isWarning = log.level === "WARN";

                      return (
                        <tr key={log.id} className="hover:bg-slate-50/50">
                          <td className="px-5 py-3">
                            <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] ${
                              isError ? "bg-danger/15 text-danger" :
                              isWarning ? "bg-warning/15 text-warning" : "bg-slate-100 text-muted"
                            }`}>
                              {log.level}
                            </span>
                          </td>
                          <td className="px-5 py-3 font-semibold text-ink">{log.source}</td>
                          <td className="px-5 py-3 max-w-lg truncate" title={log.message}>
                            {log.message}
                          </td>
                          <td className="px-5 py-3 text-muted">{new Date(log.created_at).toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Metrics Telemetry Tab Content */}
          {activeTab === "metrics" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Telemetry charts summary */}
              <div className="bg-white border border-line rounded-2xl p-5 shadow-sm space-y-4 md:col-span-2 text-left">
                <h3 className="font-bold text-xs text-ink uppercase tracking-wider flex items-center gap-1.5">
                  <BarChart2 className="w-4.5 h-4.5 text-accent" /> Latencies & Dispatches Timeline
                </h3>
                <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                  {diagnostics.metricsHistory?.length > 0 ? (
                    diagnostics.metricsHistory.map((mtr: any) => (
                      <div key={mtr.id} className="flex justify-between items-center py-3 text-xs">
                        <div>
                          <div className="font-bold text-ink">Sent: {mtr.messages_sent_count} dispatches</div>
                          <div className="text-[10px] text-muted">{new Date(mtr.recorded_at).toLocaleString()}</div>
                        </div>

                        <div className="text-right">
                          <div className="font-semibold text-ink">Avg speed: {mtr.avg_latency_ms} ms</div>
                          <div className="text-[10px] text-muted">Queue depth: {mtr.queue_depth} jobs</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted text-center py-10">No historical metrics logged yet.</p>
                  )}
                </div>
              </div>

              {/* Active Worker status */}
              <div className="bg-white border border-line rounded-2xl p-5 shadow-sm space-y-4 text-left">
                <h3 className="font-bold text-xs text-ink uppercase tracking-wider">Worker Telemetry</h3>
                <div className="space-y-3.5 text-xs text-muted font-medium">
                  <div>Sent: <strong className="text-ink">{diagnostics.worker.messages_sent}</strong></div>
                  <div>Failed: <strong className="text-ink">{diagnostics.worker.messages_failed}</strong></div>
                  <div>Uptime: <strong className="text-ink">{diagnostics.worker.worker_uptime}</strong></div>
                  <div>Depth: <strong className="text-ink">{diagnostics.worker.queue_depth} jobs</strong></div>
                  <div>Latency: <strong className="text-ink">{diagnostics.worker.average_send_time_ms} ms</strong></div>
                </div>
              </div>
            </div>
          )}

          {/* Database Backup Utilities */}
          {activeTab === "backup" && (
            <div className="bg-white border border-line rounded-2xl p-6 shadow-sm space-y-6 text-left max-w-xl">
              <div>
                <h2 className="text-sm font-bold text-ink flex items-center gap-1.5 mb-1">
                  <Database className="w-4.5 h-4.5 text-accent" /> Data Backup & Restores
                </h2>
                <p className="text-xs text-muted">Download database table outputs as a backup file, or upload a JSON backup to restore database records.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Export Card */}
                <button
                  onClick={handleExportBackup}
                  className="p-5 border border-line hover:bg-slate-50 text-left rounded-xl transition-all shadow-sm flex flex-col justify-between h-36"
                >
                  <Download className="w-6 h-6 text-accent mb-2" />
                  <div>
                    <div className="text-xs font-bold text-ink mb-0.5">Export Database</div>
                    <div className="text-[10px] text-muted leading-relaxed">Save tables data as JSON format files.</div>
                  </div>
                </button>

                {/* Import Card */}
                <div className="relative border border-dashed border-line hover:bg-slate-50/50 rounded-xl transition-all shadow-sm flex flex-col justify-between p-5 h-36">
                  {importLoading ? (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-xl">
                      <Loader2 className="w-6 h-6 animate-spin text-accent" />
                    </div>
                  ) : null}

                  <Upload className="w-6 h-6 text-muted mb-2" />
                  <div>
                    <label className="text-xs font-bold text-ink mb-0.5 block cursor-pointer">
                      Import Backup
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportBackup}
                        className="hidden"
                      />
                    </label>
                    <div className="text-[10px] text-muted leading-relaxed">Upload JSON backup file to restore records.</div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
};
