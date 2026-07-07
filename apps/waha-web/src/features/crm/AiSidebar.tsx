import React, { useState, useEffect } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import { 
  Brain, ThumbsUp, ThumbsDown, Copy, Calendar, Tag, 
  Sparkles, CheckSquare, Clock, Loader2, RefreshCw 
} from "lucide-react";

interface AiSidebarProps {
  chatId: string;
}

export const AiSidebar: React.FC<AiSidebarProps> = ({ chatId }) => {
  const [intelligence, setIntelligence] = useState<any | null>(null);
  const [replies, setReplies] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<Record<string, "liked" | "disliked" | null>>({});
  const [activeReplyStyle, setActiveReplyStyle] = useState<"professional" | "friendly" | "short" | "detailed">("professional");

  // Fetch existing intelligence and suggestions
  const fetchAiData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/ai/analyze/${chatId}`);
      if (res.data.status === "success") {
        setIntelligence(res.data.intelligence);
      }
    } catch (err) {
      console.error("Failed to load AI intelligence", err);
    } finally {
      setLoading(false);
    }
  };

  const generateReplies = async () => {
    setRepliesLoading(true);
    try {
      const res = await axios.post("/api/ai/reply", { chatId });
      if (res.data.status === "success") {
        setReplies(res.data.replies);
      }
    } catch (err) {
      console.error("Failed to compile suggested replies", err);
    } finally {
      setRepliesLoading(false);
    }
  };

  const triggerAsyncAnalysis = async () => {
    setLoading(true);
    try {
      await axios.post("/api/ai/analyze", { chatId });
      // The Socket.IO subscription will update the view once completed
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const handleFeedback = async (style: string, generatedText: string, type: "LIKE" | "DISLIKE") => {
    try {
      await axios.post("/api/ai/feedback", {
        chatId,
        promptKey: `REPLY_${style.toUpperCase()}`,
        generatedText,
        feedbackType: type,
        comment: "Agent submission from CRM"
      });
      setFeedbackStatus(prev => ({
        ...prev,
        [style]: type === "LIKE" ? "liked" : "disliked"
      }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  useEffect(() => {
    fetchAiData();
    setReplies(null);
    setFeedbackStatus({});

    // Setup Socket.IO dynamic subscription
    const socket = io("http://localhost:3000"); // Standard API backend URL
    
    socket.on("conversation.intelligence", (data: any) => {
      if (data.chatId === chatId) {
        setIntelligence(data.intelligence);
        setLoading(false);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [chatId]);

  return (
    <div className="w-80 bg-white border-l border-line h-full flex flex-col shrink-0 select-none text-left">
      {/* Header */}
      <div className="p-4 border-b border-line flex items-center justify-between bg-slate-50/50">
        <h3 className="font-bold text-sm text-ink flex items-center gap-2">
          <Brain className="w-4.5 h-4.5 text-accent animate-pulse" /> AI Assistant Insights
        </h3>
        <button
          onClick={fetchAiData}
          title="Refresh Insights"
          className="p-1.5 text-muted hover:text-ink hover:bg-slate-100 rounded-lg transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Scrollable Contents */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted">
            <Loader2 className="w-8 h-8 animate-spin text-accent mb-2" />
            <p className="text-xs font-medium">Extracting semantic facts...</p>
          </div>
        ) : !intelligence ? (
          <div className="text-center py-8 space-y-3">
            <Sparkles className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-xs text-muted max-w-[200px] mx-auto">
              No conversational insights analyzed for this chat thread yet.
            </p>
            <button
              onClick={triggerAsyncAnalysis}
              className="px-4 py-2 bg-accent hover:bg-accent/90 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
            >
              Run AI Analysis
            </button>
          </div>
        ) : (
          <>
            {/* Summary & Priority */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-line space-y-2">
              <div className="flex justify-between items-center">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                  intelligence.priority === "HIGH" ? "bg-danger/15 text-danger animate-pulse" :
                  intelligence.priority === "MEDIUM" ? "bg-warning/15 text-warning" : "bg-slate-200 text-muted"
                }`}>
                  {intelligence.priority} Priority
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                  intelligence.sentiment === "POSITIVE" ? "bg-success/15 text-success" :
                  intelligence.sentiment === "NEGATIVE" ? "bg-danger/15 text-danger" : "bg-slate-200 text-muted"
                }`}>
                  {intelligence.sentiment} sentiment
                </span>
              </div>
              <p className="text-xs text-ink font-medium leading-relaxed">
                {intelligence.summary}
              </p>
            </div>

            {/* Core Extracted Metadata */}
            <div className="space-y-2.5 text-xs text-muted">
              <h4 className="font-bold text-ink uppercase tracking-wider text-[10px]">Extracted Metadata</h4>
              
              {intelligence.intent && (
                <div className="flex items-center gap-2">
                  <Tag className="w-3.5 h-3.5 shrink-0" />
                  <span>Intent: <strong className="text-ink">{intelligence.intent}</strong></span>
                </div>
              )}
              {intelligence.productInterest && (
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 shrink-0 text-accent" />
                  <span>Interest: <strong className="text-ink">{intelligence.productInterest}</strong></span>
                </div>
              )}
              {intelligence.followUpDate && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  <span>Follow Up: <strong className="text-ink">{new Date(intelligence.followUpDate).toLocaleDateString()}</strong></span>
                </div>
              )}
              {intelligence.decisionMaker && (
                <div className="flex items-center gap-2">
                  <CheckSquare className="w-3.5 h-3.5 shrink-0" />
                  <span>Decision Maker: <strong className="text-ink">{intelligence.decisionMaker}</strong></span>
                </div>
              )}
              {intelligence.language && (
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>Language: <strong className="text-ink">{intelligence.language}</strong></span>
                </div>
              )}
            </div>

            {/* Opportunities Alerts */}
            {(intelligence.governmentOpportunity || intelligence.fundingOpportunity) && (
              <div className="bg-blue-150/20 border border-accent/25 p-3 rounded-xl space-y-1.5 text-xs">
                <h4 className="font-bold text-accent uppercase tracking-wider text-[9px]">Leads Opportunities</h4>
                {intelligence.governmentOpportunity && (
                  <div className="text-ink font-semibold flex items-center gap-1">🏛️ Government Enquiry</div>
                )}
                {intelligence.fundingOpportunity && (
                  <div className="text-ink font-semibold flex items-center gap-1">💰 Funding / Loan Enquiry</div>
                )}
              </div>
            )}

            {/* Knowledge Extraction List (Refinement 8) */}
            {intelligence.knowledgeFacts?.length > 0 && (
              <div className="space-y-2 text-xs">
                <h4 className="font-bold text-ink uppercase tracking-wider text-[10px]">Knowledge facts</h4>
                <ul className="space-y-1.5 list-disc pl-4 text-muted leading-relaxed">
                  {intelligence.knowledgeFacts.map((fact: string, idx: number) => (
                    <li key={idx}><span className="text-ink">{fact}</span></li>
                  ))}
                </ul>
              </div>
            )}

            {/* Keywords */}
            {intelligence.keywords?.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="font-bold text-ink uppercase tracking-wider text-[10px]">Keywords</h4>
                <div className="flex flex-wrap gap-1">
                  {intelligence.keywords.map((key: string, idx: number) => (
                    <span key={idx} className="bg-slate-100 text-muted px-2 py-0.5 rounded-full text-[10px] font-semibold border border-line">
                      #{key}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Divider */}
        <hr className="border-line" />

        {/* Suggested Replies Card Section */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="font-bold text-ink uppercase tracking-wider text-[10px]">Suggested Replies</h4>
            {!replies && !repliesLoading && (
              <button
                onClick={generateReplies}
                className="text-[10px] text-accent hover:underline font-bold"
              >
                Draft suggested replies
              </button>
            )}
          </div>

          {repliesLoading ? (
            <div className="flex items-center justify-center py-6 text-center text-muted">
              <Loader2 className="w-5 h-5 animate-spin text-accent mr-1.5" />
              <span className="text-xs">Drafting response styles...</span>
            </div>
          ) : replies ? (
            <div className="space-y-2.5">
              {/* Tones Selection */}
              <div className="flex bg-slate-100 p-0.5 rounded-lg text-[10px] font-semibold">
                {(["professional", "friendly", "short", "detailed"] as const).map((style) => (
                  <button
                    key={style}
                    onClick={() => setActiveReplyStyle(style)}
                    className={`flex-1 py-1 rounded-md uppercase transition-all ${
                      activeReplyStyle === style
                        ? "bg-white text-ink shadow-sm"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>

              {/* Suggestion Card Content */}
              <div className="p-3 bg-slate-50 border border-line rounded-xl space-y-3">
                <p className="text-xs text-ink leading-relaxed select-text italic">
                  "{replies[activeReplyStyle]}"
                </p>

                <div className="flex justify-between items-center">
                  <button
                    onClick={() => handleCopyToClipboard(replies[activeReplyStyle])}
                    className="flex items-center gap-1 text-[10px] text-accent hover:underline font-bold"
                  >
                    <Copy className="w-3 h-3" /> Copy Reply
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleFeedback(activeReplyStyle, replies[activeReplyStyle], "LIKE")}
                      disabled={feedbackStatus[activeReplyStyle] !== undefined}
                      className={`p-1 hover:bg-slate-200 rounded-lg transition-all ${
                        feedbackStatus[activeReplyStyle] === "liked" ? "text-success bg-success/15" : "text-muted"
                      }`}
                      title="Helpful reply suggestion"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleFeedback(activeReplyStyle, replies[activeReplyStyle], "DISLIKE")}
                      disabled={feedbackStatus[activeReplyStyle] !== undefined}
                      className={`p-1 hover:bg-slate-200 rounded-lg transition-all ${
                        feedbackStatus[activeReplyStyle] === "disliked" ? "text-danger bg-danger/15" : "text-muted"
                      }`}
                      title="Unhelpful reply suggestion"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-muted text-center py-4 bg-slate-50 rounded-xl border border-dashed border-line">
              Click draft suggested replies to auto-generate styled template drafts.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
