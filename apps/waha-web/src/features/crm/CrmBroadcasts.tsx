import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { 
  Upload, 
  Play, 
  Pause, 
  RotateCcw, 
  Clock, 
  AlertCircle, 
  FileText,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Calendar,
  Download,
  AlertTriangle,
  Info
} from "lucide-react";

axios.defaults.baseURL = "http://localhost:3002";
axios.defaults.withCredentials = true;

interface Campaign {
  id: string;
  title: string;
  status: "DRAFT" | "VALIDATED" | "SCHEDULED" | "RUNNING" | "PAUSED" | "COMPLETED";
  template_body: string;
  scheduled_at: string | null;
  created_at: string;
  total_queued: number;
  sent_count: number;
  failed_count: number;
  pending_count: number;
}

interface ValidationReport {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  emptyCount: number;
  rejectedRows: any[];
}

export const CrmBroadcasts = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeTab, setActiveTab] = useState<"list" | "wizard">("list");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active Campaign Detail Dashboard State
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [detailCampaign, setDetailCampaign] = useState<any | null>(null);
  const [detailAnalytics, setDetailAnalytics] = useState<any | null>(null);
  // Wizard Flow Form States (Refinement 2: 8 Steps)
  const [wizardStep, setWizardStep] = useState(1);
  const [campaignTitle, setCampaignTitle] = useState("");
  
  // CSV Parse States
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [mappedPhoneCol, setMappedPhoneCol] = useState("");
  const [mappedNameCol, setMappedNameCol] = useState("");
  const [mappedVillageCol, setMappedVillageCol] = useState("");

  // Templates & Attachments Composer States
  const [templateText, setTemplateText] = useState("");
  const [attachments, setAttachments] = useState<any[]>([]);
  
  // Safe Sending Limit configurations (Refinement 7)
  const [rulesMinDelay, setRulesMinDelay] = useState(10);
  const [rulesMaxDelay, setRulesMaxDelay] = useState(30);
  const [rulesBatchSize, setRulesBatchSize] = useState(50);
  const [rulesBatchPause, setRulesBatchPause] = useState(300); // 5 mins
  const [rulesMaxPerHour, setRulesMaxPerHour] = useState(100);
  const [rulesMaxPerDay, setRulesMaxPerDay] = useState(1000);

  // Schedule configurations (Refinement 6)
  const [scheduleMode, setScheduleMode] = useState<"immediate" | "scheduled">("immediate");
  const [scheduleDatetime, setScheduleDatetime] = useState("");
  const [restrictHoursStart, setRestrictHoursStart] = useState("09:00");
  const [restrictHoursEnd, setRestrictHoursEnd] = useState("18:00");
  const [restrictWeekdays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri

  // Validation report response
  const [draftBroadcastId, setDraftBroadcastId] = useState<string | null>(null);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [dryRunPhone, setDryRunPhone] = useState("");
  const [dryRunResult, setDryRunResult] = useState<string | null>(null);
  const [launchLoading, setLaunchLoading] = useState(false);

  // Preview Row pagination
  const [previewRowIndex, setPreviewRowIndex] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch campaign histories
  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/whatsapp/broadcasts");
      if (res.data.status === "success") {
        setCampaigns(res.data.broadcasts);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to load campaigns.");
    } finally {
      setLoading(false);
    }
  };

  const [workerMetrics, setWorkerMetrics] = useState<any | null>(null);

  const fetchWorkerMetrics = async () => {
    try {
      const res = await axios.get("/api/whatsapp/broadcasts/worker/metrics");
      if (res.data.status === "success") {
        setWorkerMetrics(res.data.metrics);
      }
    } catch {}
  };

  useEffect(() => {
    fetchCampaigns();
    fetchWorkerMetrics();
    const interval = setInterval(fetchWorkerMetrics, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleEmergencyStopCampaign = async (id: string) => {
    try {
      await axios.post(`/api/whatsapp/broadcasts/${id}/stop`);
      fetchCampaignDetails(id);
      fetchCampaigns();
    } catch (err) {
      console.error(err);
    }
  };

  // Fetch campaign details & live analytics (Refinement 9)
  const fetchCampaignDetails = async (id: string) => {
    try {
      const res = await axios.get(`/api/whatsapp/broadcasts/${id}`);
      if (res.data.status === "success") {
        setDetailCampaign(res.data.campaign);
        setDetailAnalytics(res.data.analytics);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    let interval: any;
    if (selectedCampaignId) {
      fetchCampaignDetails(selectedCampaignId);
      interval = setInterval(() => {
        fetchCampaignDetails(selectedCampaignId);
      }, 5000); // Live poll stats every 5s if active
    }
    return () => clearInterval(interval);
  }, [selectedCampaignId]);

  // CSV Client Side Parsing Loop (Refinement 3)
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/);
      if (lines.length === 0) return;

      // Extract Headers
      const headers = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, ""));
      setCsvHeaders(headers);

      // Extract Rows
      const rows: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cells = line.split(",").map(c => c.trim().replace(/^["']|["']$/g, ""));
        const rowObj: Record<string, string> = {};
        headers.forEach((header, idx) => {
          rowObj[header] = cells[idx] || "";
        });
        rows.push(rowObj);
      }

      setCsvData(rows);
      
      // Auto mapping matches
      const phoneMatch = headers.find(h => /phone|mobile|num/i.test(h)) || "";
      const nameMatch = headers.find(h => /name|contact/i.test(h)) || "";
      const villageMatch = headers.find(h => /village|town|city/i.test(h)) || "";

      setMappedPhoneCol(phoneMatch || headers[0]);
      setMappedNameCol(nameMatch || headers[1] || headers[0]);
      setMappedVillageCol(villageMatch);

      setWizardStep(3); // Auto proceed to step 3 field mapping!
    };
    reader.readAsText(file);
  };

  // Multiple media attachments uploads (Refinement 10)
  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    Array.from(files).forEach(f => {
      formData.append("files[]", f);
    });

    try {
      const res = await axios.post("/api/whatsapp/media/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      if (res.data.status === "success") {
        setAttachments(prev => [...prev, ...res.data.files]);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "File upload failed.");
    }
  };

  // Compile variable substitutions for local step preview (Refinement 4)
  const renderPreviewText = () => {
    if (csvData.length === 0 || !csvData[previewRowIndex]) return templateText;
    const row = csvData[previewRowIndex];
    let compiled = templateText;
    csvHeaders.forEach(header => {
      compiled = compiled.replace(new RegExp(`\\{\\{${header}\\}\\}`, "gi"), row[header] || "");
    });
    return compiled;
  };

  // validation submit to backend (Step 8: Review)
  const handleValidateCampaign = async () => {
    setLoading(true);
    try {
      const payload = {
        title: campaignTitle,
        recipients: csvData,
        mappedFields: {
          phoneColumn: mappedPhoneCol,
          nameColumn: mappedNameCol,
          villageColumn: mappedVillageCol
        },
        templateBody: templateText,
        mediaAttachments: attachments,
        sendingRules: {
          randomDelayMin: rulesMinDelay,
          randomDelayMax: rulesMaxDelay,
          batchSize: rulesBatchSize,
          batchPauseSeconds: rulesBatchPause,
          maxMessagesPerHour: rulesMaxPerHour,
          maxMessagesPerDay: rulesMaxPerDay,
          restrictHoursStart,
          restrictHoursEnd,
          restrictWeekdays
        },
        scheduledAt: scheduleMode === "scheduled" ? scheduleDatetime : null
      };

      const res = await axios.post("/api/whatsapp/broadcasts", payload);
      if (res.data.status === "success") {
        setDraftBroadcastId(res.data.broadcastId);
        setValidationReport(res.data.validationReport);
        setWizardStep(8); // Proceed to final review step!
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Validation check failed.");
    } finally {
      setLoading(false);
    }
  };

  // Trigger Dry Run Send (Refinement 11)
  const handleTriggerDryRun = async () => {
    if (!draftBroadcastId || !dryRunPhone) return;
    setDryRunResult(null);
    try {
      const res = await axios.post(`/api/whatsapp/broadcasts/${draftBroadcastId}/dry-run`, {
        phone: dryRunPhone
      });
      if (res.data.status === "success") {
        setDryRunResult("Dry-run preview message sent! Check your WhatsApp.");
      }
    } catch (err: any) {
      setDryRunResult(`Failed: ${err.response?.data?.message || err.message}`);
    }
  };

  // Final launch campaign action
  const handleLaunchCampaign = async () => {
    if (!draftBroadcastId) return;
    setLaunchLoading(true);
    try {
      const res = await axios.post(`/api/whatsapp/broadcasts/${draftBroadcastId}/launch`);
      if (res.data.status === "success") {
        setActiveTab("list");
        fetchCampaigns();
        // Reset states
        setCampaignTitle("");
        setCsvData([]);
        setCsvHeaders([]);
        setTemplateText("");
        setAttachments([]);
        setWizardStep(1);
        setValidationReport(null);
        setDraftBroadcastId(null);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Launch dispatch failed.");
    } finally {
      setLaunchLoading(false);
    }
  };

  // Campaign Pause / Resume controls (Refinement 8)
  const handlePauseCampaign = async (id: string) => {
    try {
      await axios.post(`/api/whatsapp/broadcasts/${id}/pause`);
      fetchCampaignDetails(id);
      fetchCampaigns();
    } catch (err) {
      console.error(err);
    }
  };

  const handleResumeCampaign = async (id: string) => {
    try {
      await axios.post(`/api/whatsapp/broadcasts/${id}/resume`);
      fetchCampaignDetails(id);
      fetchCampaigns();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRetryFailedCampaign = async (id: string) => {
    try {
      await axios.post(`/api/whatsapp/broadcasts/${id}/retry-failed`);
      fetchCampaignDetails(id);
      fetchCampaigns();
    } catch (err) {
      console.error(err);
    }
  };

  // Download validator rejected CSV entries
  const downloadRejectedCSV = () => {
    if (!validationReport || validationReport.rejectedRows.length === 0) return;
    const rows = validationReport.rejectedRows;
    const headers = Object.keys(rows[0]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(r => headers.map(h => `"${r[h] || ""}"`).join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "rejected_recipients_report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatHours = (seconds: number) => {
    if (seconds <= 0) return "Not active";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} mins`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours} hrs ${mins} mins`;
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar navigation list */}
      <div className="w-80 bg-white border-r border-line flex flex-col h-full shrink-0">
        <div className="p-4 border-b border-line">
          <h1 className="text-xl font-bold text-ink mb-3">Broadcast Manager</h1>
          <div className="flex gap-2">
            <button
              onClick={() => { setActiveTab("list"); setSelectedCampaignId(null); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all ${
                activeTab === "list" && !selectedCampaignId
                  ? "bg-accent text-white border-accent"
                  : "bg-slate-50 text-muted border-line hover:bg-slate-100"
              }`}
            >
              Campaigns
            </button>
            <button
              onClick={() => setActiveTab("wizard")}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all ${
                activeTab === "wizard"
                  ? "bg-accent text-white border-accent animate-pulse"
                  : "bg-slate-50 text-muted border-line hover:bg-slate-100"
              }`}
            >
              + New wizard
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {loading && campaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400 mb-1" />
              <p className="text-xs">Loading campaign logs...</p>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted">
              No broadcast campaigns found.
            </div>
          ) : (
            campaigns.map((camp) => {
              const isSelected = selectedCampaignId === camp.id;
              const successRate = camp.total_queued > 0 
                ? Math.round((camp.sent_count / camp.total_queued) * 100) 
                : 0;

              return (
                <div
                  key={camp.id}
                  onClick={() => { setSelectedCampaignId(camp.id); setActiveTab("list"); }}
                  className={`p-4 cursor-pointer transition-all hover:bg-slate-50 ${
                    isSelected ? "bg-slate-100/80 border-l-4 border-accent" : ""
                  }`}
                >
                  <div className="flex justify-between items-baseline mb-1">
                    <h3 className="font-semibold text-sm text-ink truncate max-w-[150px]">{camp.title}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      camp.status === "RUNNING" ? "bg-success/15 text-success animate-pulse" :
                      camp.status === "COMPLETED" ? "bg-blue-150 text-accent" :
                      camp.status === "PAUSED" ? "bg-warning/15 text-warning" : "bg-slate-100 text-muted"
                    }`}>
                      {camp.status}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] text-muted mb-2">
                    <span>Recipients: {camp.total_queued}</span>
                    <span>Sent: {camp.sent_count} ({successRate}%)</span>
                  </div>

                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden border border-line">
                    <div className="bg-accent h-full transition-all" style={{ width: `${successRate}%` }}></div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Worker Diagnostics Card (Refinement 8) */}
        {workerMetrics && (
          <div className="p-4 border-t border-line bg-slate-50 text-left text-[11px] text-muted space-y-2 select-none shrink-0">
            <h4 className="font-bold text-ink uppercase tracking-wider text-[9px] flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-accent shrink-0" /> Queue worker diagnostics
            </h4>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1">
              <div>Uptime: <strong className="text-ink">{workerMetrics.worker_uptime}</strong></div>
              <div>Depth: <strong className="text-ink">{workerMetrics.queue_depth} jobs</strong></div>
              <div>Sent: <strong className="text-ink">{workerMetrics.messages_sent}</strong></div>
              <div>Failed: <strong className="text-ink">{workerMetrics.messages_failed}</strong></div>
              <div className="col-span-2">Avg latency: <strong className="text-ink">{workerMetrics.average_send_time_ms} ms</strong></div>
            </div>
          </div>
        )}
      </div>

      {/* Main View Area */}
      <div className="flex-1 flex flex-col h-full bg-[#f7f9fa] overflow-y-auto">
        {activeTab === "list" && selectedCampaignId && detailCampaign && (
          /* Detailed Analytics Dashboard Dashboard (Refinement 9) */
          <div className="p-8 max-w-4xl mx-auto w-full space-y-6">
            <div className="bg-white p-6 border border-line rounded-2xl shadow-sm flex justify-between items-center text-left">
              <div>
                <h1 className="text-xl font-bold text-ink mb-1">{detailCampaign.title}</h1>
                <p className="text-xs text-muted">Created at {new Date(detailCampaign.createdAt).toLocaleString()}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                    detailCampaign.status === "RUNNING" ? "bg-success/15 text-success" :
                    detailCampaign.status === "COMPLETED" ? "bg-blue-150 text-accent" :
                    detailCampaign.status === "PAUSED" ? "bg-warning/15 text-warning" : "bg-slate-100 text-muted"
                  }`}>
                    {detailCampaign.status}
                  </span>
                  {detailCampaign.scheduledAt && (
                    <span className="text-xs text-muted flex items-center gap-1 font-medium">
                      <Calendar className="w-3.5 h-3.5" /> Scheduled: {new Date(detailCampaign.scheduledAt).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>

              {/* Action queue controls */}
              <div className="flex gap-2">
                {detailCampaign.status === "RUNNING" && (
                  <button
                    onClick={() => handlePauseCampaign(detailCampaign.id)}
                    className="flex items-center gap-1.5 px-4 py-2 border border-warning/30 text-warning bg-warning/5 rounded-xl hover:bg-warning/10 text-xs font-bold transition-all shadow-sm"
                  >
                    <Pause className="w-4 h-4" /> Pause Campaign
                  </button>
                )}
                {detailCampaign.status === "PAUSED" && (
                  <button
                    onClick={() => handleResumeCampaign(detailCampaign.id)}
                    className="flex items-center gap-1.5 px-4 py-2 border border-success/30 text-success bg-success/5 rounded-xl hover:bg-success/10 text-xs font-bold transition-all shadow-sm"
                  >
                    <Play className="w-4 h-4" /> Resume Campaign
                  </button>
                )}
                 {detailAnalytics?.failed > 0 && (
                  <button
                    type="button"
                    onClick={() => handleRetryFailedCampaign(detailCampaign.id)}
                    className="flex items-center gap-1.5 px-4 py-2 border border-accent text-accent bg-white rounded-xl hover:bg-slate-50 text-xs font-bold transition-all shadow-sm"
                  >
                    <RotateCcw className="w-4 h-4" /> Retry Failed Only
                  </button>
                )}
                {(detailCampaign.status === "RUNNING" || detailCampaign.status === "PAUSED") && (
                  <button
                    type="button"
                    onClick={() => handleEmergencyStopCampaign(detailCampaign.id)}
                    className="flex items-center gap-1.5 px-4 py-2 border border-danger/30 text-danger bg-danger/5 rounded-xl hover:bg-danger/10 text-xs font-bold transition-all shadow-sm"
                  >
                    Emergency Stop
                  </button>
                )}
              </div>
            </div>

            {/* Numeric Analytics Counters */}
            {detailAnalytics && (
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-white p-5 border border-line rounded-2xl shadow-sm text-left">
                  <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Recipients</div>
                  <div className="text-2xl font-bold text-ink">{detailAnalytics.totalRecipients}</div>
                </div>
                <div className="bg-white p-5 border border-line rounded-2xl shadow-sm text-left">
                  <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Sent Successfully</div>
                  <div className="text-2xl font-bold text-success">{detailAnalytics.sent}</div>
                </div>
                <div className="bg-white p-5 border border-line rounded-2xl shadow-sm text-left">
                  <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Failed</div>
                  <div className="text-2xl font-bold text-danger">{detailAnalytics.failed}</div>
                </div>
                <div className="bg-white p-5 border border-line rounded-2xl shadow-sm text-left">
                  <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Pending</div>
                  <div className="text-2xl font-bold text-slate-400">{detailAnalytics.pending}</div>
                </div>
              </div>
            )}

            {/* Campaign Progress Gauge */}
            {detailAnalytics && (
              <div className="bg-white p-6 border border-line rounded-2xl shadow-sm space-y-4 text-left">
                <div className="flex justify-between items-baseline">
                  <h3 className="font-semibold text-sm text-ink">Progress status Rate</h3>
                  <span className="text-xs text-muted font-bold">{detailAnalytics.successPercentage}% completed</span>
                </div>
                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden border border-line">
                  <div className="bg-accent h-full transition-all" style={{ width: `${detailAnalytics.successPercentage}%` }}></div>
                </div>

                <div className="grid grid-cols-2 gap-6 pt-3 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted" />
                    <div>
                      <span className="text-muted">Estimated Completion Time: </span>
                      <strong className="text-ink">{formatHours(detailAnalytics.etaCompletionSeconds)}</strong>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted">Average Send Rate: </span>
                    <strong className="text-ink">~ 1 message every {((detailCampaign.sendingRules.randomDelayMin + detailCampaign.sendingRules.randomDelayMax)/2).toFixed(0)}s</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Template review */}
            <div className="bg-white p-6 border border-line rounded-2xl shadow-sm text-left space-y-3">
              <h3 className="font-bold text-sm text-ink">Campaign Body Content</h3>
              <div className="p-4 bg-[#f8fafc] rounded-xl border border-line font-mono text-xs whitespace-pre-wrap break-words">
                {detailCampaign.templateBody}
              </div>
              {detailCampaign.mediaAttachments.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <span className="text-[10px] font-bold text-muted uppercase">Attachments</span>
                  <div className="flex flex-wrap gap-2">
                    {detailCampaign.mediaAttachments.map((m: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-line rounded-xl text-xs">
                        <FileText className="w-4.5 h-4.5 text-accent" />
                        <span className="truncate max-w-[120px] font-medium">{m.filename}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Wizard Multi-Step Guided Workflow UI */}
        {activeTab === "wizard" && (
          <div className="p-8 max-w-2xl mx-auto w-full space-y-6">
            {/* Steps Timeline Header bar */}
            <div className="flex items-center justify-between bg-white px-4 py-3 border border-line rounded-2xl shadow-sm text-xs font-semibold text-muted select-none">
              <div className={`flex items-center gap-1.5 ${wizardStep === 1 ? "text-accent font-bold" : ""}`}>
                <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px]">1</span>
                Title
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              <div className={`flex items-center gap-1.5 ${wizardStep === 2 || wizardStep === 3 ? "text-accent font-bold" : ""}`}>
                <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px]">2</span>
                CSV Parse
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              <div className={`flex items-center gap-1.5 ${wizardStep === 4 ? "text-accent font-bold" : ""}`}>
                <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px]">3</span>
                Compose
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              <div className={`flex items-center gap-1.5 ${wizardStep === 5 ? "text-accent font-bold" : ""}`}>
                <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px]">4</span>
                Preview
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              <div className={`flex items-center gap-1.5 ${wizardStep === 6 || wizardStep === 7 ? "text-accent font-bold" : ""}`}>
                <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px]">5</span>
                Rules
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              <div className={`flex items-center gap-1.5 ${wizardStep === 8 ? "text-accent font-bold" : ""}`}>
                <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px]">6</span>
                Launch
              </div>
            </div>

            {/* Error banners */}
            {error && (
              <div className="bg-danger/10 border border-danger/20 text-danger text-xs font-semibold p-3.5 rounded-xl flex items-center gap-2 text-left">
                <AlertCircle className="w-4 h-4 text-danger shrink-0" /> {error}
              </div>
            )}

            {/* STEP 1: Campaign Title details */}
            {wizardStep === 1 && (
              <div className="bg-white p-6 border border-line rounded-2xl shadow-sm text-left space-y-4">
                <div>
                  <h2 className="text-base font-bold text-ink mb-1">Define Campaign Title</h2>
                  <p className="text-xs text-muted">Enter a clear metadata title to identifier this broadcast in records.</p>
                </div>
                <input
                  type="text"
                  placeholder="e.g. Winter Sale Promo 2026"
                  value={campaignTitle}
                  onChange={(e) => setCampaignTitle(e.target.value)}
                  className="w-full px-4 py-3 text-sm bg-slate-50 border border-line rounded-xl focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setWizardStep(2)}
                    disabled={!campaignTitle.trim()}
                    className="px-5 py-2.5 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1 transition-all"
                  >
                    Select Recipients <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Import CSV File */}
            {wizardStep === 2 && (
              <div className="bg-white p-6 border border-line rounded-2xl shadow-sm text-left space-y-4">
                <div>
                  <h2 className="text-base font-bold text-ink mb-1">Upload Contacts list</h2>
                  <p className="text-xs text-muted">Select a comma-separated CSV list file matching phone variables.</p>
                </div>
                
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 hover:border-accent m-2 p-8 rounded-2xl flex flex-col items-center justify-center bg-slate-50 cursor-pointer transition-all"
                >
                  <Upload className="w-10 h-10 text-muted mb-2" />
                  <span className="text-xs font-semibold text-ink">Click here to upload CSV list</span>
                  <span className="text-[10px] text-muted mt-1">Columns must contain contact phone values</span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleCSVUpload}
                  className="hidden"
                />

                <div className="flex justify-between pt-2">
                  <button
                    onClick={() => setWizardStep(1)}
                    className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-muted border border-line text-xs font-bold rounded-xl flex items-center gap-1 transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: CSV Column Field Mapping */}
            {wizardStep === 3 && (
              <div className="bg-white p-6 border border-line rounded-2xl shadow-sm text-left space-y-4">
                <div>
                  <h2 className="text-base font-bold text-ink mb-1">CSV Header Mapping</h2>
                  <p className="text-xs text-muted">Map your target fields to custom CSV columns parsed from your file.</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-muted uppercase block mb-1">Phone Column (Required)</label>
                    <select
                      value={mappedPhoneCol}
                      onChange={(e) => setMappedPhoneCol(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-line rounded-xl focus:outline-none"
                    >
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted uppercase block mb-1">Name Column</label>
                    <select
                      value={mappedNameCol}
                      onChange={(e) => setMappedNameCol(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-line rounded-xl focus:outline-none"
                    >
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted uppercase block mb-1">Village/City Column</label>
                    <select
                      value={mappedVillageCol}
                      onChange={(e) => setMappedVillageCol(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-line rounded-xl focus:outline-none"
                    >
                      <option value="">-- No map --</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex justify-between pt-2">
                  <button
                    onClick={() => setWizardStep(2)}
                    className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-muted border border-line text-xs font-bold rounded-xl flex items-center gap-1 transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    onClick={() => setWizardStep(4)}
                    disabled={!mappedPhoneCol}
                    className="px-5 py-2.5 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1 transition-all"
                  >
                    Compose Message <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: Compose Template Message */}
            {wizardStep === 4 && (
              <div className="bg-white p-6 border border-line rounded-2xl shadow-sm text-left space-y-4">
                <div>
                  <h2 className="text-base font-bold text-ink mb-1">Compose Message Template</h2>
                  <p className="text-xs text-muted">Use double brackets to insert custom headers. e.g. `Hi {"{{name}}"}`.</p>
                </div>

                <div className="flex gap-1.5 flex-wrap">
                  {csvHeaders.map(h => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setTemplateText(prev => prev + ` {{${h}}}`)}
                      className="px-2 py-1 bg-slate-50 hover:bg-slate-100 border border-line text-[10px] font-bold rounded-lg text-muted transition-all"
                    >
                      + {h}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={5}
                  placeholder="Hello {{name}}, view details..."
                  value={templateText}
                  onChange={(e) => setTemplateText(e.target.value)}
                  className="w-full px-4 py-3 text-sm bg-slate-50 border border-line rounded-xl focus:outline-none focus:ring-1 focus:ring-accent font-mono"
                />

                {/* Attachments */}
                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-muted uppercase">Upload Attachments (Images, PDFs)</span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs text-accent font-bold hover:underline"
                    >
                      + Add File
                    </button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleMediaUpload}
                    className="hidden"
                  />

                  {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {attachments.map((m, idx) => (
                        <div key={idx} className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 border border-line rounded-xl text-xs text-ink shadow-sm relative">
                          <FileText className="w-4 h-4 text-accent" />
                          <span className="truncate max-w-[100px]">{m.filename}</span>
                          <button
                            type="button"
                            onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                            className="text-muted hover:text-danger ml-1"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-between pt-2">
                  <button
                    onClick={() => setWizardStep(3)}
                    className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-muted border border-line text-xs font-bold rounded-xl flex items-center gap-1 transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    onClick={() => setWizardStep(5)}
                    disabled={!templateText.trim()}
                    className="px-5 py-2.5 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1 transition-all"
                  >
                    Preview Substitutions <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 5: Substitution Preview Panel */}
            {wizardStep === 5 && (
              <div className="bg-white p-6 border border-line rounded-2xl shadow-sm text-left space-y-4">
                <div>
                  <h2 className="text-base font-bold text-ink mb-1">Variable Substitution Preview</h2>
                  <p className="text-xs text-muted">Verify how variables compile with real rows parsed from your uploaded CSV.</p>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-line space-y-4">
                  <div className="flex justify-between items-center text-xs border-b border-slate-200 pb-2">
                    <span className="text-muted">Previewing recipient row: <strong>{previewRowIndex + 1}</strong> of {csvData.length}</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setPreviewRowIndex(idx => Math.max(idx - 1, 0))}
                        disabled={previewRowIndex === 0}
                        className="p-1 border border-line bg-white hover:bg-slate-50 disabled:opacity-40 rounded-lg text-ink"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewRowIndex(idx => Math.min(idx + 1, csvData.length - 1))}
                        disabled={previewRowIndex === csvData.length - 1}
                        className="p-1 border border-line bg-white hover:bg-slate-50 disabled:opacity-40 rounded-lg text-ink"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-muted uppercase">Phone Target</span>
                    <div className="text-xs font-mono">+{csvData[previewRowIndex]?.[mappedPhoneCol]}</div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-muted uppercase">Compiled Text Body</span>
                    <div className="p-3 bg-white border border-line rounded-xl text-xs whitespace-pre-wrap break-words leading-relaxed">
                      {renderPreviewText()}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between pt-2">
                  <button
                    onClick={() => setWizardStep(4)}
                    className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-muted border border-line text-xs font-bold rounded-xl flex items-center gap-1 transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    onClick={() => setWizardStep(6)}
                    className="px-5 py-2.5 bg-accent hover:bg-accent/90 text-white text-xs font-bold rounded-xl flex items-center gap-1 transition-all"
                  >
                    Configure Rules <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 6: Safe Sending Delay Rules */}
            {wizardStep === 6 && (
              <div className="bg-white p-6 border border-line rounded-2xl shadow-sm text-left space-y-4">
                <div>
                  <h2 className="text-base font-bold text-ink mb-1">Safe Sending & Delay Rules</h2>
                  <p className="text-xs text-muted">Setup delay and batch rules to ensure account safety during broadcast.</p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="text-[10px] font-bold text-muted uppercase block mb-1">Min Random Delay (seconds)</label>
                    <input
                      type="number"
                      value={rulesMinDelay}
                      onChange={(e) => setRulesMinDelay(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-50 border border-line rounded-xl focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted uppercase block mb-1">Max Random Delay (seconds)</label>
                    <input
                      type="number"
                      value={rulesMaxDelay}
                      onChange={(e) => setRulesMaxDelay(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-50 border border-line rounded-xl focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted uppercase block mb-1">Batch Size (messages)</label>
                    <input
                      type="number"
                      value={rulesBatchSize}
                      onChange={(e) => setRulesBatchSize(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-50 border border-line rounded-xl focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted uppercase block mb-1">Pause Between Batches (seconds)</label>
                    <input
                      type="number"
                      value={rulesBatchPause}
                      onChange={(e) => setRulesBatchPause(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-50 border border-line rounded-xl focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted uppercase block mb-1">Max Messages Per Hour</label>
                    <input
                      type="number"
                      value={rulesMaxPerHour}
                      onChange={(e) => setRulesMaxPerHour(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-50 border border-line rounded-xl focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted uppercase block mb-1">Max Messages Per Day</label>
                    <input
                      type="number"
                      value={rulesMaxPerDay}
                      onChange={(e) => setRulesMaxPerDay(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-50 border border-line rounded-xl focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-between pt-2">
                  <button
                    onClick={() => setWizardStep(5)}
                    className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-muted border border-line text-xs font-bold rounded-xl flex items-center gap-1 transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    onClick={() => setWizardStep(7)}
                    className="px-5 py-2.5 bg-accent hover:bg-accent/90 text-white text-xs font-bold rounded-xl flex items-center gap-1 transition-all"
                  >
                    Scheduling Settings <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 7: Scheduling settings */}
            {wizardStep === 7 && (
              <div className="bg-white p-6 border border-line rounded-2xl shadow-sm text-left space-y-4">
                <div>
                  <h2 className="text-base font-bold text-ink mb-1">Schedule & Hours Limits</h2>
                  <p className="text-xs text-muted">Choose campaign launch timings and restrict delivery to business hours.</p>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 font-semibold">
                      <input
                        type="radio"
                        name="scheduleMode"
                        checked={scheduleMode === "immediate"}
                        onChange={() => setScheduleMode("immediate")}
                      />
                      Send Immediately
                    </label>
                    <label className="flex items-center gap-2 font-semibold">
                      <input
                        type="radio"
                        name="scheduleMode"
                        checked={scheduleMode === "scheduled"}
                        onChange={() => setScheduleMode("scheduled")}
                      />
                      Schedule at date/time
                    </label>
                  </div>

                  {scheduleMode === "scheduled" && (
                    <div>
                      <label className="text-[10px] font-bold text-muted uppercase block mb-1">Target DateTime</label>
                      <input
                        type="datetime-local"
                        value={scheduleDatetime}
                        onChange={(e) => setScheduleDatetime(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-line rounded-xl focus:outline-none"
                      />
                    </div>
                  )}

                  <div className="border-t border-slate-100 pt-3 space-y-3">
                    <h4 className="font-bold text-ink">Business Hours Filter</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-muted uppercase block mb-1">Start Hour</label>
                        <input
                          type="time"
                          value={restrictHoursStart}
                          onChange={(e) => setRestrictHoursStart(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-line rounded-xl focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-muted uppercase block mb-1">End Hour</label>
                        <input
                          type="time"
                          value={restrictHoursEnd}
                          onChange={(e) => setRestrictHoursEnd(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-line rounded-xl focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between pt-2">
                  <button
                    onClick={() => setWizardStep(6)}
                    className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-muted border border-line text-xs font-bold rounded-xl flex items-center gap-1 transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    onClick={handleValidateCampaign}
                    className="px-5 py-2.5 bg-accent hover:bg-accent/90 text-white text-xs font-bold rounded-xl flex items-center gap-1 transition-all"
                  >
                    Run Validations <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 8: Validation Report Review & Dry Run Launch */}
            {wizardStep === 8 && validationReport && (
              <div className="bg-white p-6 border border-line rounded-2xl shadow-sm text-left space-y-5">
                <div>
                  <h2 className="text-base font-bold text-ink mb-1">Final validation Report</h2>
                  <p className="text-xs text-muted">Review parsed rows statistics and trigger dry-runs before launch.</p>
                </div>

                <div className="grid grid-cols-5 gap-2.5 text-center text-xs">
                  <div className="bg-slate-50 p-3 rounded-xl border border-line">
                    <div className="font-bold text-ink">{validationReport.totalRows}</div>
                    <span className="text-[9px] text-muted uppercase">Total rows</span>
                  </div>
                  <div className="bg-success/5 p-3 rounded-xl border border-success/20">
                    <div className="font-bold text-success">{validationReport.validCount}</div>
                    <span className="text-[9px] text-success/80 uppercase">Valid</span>
                  </div>
                  <div className="bg-danger/5 p-3 rounded-xl border border-danger/20">
                    <div className="font-bold text-danger">{validationReport.invalidCount}</div>
                    <span className="text-[9px] text-danger/80 uppercase">Invalid</span>
                  </div>
                  <div className="bg-warning/5 p-3 rounded-xl border border-warning/20">
                    <div className="font-bold text-warning">{validationReport.duplicateCount}</div>
                    <span className="text-[9px] text-warning/80 uppercase">Duplicates</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-line">
                    <div className="font-bold text-slate-400">{validationReport.emptyCount}</div>
                    <span className="text-[9px] text-muted uppercase">Empty</span>
                  </div>
                </div>

                {/* Rejected downloads banner */}
                {validationReport.rejectedRows.length > 0 && (
                  <div className="p-3.5 bg-warning/5 border border-warning/20 rounded-xl flex items-center justify-between gap-3 text-xs text-warning">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <AlertTriangle className="w-4.5 h-4.5 text-warning shrink-0" />
                      Found {validationReport.rejectedRows.length} rejected contacts.
                    </span>
                    <button
                      type="button"
                      onClick={downloadRejectedCSV}
                      className="px-3 py-1.5 bg-white border border-warning/30 hover:bg-warning/10 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" /> Download Rejected Rows
                    </button>
                  </div>
                )}

                {/* Dry Run Form panel */}
                <div className="p-4 bg-slate-50 border border-line rounded-xl space-y-3">
                  <div className="text-xs font-semibold text-ink flex items-center gap-1">
                    <Info className="w-4 h-4 text-accent" /> Run Campaign dry-run first
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. 919876543210 (Preview phone)"
                      value={dryRunPhone}
                      onChange={(e) => setDryRunPhone(e.target.value)}
                      className="flex-1 px-3 py-2 text-xs bg-white border border-line rounded-xl focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleTriggerDryRun}
                      className="px-4 py-2 bg-white border border-accent hover:bg-slate-50 text-accent text-xs font-bold rounded-xl transition-all"
                    >
                      Send only to me
                    </button>
                  </div>
                  {dryRunResult && (
                    <div className="text-[10px] text-accent font-semibold">{dryRunResult}</div>
                  )}
                </div>

                <div className="flex justify-between pt-3 border-t border-slate-100">
                  <button
                    onClick={() => setWizardStep(7)}
                    className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-muted border border-line text-xs font-bold rounded-xl flex items-center gap-1 transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    onClick={handleLaunchCampaign}
                    disabled={launchLoading || validationReport.validCount === 0}
                    className="px-6 py-2.5 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md"
                  >
                    {launchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 ml-0.5" />}
                    Launch Broadcast Campaign
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CrmBroadcasts;
