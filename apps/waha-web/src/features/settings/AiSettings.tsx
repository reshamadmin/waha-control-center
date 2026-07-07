import React, { useState, useEffect } from "react";
import axios from "axios";
import { 
  Sparkles, Sliders, Play, Save, Loader2, 
  CheckCircle2, DollarSign, BarChart3, Database, AlertCircle 
} from "lucide-react";

export const AiSettings: React.FC = () => {
  const [prompts, setPrompts] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any | null>(null);
  
  // Prompt edit states
  const [selectedPromptId, setSelectedPromptId] = useState<string>("");
  const [promptBody, setPromptBody] = useState<string>("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Playpen testing states
  const [sandboxPrompt, setSandboxPrompt] = useState<string>(
    "Extract customer phone number and format it as international digits."
  );
  const [sandboxInput, setSandboxInput] = useState<string>(
    "My phone is +91 98765 43210. Call me soon!"
  );
  const [sandboxOutput, setSandboxOutput] = useState<string>("");
  const [testLoading, setTestLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [promptsRes, metricsRes] = await Promise.all([
        axios.get("/api/ai/prompts"),
        axios.get("/api/ai/usage")
      ]);
      
      if (promptsRes.data.status === "success") {
        setPrompts(promptsRes.data.prompts);
        if (promptsRes.data.prompts.length > 0) {
          const first = promptsRes.data.prompts[0];
          setSelectedPromptId(first.id);
          setPromptBody(first.prompt_body);
        }
      }
      if (metricsRes.data.status === "success") {
        setMetrics(metricsRes.data.usage);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to load AI configurations.");
    } finally {
      setLoading(false);
    }
  };

  const handlePromptSelect = (id: string) => {
    const selected = prompts.find(p => p.id === id);
    if (selected) {
      setSelectedPromptId(id);
      setPromptBody(selected.prompt_body);
      setSaveSuccess(false);
    }
  };

  const handleSavePrompt = async () => {
    setSaveLoading(true);
    setSaveSuccess(false);
    try {
      await axios.put(`/api/ai/prompts/${selectedPromptId}`, { promptBody });
      setSaveSuccess(true);
      // Update local prompts array
      setPrompts(prev => prev.map(p => p.id === selectedPromptId ? { ...p, prompt_body: promptBody } : p));
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to update prompt template.");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleRunSandboxTest = async () => {
    setTestLoading(true);
    setSandboxOutput("");
    try {
      const res = await axios.post("/api/ai/prompts/test", {
        promptText: sandboxPrompt,
        testInput: sandboxInput
      });
      if (res.data.status === "success") {
        setSandboxOutput(res.data.output);
      }
    } catch (err: any) {
      setSandboxOutput(err.response?.data?.message || "Sandbox test failed.");
    } finally {
      setTestLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 select-none text-left">
      <div>
        <h1 className="text-2xl font-bold text-ink mb-1 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-accent" /> AI Conversation Intelligence
        </h1>
        <p className="text-xs text-muted">Configure prompt engineering templates, run sandbox diagnostics tests, and track estimated costs.</p>
      </div>

      {error && (
        <div className="p-4 bg-danger/10 border border-danger/20 text-danger text-xs font-semibold rounded-2xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted">
          <Loader2 className="w-8 h-8 animate-spin text-accent mb-2" />
          <p className="text-xs font-medium">Loading AI metrics...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Column 1 & 2: Prompt Templates & Playpen Sandbox */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Prompt templates panel */}
            <div className="bg-white border border-line rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-bold text-ink flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-accent" /> Prompt Template Library
                </h2>
                {saveSuccess && (
                  <span className="text-[10px] text-success font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Prompt updated!
                  </span>
                )}
              </div>

              <div className="flex gap-4">
                <div className="w-1/3 space-y-1">
                  {prompts.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handlePromptSelect(p.id)}
                      className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all border ${
                        selectedPromptId === p.id
                          ? "bg-accent/5 border-accent/20 text-accent"
                          : "border-transparent text-muted hover:bg-slate-50"
                      }`}
                    >
                      {p.title}
                    </button>
                  ))}
                </div>

                <div className="flex-1 space-y-3">
                  <textarea
                    value={promptBody}
                    onChange={(e) => setPromptBody(e.target.value)}
                    rows={10}
                    className="w-full p-4 bg-slate-50 border border-line rounded-xl text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent font-mono leading-relaxed"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={handleSavePrompt}
                      disabled={saveLoading}
                      className="px-4 py-2 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                    >
                      {saveLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      Save Template
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Prompt Developer Sandbox */}
            <div className="bg-white border border-line rounded-2xl p-6 shadow-sm space-y-4">
              <h2 className="text-sm font-bold text-ink flex items-center gap-1.5">
                <Play className="w-4 h-4 text-accent" /> Prompt testing Sandbox
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Sandbox Prompt</label>
                    <textarea
                      value={sandboxPrompt}
                      onChange={(e) => setSandboxPrompt(e.target.value)}
                      rows={4}
                      className="w-full p-3 bg-slate-50 border border-line rounded-xl text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Test Context Input</label>
                    <textarea
                      value={sandboxInput}
                      onChange={(e) => setSandboxInput(e.target.value)}
                      rows={3}
                      className="w-full p-3 bg-slate-50 border border-line rounded-xl text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={handleRunSandboxTest}
                      disabled={testLoading}
                      className="px-4 py-2 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                    >
                      {testLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                      Run Test
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 flex flex-col h-full">
                  <label className="block text-[10px] font-bold text-muted uppercase tracking-wider">Output JSON / Raw Response</label>
                  <div className="flex-1 p-4 bg-slate-900 border border-slate-800 text-slate-100 rounded-xl font-mono text-xs overflow-y-auto max-h-72 text-left leading-relaxed whitespace-pre-wrap">
                    {testLoading ? "Executing AI analysis..." : sandboxOutput || "Click Run Test to verify response outputs..."}
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Column 3: Token Usage & Cost Aggregates */}
          <div className="space-y-8">
            <div className="bg-white border border-line rounded-2xl p-6 shadow-sm space-y-5">
              <h2 className="text-sm font-bold text-ink flex items-center gap-1.5">
                <BarChart3 className="w-4.5 h-4.5 text-accent" /> Token Costs Diagnostics
              </h2>

              {metrics && metrics.daily?.length > 0 ? (
                <div className="space-y-4">
                  {/* Cost counters */}
                  <div className="p-4 bg-accent/5 border border-accent/15 rounded-xl text-left space-y-2">
                    <div className="text-[10px] font-bold text-muted uppercase tracking-wider flex items-center gap-0.5"><DollarSign className="w-3 h-3 text-accent" /> Estimated Usage Cost</div>
                    <div className="text-3xl font-extrabold text-ink">
                      ${Number(metrics.daily[0]?.total_cost || 0).toFixed(4)}
                      <span className="text-xs text-muted font-semibold ml-1">Today</span>
                    </div>
                  </div>

                  {/* Token details */}
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="p-3 bg-slate-50 border border-line rounded-xl">
                      <div className="font-bold text-muted text-[10px] uppercase mb-1">Total Requests</div>
                      <div className="text-lg font-bold text-ink">{metrics.daily[0]?.total_requests || 0}</div>
                    </div>
                    <div className="p-3 bg-slate-50 border border-line rounded-xl">
                      <div className="font-bold text-muted text-[10px] uppercase mb-1">Avg Latency</div>
                      <div className="text-lg font-bold text-ink">
                        {Math.round(metrics.daily[0]?.avg_latency_ms || 0)} ms
                      </div>
                    </div>
                  </div>

                  {/* Historical Log */}
                  <div className="space-y-2.5 text-left">
                    <h4 className="font-bold text-ink uppercase tracking-wider text-[10px] flex items-center gap-1"><Database className="w-3.5 h-3.5 text-accent" /> 30-Day Cost Logs</h4>
                    <div className="space-y-1.5 divide-y divide-slate-100 max-h-48 overflow-y-auto">
                      {metrics.daily.map((day: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-xs py-2">
                          <span className="font-medium text-muted">{new Date(day.date).toLocaleDateString()}</span>
                          <div className="flex gap-3 font-semibold">
                            <span className="text-muted">{day.total_requests} reqs</span>
                            <span className="text-ink">${Number(day.total_cost).toFixed(4)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted text-center py-12">No AI metrics data logged yet.</p>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
