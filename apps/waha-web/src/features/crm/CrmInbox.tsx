import React, { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import axios from "axios";
import { 
  Send, 
  Search, 
  Check, 
  CheckCheck, 
  Clock, 
  Loader2, 
  MessageSquare, 
  AlertCircle,
  Paperclip,
  FileText,
  Play,
  Pause,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  X,
  XCircle,
  RefreshCw,
  Sparkles
} from "lucide-react";

axios.defaults.baseURL = "http://localhost:3002";
axios.defaults.withCredentials = true;

interface Chat {
  id: string;
  waha_chat_id: string;
  contact_phone: string;
  contact_name: string;
  last_message_at: string;
  last_message_preview: string;
  unread_count: number;
}

interface MediaFile {
  id?: string;
  url: string;
  thumbnailUrl?: string;
  mimeType: string;
  filename: string;
  filesize: number;
  width?: number;
  height?: number;
  duration?: number;
  checksum?: string;
}

interface Message {
  id: string;
  chat_id: string;
  direction: "inbound" | "outbound";
  body: string;
  status: "sending" | "sent" | "delivered" | "read" | "failed";
  sent_at: string;
  media?: MediaFile[];
}

interface Template {
  id: string;
  title: string;
  category: string;
  body: string;
  variables: string;
}

interface UploadTask {
  id: string;
  filename: string;
  file: File;
  progress: number;
  status: "uploading" | "completed" | "failed";
  uploadedMedia?: MediaFile;
  error?: string;
}

interface ConversationDraft {
  text: string;
  uploads: UploadTask[];
  showTemplates: boolean;
}

export const CrmInbox = () => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  
  const [chatCursor, setChatCursor] = useState<string | null>(null);
  const [msgCursor, setMsgCursor] = useState<string | null>(null);
  const [hasMoreChats, setHasMoreChats] = useState(true);
  const [hasMoreMsgs, setHasMoreMsgs] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // State for Draft Caching per conversation (Refinement 10)
  const [drafts, setDrafts] = useState<Record<string, ConversationDraft>>({});
  const [messageInput, setMessageInput] = useState("");
  const [queuedUploads, setQueuedUploads] = useState<UploadTask[]>([]);
  const [showTemplatesDropdown, setShowTemplatesDropdown] = useState(false);

  const [sendLoading, setSendLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Lightbox Media Viewer State (Refinement 9)
  const [lightboxMedia, setLightboxMedia] = useState<MediaFile | null>(null);
  const [lightboxScale, setLightboxScale] = useState(1);
  const [lightboxRotate, setLightboxRotate] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const socketRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Fetch Templates (Refinement 3)
  const fetchTemplates = useCallback(async () => {
    try {
      const res = await axios.get("/api/whatsapp/templates");
      if (res.data.status === "success") {
        setTemplates(res.data.templates);
      }
    } catch (err) {
      console.error("Failed to load message templates:", err);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // 2. Fetch Chats (Cursor pagination + Search)
  const fetchChats = useCallback(async (isInitial = true, currentCursor: string | null = null) => {
    if (isInitial) setChatsLoading(true);
    try {
      const res = await axios.get("/api/whatsapp/chats", {
        params: {
          cursor: currentCursor,
          search: searchQuery.trim() || undefined,
          limit: 20
        }
      });

      if (res.data.status === "success") {
        const loadedChats = res.data.chats;
        setChats(prev => isInitial ? loadedChats : [...prev, ...loadedChats]);
        setChatCursor(res.data.nextCursor);
        setHasMoreChats(loadedChats.length === 20 && !!res.data.nextCursor);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to load chats.");
    } finally {
      setChatsLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchChats(true, null);
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, fetchChats]);

  // 3. Fetch Messages for active chat (Cursor pagination)
  const fetchMessages = useCallback(async (chatId: string, isInitial = true, currentCursor: string | null = null) => {
    if (isInitial) {
      setMessagesLoading(true);
      setMessages([]);
    }
    try {
      const res = await axios.get(`/api/whatsapp/chats/${chatId}/messages`, {
        params: {
          cursor: currentCursor,
          limit: 50
        }
      });

      if (res.data.status === "success") {
        const loadedMsgs = res.data.messages;
        
        if (messagesContainerRef.current) {
          prevScrollHeightRef.current = messagesContainerRef.current.scrollHeight;
        }

        setMessages(prev => {
          return isInitial ? loadedMsgs.reverse() : [...loadedMsgs.reverse(), ...prev];
        });

        setMsgCursor(res.data.nextCursor);
        setHasMoreMsgs(loadedMsgs.length === 50 && !!res.data.nextCursor);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to load messages.");
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  const markChatAsRead = async (chatId: string) => {
    try {
      await axios.post(`/api/whatsapp/chats/${chatId}/read`);
      setChats(prev =>
        prev.map(c => (c.id === chatId ? { ...c, unread_count: 0 } : c))
      );
    } catch (err) {
      console.error("Failed to mark chat as read:", err);
    }
  };

  // Switch Active Chat & Cache Drafts (Refinement 10)
  const handleChatSelect = (chat: Chat) => {
    if (activeChat) {
      setDrafts(prev => ({
        ...prev,
        [activeChat.id]: {
          text: messageInput,
          uploads: queuedUploads,
          showTemplates: showTemplatesDropdown
        }
      }));
    }

    setActiveChat(chat);
    fetchMessages(chat.id, true, null);
    markChatAsRead(chat.id);

    // Restore cached drafts
    const draft = drafts[chat.id] || { text: "", uploads: [], showTemplates: false };
    setMessageInput(draft.text);
    setQueuedUploads(draft.uploads);
    setShowTemplatesDropdown(draft.showTemplates);
  };

  // 4. File Upload Handler (Refinement 1: files[] array uploading with progress indicators)
  const uploadSingleTask = async (task: UploadTask) => {
    const formData = new FormData();
    formData.append("files[]", task.file);

    setQueuedUploads(prev => 
      prev.map(t => t.id === task.id ? { ...t, status: "uploading", progress: 0 } : t)
    );

    try {
      const res = await axios.post("/api/whatsapp/media/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setQueuedUploads(prev => 
            prev.map(t => t.id === task.id ? { ...t, progress: percentCompleted } : t)
          );
        }
      });

      if (res.data.status === "success" && res.data.files.length > 0) {
        const uploadedMedia = res.data.files[0];
        setQueuedUploads(prev => 
          prev.map(t => t.id === task.id ? { ...t, status: "completed", uploadedMedia } : t)
        );
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.message || "Upload failed.";
      setQueuedUploads(prev => 
        prev.map(t => t.id === task.id ? { ...t, status: "failed", error: errMsg } : t)
      );
    }
  };

  const processSelectedFiles = (fileList: FileList) => {
    const tasks: UploadTask[] = Array.from(fileList).map(file => ({
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      filename: file.name,
      file,
      progress: 0,
      status: "uploading"
    }));

    setQueuedUploads(prev => [...prev, ...tasks]);
    tasks.forEach(uploadSingleTask);
  };

  // Drag and Drop (Refinement 9)
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSelectedFiles(e.dataTransfer.files);
    }
  };

  // Clipboard Paste Intercept (Refinement 9)
  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      e.preventDefault();
      processSelectedFiles(e.clipboardData.files);
    }
  };

  const handleRemoveTask = (taskId: string) => {
    setQueuedUploads(prev => prev.filter(t => t.id !== taskId));
  };

  // 5. Send Message (Refinement 2: Support rich media tables mapping)
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChat || sendLoading) return;

    const hasMedia = queuedUploads.some(t => t.status === "completed");
    const outboundText = messageInput.trim();

    if (!outboundText && !hasMedia) return;

    setSendLoading(true);
    setError(null);

    const completedMedia = queuedUploads
      .filter(t => t.status === "completed" && t.uploadedMedia)
      .map(t => t.uploadedMedia) as MediaFile[];

    // Optimistic UI Append
    const tempMsgId = `temp_${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempMsgId,
      chat_id: activeChat.id,
      direction: "outbound",
      body: outboundText,
      status: "sending",
      sent_at: new Date().toISOString(),
      media: completedMedia
    };

    setMessages(prev => [...prev, optimisticMessage]);
    setMessageInput("");
    setQueuedUploads([]);
    setDrafts(prev => ({
      ...prev,
      [activeChat.id]: { text: "", uploads: [], showTemplates: false }
    }));

    try {
      const res = await axios.post("/api/whatsapp/messages", {
        chatId: activeChat.id,
        body: outboundText,
        media: completedMedia
      });

      if (res.data.status === "success") {
        const realMessage = res.data.message;
        setMessages(prev =>
          prev.map(m => (m.id === tempMsgId ? realMessage : m))
        );
        setChats(prev => {
          const matched = prev.find(c => c.id === activeChat.id);
          const filtered = prev.filter(c => c.id !== activeChat.id);
          if (matched) {
            return [
              {
                ...matched,
                last_message_at: realMessage.sent_at,
                last_message_preview: outboundText || "Media Attachment"
              },
              ...filtered
            ];
          }
          return prev;
        });
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to deliver message.");
      setMessages(prev =>
        prev.map(m => (m.id === tempMsgId ? { ...m, status: "failed" } : m))
      );
    } finally {
      setSendLoading(false);
    }
  };

  // Template Quick Reply Selector Action
  const handleSelectTemplate = (tmpl: Template) => {
    if (!activeChat) return;
    // Replace variables in templates
    let compiled = tmpl.body;
    compiled = compiled.replace(/\{\{name\}\}/gi, activeChat.contact_name);
    compiled = compiled.replace(/\{\{phone\}\}/gi, activeChat.contact_phone);
    setMessageInput(compiled);
    setShowTemplatesDropdown(false);
  };

  // Keyboard Slash-Quick Command Listeners
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setMessageInput(val);
    if (val.startsWith("/")) {
      setShowTemplatesDropdown(true);
    } else {
      setShowTemplatesDropdown(false);
    }
  };

  // Scroll viewport bounds check
  useEffect(() => {
    if (messagesEndRef.current && prevScrollHeightRef.current === 0) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    } else if (messagesContainerRef.current && prevScrollHeightRef.current > 0) {
      const container = messagesContainerRef.current;
      container.scrollTop = container.scrollHeight - prevScrollHeightRef.current;
      prevScrollHeightRef.current = 0;
    }
  }, [messages]);

  const handleScroll = () => {
    if (!messagesContainerRef.current || messagesLoading || !hasMoreMsgs || !activeChat) return;

    const container = messagesContainerRef.current;
    if (container.scrollTop === 0) {
      fetchMessages(activeChat.id, false, msgCursor);
    }
  };

  // Connect Socket.IO
  useEffect(() => {
    const socket = io("http://localhost:3002", {
      withCredentials: true,
      transports: ["websocket", "polling"]
    });
    socketRef.current = socket;

    socket.on("whatsapp:message", (data: any) => {
      const { chatId, message, chat } = data;

      setChats(prev => {
        const match = prev.find(c => c.id === chatId);
        const rest = prev.filter(c => c.id !== chatId);
        
        if (match) {
          const isCurrentActive = activeChat && activeChat.id === chatId;
          return [
            {
              ...match,
              last_message_at: message.sentAt || message.sent_at,
              last_message_preview: message.body || "Media Attachment",
              unread_count: isCurrentActive ? 0 : match.unread_count + 1
            },
            ...rest
          ];
        } else {
          return [
            {
              id: chatId,
              waha_chat_id: chat.wahaChatId || `${chat.contactPhone}@c.us`,
              contact_phone: chat.contactPhone,
              contact_name: chat.contactName,
              last_message_at: chat.lastMessageAt,
              last_message_preview: chat.lastMessagePreview,
              unread_count: activeChat && activeChat.id === chatId ? 0 : 1
            },
            ...prev
          ];
        }
      });

      if (activeChat && activeChat.id === chatId) {
        setMessages(prev => {
          if (prev.some(m => m.id === message.id)) return prev;
          return [...prev, {
            id: message.id,
            chat_id: message.chatId,
            direction: message.direction,
            body: message.body,
            status: message.status,
            sent_at: message.sentAt || message.sent_at,
            media: message.media
          }];
        });
        markChatAsRead(chatId);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [activeChat]);

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const renderStatus = (status: string) => {
    if (status === "sending") return <Clock className="w-3.5 h-3.5 text-white/70 animate-pulse" />;
    if (status === "sent") return <Check className="w-3.5 h-3.5 text-white/70" />;
    if (status === "delivered") return <CheckCheck className="w-3.5 h-3.5 text-white/70" />;
    if (status === "read") return <CheckCheck className="w-3.5 h-3.5 text-emerald-300 font-bold" />;
    if (status === "failed") return <AlertCircle className="w-3.5 h-3.5 text-red-300 animate-bounce" />;
    return null;
  };

  // Custom Audio speed player component (Refinement 9)
  const CustomAudioPlayer = ({ media }: { media: MediaFile }) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState<number>(1);

    const togglePlay = () => {
      if (!audioRef.current) return;
      if (playing) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setPlaying(!playing);
    };

    const handleSpeedChange = () => {
      if (!audioRef.current) return;
      const nextSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
      setSpeed(nextSpeed);
      audioRef.current.playbackRate = nextSpeed;
    };

    return (
      <div className="flex items-center gap-3 p-3 bg-slate-100 rounded-xl max-w-sm border border-line text-ink">
        <button
          onClick={togglePlay}
          className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center shadow-sm shrink-0"
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
        <audio
          ref={audioRef}
          src={media.url}
          onEnded={() => setPlaying(false)}
          className="hidden"
        />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold truncate">{media.filename}</div>
          <div className="text-[10px] text-muted">Voice Audio File • {(media.filesize / 1024).toFixed(1)} KB</div>
        </div>
        <button
          onClick={handleSpeedChange}
          className="px-2 py-1 bg-white border border-line text-[10px] font-bold rounded-lg shrink-0 transition-all hover:bg-slate-50"
        >
          {speed}x
        </button>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden" onPaste={handlePaste}>
      {/* Column 1: Chats Feed Sidebar */}
      <div className="w-80 bg-white border-r border-line flex flex-col h-full shrink-0">
        <div className="p-4 border-b border-line">
          <h1 className="text-xl font-bold text-ink mb-3">Chats Inbox</h1>
          <div className="relative">
            <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search name, phone, text..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-line rounded-xl focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {chatsLoading && chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted">
              <Loader2 className="w-6 h-6 animate-spin mb-2 text-slate-400" />
              <p className="text-xs">Loading conversations...</p>
            </div>
          ) : chats.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">
              No conversation threads found.
            </div>
          ) : (
            <>
              {chats.map((chat) => {
                const isActive = activeChat?.id === chat.id;
                return (
                  <div
                    key={chat.id}
                    onClick={() => handleChatSelect(chat)}
                    className={`p-4 cursor-pointer transition-all hover:bg-slate-50 flex gap-3 items-start ${
                      isActive ? "bg-slate-100/80 border-l-4 border-accent" : ""
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm shrink-0 uppercase">
                      {chat.contact_name.substring(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <h3 className="font-semibold text-sm text-ink truncate">
                          {chat.contact_name}
                        </h3>
                        <span className="text-[10px] text-muted whitespace-nowrap">
                          {formatTime(chat.last_message_at)}
                        </span>
                      </div>
                      <p className="text-xs text-muted truncate text-left">
                        {chat.last_message_preview || "No messages yet"}
                      </p>
                    </div>
                    {chat.unread_count > 0 && (
                      <span className="bg-danger text-white text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 animate-pulse">
                        {chat.unread_count}
                      </span>
                    )}
                  </div>
                );
              })}

              {hasMoreChats && (
                <button
                  onClick={() => fetchChats(false, chatCursor)}
                  className="w-full py-3 text-xs text-accent hover:bg-slate-50 font-medium transition-all text-center block"
                >
                  Load More Chats
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Column 2: Active Chat View Thread & Composer */}
      <div 
        className="flex-1 flex flex-col h-full bg-white relative"
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
      >
        {/* Drag and Drop Backdrop Trigger */}
        {dragActive && (
          <div className="absolute inset-0 bg-accent/10 border-4 border-dashed border-accent m-4 rounded-2xl flex flex-col items-center justify-center text-accent z-50 pointer-events-none transition-all">
            <Paperclip className="w-12 h-12 mb-3 animate-bounce" />
            <h3 className="text-lg font-bold">Drop files to upload</h3>
            <p className="text-sm opacity-80">Images, PDFs, documents, audio, video</p>
          </div>
        )}

        {activeChat ? (
          <>
            {/* Thread Header */}
            <div className="px-6 py-4 border-b border-line bg-white flex justify-between items-center shadow-sm z-10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold text-sm uppercase">
                  {activeChat.contact_name.substring(0, 2)}
                </div>
                <div className="text-left">
                  <h2 className="font-bold text-sm text-ink">{activeChat.contact_name}</h2>
                  <p className="text-xs text-muted">+{activeChat.contact_phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-success rounded-full animate-ping"></span>
                <span className="text-xs font-semibold text-success">Live Synchronization Active</span>
              </div>
            </div>

            {/* Messages Scroll Area */}
            <div
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-6 bg-[#f7f9fa] space-y-4"
            >
              {messagesLoading && messages.length === 0 ? (
                <div className="flex justify-center p-4">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : (
                <>
                  {hasMoreMsgs && (
                    <div className="text-center p-2 text-xs text-muted font-medium">
                      Scroll up to load older messages
                    </div>
                  )}

                  {messages.map((msg) => {
                    const isOutbound = msg.direction === "outbound";
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isOutbound ? "items-end" : "items-start"}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-2xl p-3 text-sm shadow-sm relative text-left ${
                            isOutbound
                              ? "bg-accent text-white rounded-br-none"
                              : "bg-white text-ink rounded-bl-none border border-line"
                          }`}
                        >
                          {/* 1. Media Rendering blocks (Refinement 9) */}
                          {msg.media && msg.media.length > 0 && (
                            <div className="mb-2 space-y-2">
                              {msg.media.map((media) => {
                                if (media.mimeType.startsWith("image/")) {
                                  return (
                                    <div 
                                      key={media.url} 
                                      className="relative rounded-xl overflow-hidden cursor-pointer group shadow-sm border border-line bg-slate-50"
                                      onClick={() => {
                                        setLightboxMedia(media);
                                        setLightboxScale(1);
                                        setLightboxRotate(0);
                                      }}
                                    >
                                      <img
                                        src={media.thumbnailUrl || media.url}
                                        alt={media.filename}
                                        className="max-h-48 object-cover block mx-auto transition-transform group-hover:scale-105"
                                      />
                                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                                        <Maximize2 className="w-5 h-5" />
                                      </div>
                                    </div>
                                  );
                                } else if (media.mimeType.startsWith("video/")) {
                                  return (
                                    <video
                                      key={media.url}
                                      src={media.url}
                                      controls
                                      className="max-h-48 rounded-xl block border border-line bg-black shadow-sm"
                                    />
                                  );
                                } else if (media.mimeType.startsWith("audio/")) {
                                  return (
                                    <CustomAudioPlayer key={media.url} media={media} />
                                  );
                                } else {
                                  // Documents / PDF rendering
                                  return (
                                    <a
                                      key={media.url}
                                      href={media.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center gap-3 p-3 bg-slate-50 border border-line hover:bg-slate-100 rounded-xl max-w-xs transition-all text-ink shadow-sm"
                                    >
                                      <FileText className="w-8 h-8 text-accent shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs font-semibold truncate">{media.filename}</div>
                                        <div className="text-[10px] text-muted">{(media.filesize / 1024).toFixed(1)} KB</div>
                                      </div>
                                    </a>
                                  );
                                }
                              })}
                            </div>
                          )}

                          {msg.body && (
                            <div className="whitespace-pre-wrap break-words leading-relaxed">
                              {msg.body}
                            </div>
                          )}

                          <div
                            className={`flex items-center justify-end gap-1 text-[9px] mt-1.5 ${
                              isOutbound ? "text-white/70" : "text-muted"
                            }`}
                          >
                            <span>{formatTime(msg.sent_at)}</span>
                            {isOutbound && renderStatus(msg.status)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Error notifications */}
            {error && (
              <div className="mx-6 my-2 bg-danger/10 border border-danger/20 text-danger text-xs font-semibold p-2.5 rounded-xl flex items-center gap-2 shrink-0">
                ⚠️ {error}
              </div>
            )}

            {/* Upload Tasks Feed panel */}
            {queuedUploads.length > 0 && (
              <div className="px-6 py-3 border-t border-line bg-slate-50 space-y-2 max-h-36 overflow-y-auto shrink-0 z-10">
                {queuedUploads.map((task) => (
                  <div key={task.id} className="flex items-center justify-between gap-4 bg-white p-2 border border-line rounded-xl shadow-sm text-xs text-ink">
                    <div className="flex items-center gap-2 min-w-0">
                      <Paperclip className="w-4 h-4 text-muted shrink-0" />
                      <span className="font-semibold truncate">{task.filename}</span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {task.status === "uploading" && (
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-slate-100 rounded-full h-1.5 overflow-hidden border border-line">
                            <div className="bg-accent h-full transition-all" style={{ width: `${task.progress}%` }}></div>
                          </div>
                          <span className="font-bold text-[10px] text-muted">{task.progress}%</span>
                        </div>
                      )}
                      {task.status === "completed" && (
                        <span className="text-success font-semibold flex items-center gap-1">✓ Ready</span>
                      )}
                      {task.status === "failed" && (
                        <div className="flex items-center gap-2">
                          <span className="text-danger font-semibold">⚠️ Failed</span>
                          <button
                            type="button"
                            onClick={() => uploadSingleTask(task)}
                            className="p-1 border border-line rounded-lg bg-white hover:bg-slate-50 text-accent transition-all"
                            title="Retry Upload"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemoveTask(task.id)}
                        className="text-muted hover:text-danger transition-all"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Quick Template Command Dropdown (Refinement 3) */}
            {showTemplatesDropdown && templates.length > 0 && (
              <div className="absolute left-6 bottom-20 bg-white border border-line shadow-lg rounded-2xl p-2 max-w-sm max-h-48 overflow-y-auto z-20 space-y-1">
                <div className="text-[10px] text-muted font-bold px-3 py-1 uppercase tracking-wider flex items-center gap-1 border-b border-line mb-1">
                  <Sparkles className="w-3 h-3 text-accent" /> Message Quick replies
                </div>
                {templates
                  .filter(t => t.title.toLowerCase().includes(messageInput.substring(1).toLowerCase()))
                  .map((tmpl) => (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => handleSelectTemplate(tmpl)}
                      className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-slate-100 rounded-lg flex justify-between gap-3 text-ink transition-all"
                    >
                      <span className="text-accent font-semibold">{tmpl.title}</span>
                      <span className="text-muted truncate max-w-[200px]">{tmpl.body}</span>
                    </button>
                  ))}
              </div>
            )}

            {/* Text Composer Form */}
            <form
              onSubmit={handleSendMessage}
              className="p-4 border-t border-line bg-white flex gap-3 items-center shrink-0 z-10"
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-3 border border-line text-muted hover:text-ink rounded-xl hover:bg-slate-50 transition-all shadow-sm"
                title="Attach Files"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(e) => e.target.files && processSelectedFiles(e.target.files)}
                className="hidden"
              />

              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Type a message or '/' for templates..."
                  value={messageInput}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 text-sm bg-slate-50 border border-line rounded-xl focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              <button
                type="submit"
                disabled={(!messageInput.trim() && !queuedUploads.some(t => t.status === "completed")) || sendLoading}
                className="p-3 bg-accent text-white hover:bg-accent/90 disabled:opacity-40 rounded-xl transition-all shadow-sm shrink-0"
              >
                {sendLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50/50">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-slate-400" />
            </div>
            <h2 className="text-lg font-bold text-ink mb-1">No Active Chat</h2>
            <p className="text-sm text-muted max-w-[280px]">
              Select a conversation from the sidebar to view chat logs and send replies.
            </p>
          </div>
        )}
      </div>

      {/* Lightbox Media Fullscreen Modal (Refinement 9) */}
      {lightboxMedia && (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center select-none animate-fade-in text-white">
          <div className="absolute top-6 left-6 text-sm font-semibold truncate max-w-sm">
            {lightboxMedia.filename}
          </div>

          <div className="absolute top-6 right-6 flex items-center gap-3">
            <button
              onClick={() => setLightboxScale(s => Math.min(s + 0.2, 3))}
              className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/10"
              title="Zoom In"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
            <button
              onClick={() => setLightboxScale(s => Math.max(s - 0.2, 0.5))}
              className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/10"
              title="Zoom Out"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <button
              onClick={() => setLightboxRotate(r => r + 90)}
              className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/10"
              title="Rotate 90°"
            >
              <RotateCw className="w-5 h-5" />
            </button>
            <a
              href={lightboxMedia.url}
              download={lightboxMedia.filename}
              target="_blank"
              rel="noreferrer"
              className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/10 flex items-center justify-center"
              title="Download File"
            >
              <Download className="w-5 h-5" />
            </a>
            <button
              onClick={() => setLightboxMedia(null)}
              className="p-2.5 bg-white/20 hover:bg-white/30 text-white rounded-xl transition-all border border-white/20"
              title="Close View"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 max-w-[85vw] max-h-[85vh] overflow-hidden flex items-center justify-center">
            <img
              src={lightboxMedia.url}
              alt={lightboxMedia.filename}
              className="max-h-[80vh] max-w-[80vw] object-contain transition-transform"
              style={{
                transform: `scale(${lightboxScale}) rotate(${lightboxRotate}deg)`,
                transformOrigin: "center center"
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default CrmInbox;
