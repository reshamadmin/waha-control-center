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
  AlertCircle 
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

interface Message {
  id: string;
  chat_id: string;
  direction: "inbound" | "outbound";
  body: string;
  status: "sending" | "sent" | "delivered" | "read" | "failed";
  sent_at: string;
}

export const CrmInbox = () => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [chatCursor, setChatCursor] = useState<string | null>(null);
  const [msgCursor, setMsgCursor] = useState<string | null>(null);
  const [hasMoreChats, setHasMoreChats] = useState(true);
  const [hasMoreMsgs, setHasMoreMsgs] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Draft mapping cache per conversation
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [messageInput, setMessageInput] = useState("");
  const [sendLoading, setSendLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const socketRef = useRef<any>(null);

  // 1. Fetch Chats (Cursor pagination + Search)
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

  // Trigger search with delay debouncer
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchChats(true, null);
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, fetchChats]);

  // 2. Fetch Messages for active chat (Cursor pagination)
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
          // Store height before adding older messages
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

  // 3. Mark Chat as Read
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

  // Switch Active Chat
  const handleChatSelect = (chat: Chat) => {
    if (activeChat) {
      setDrafts(prev => ({ ...prev, [activeChat.id]: messageInput }));
    }

    setActiveChat(chat);
    fetchMessages(chat.id, true, null);
    markChatAsRead(chat.id);

    setMessageInput(drafts[chat.id] || "");
  };

  // 4. Send Message via Outbound endpoint
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChat || !messageInput.trim() || sendLoading) return;

    setSendLoading(true);
    setError(null);

    const tempMsgId = `temp_${Date.now()}`;
    const outboundText = messageInput.trim();

    const optimisticMessage: Message = {
      id: tempMsgId,
      chat_id: activeChat.id,
      direction: "outbound",
      body: outboundText,
      status: "sending",
      sent_at: new Date().toISOString()
    };

    setMessages(prev => [...prev, optimisticMessage]);
    setMessageInput("");
    setDrafts(prev => ({ ...prev, [activeChat.id]: "" }));

    try {
      const res = await axios.post("/api/whatsapp/messages", {
        chatId: activeChat.id,
        body: outboundText
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
                last_message_preview: outboundText
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

  // 5. Scroll control hooks
  useEffect(() => {
    if (messagesEndRef.current && prevScrollHeightRef.current === 0) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    } else if (messagesContainerRef.current && prevScrollHeightRef.current > 0) {
      const container = messagesContainerRef.current;
      container.scrollTop = container.scrollHeight - prevScrollHeightRef.current;
      prevScrollHeightRef.current = 0;
    }
  }, [messages]);

  // Load previous messages on top scroll
  const handleScroll = () => {
    if (!messagesContainerRef.current || messagesLoading || !hasMoreMsgs || !activeChat) return;

    const container = messagesContainerRef.current;
    if (container.scrollTop === 0) {
      fetchMessages(activeChat.id, false, msgCursor);
    }
  };

  // 6. Connect Socket.IO for real-time inbox synchronization
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
              last_message_preview: message.body,
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
            sent_at: message.sentAt || message.sent_at
          }];
        });
        markChatAsRead(chatId);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [activeChat]);

  // Format date helper
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const renderStatus = (status: string) => {
    if (status === "sending") return <Clock className="w-3.5 h-3.5 text-muted animate-pulse" />;
    if (status === "sent") return <Check className="w-3.5 h-3.5 text-muted" />;
    if (status === "delivered") return <CheckCheck className="w-3.5 h-3.5 text-muted" />;
    if (status === "read") return <CheckCheck className="w-3.5 h-3.5 text-success font-bold" />;
    if (status === "failed") return <AlertCircle className="w-3.5 h-3.5 text-danger" />;
    return null;
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
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
                      <p className="text-xs text-muted truncate">
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
      <div className="flex-1 flex flex-col h-full bg-white relative">
        {activeChat ? (
          <>
            {/* Thread Header */}
            <div className="px-6 py-4 border-b border-line bg-white flex justify-between items-center shadow-sm z-10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold text-sm uppercase">
                  {activeChat.contact_name.substring(0, 2)}
                </div>
                <div>
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
                        className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-2xl p-3 text-sm shadow-sm relative ${
                            isOutbound
                              ? "bg-accent text-white rounded-br-none"
                              : "bg-white text-ink rounded-bl-none border border-line"
                          }`}
                        >
                          <div className="whitespace-pre-wrap break-words leading-relaxed">
                            {msg.body}
                          </div>
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

            {/* Text Composer Form */}
            <form
              onSubmit={handleSendMessage}
              className="p-4 border-t border-line bg-white flex gap-3 items-center shrink-0 z-10"
            >
              <input
                type="text"
                placeholder={`Type a draft for ${activeChat.contact_name}...`}
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                className="flex-1 px-4 py-3 text-sm bg-slate-50 border border-line rounded-xl focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="submit"
                disabled={!messageInput.trim() || sendLoading}
                className="p-3 bg-accent text-white hover:bg-accent/90 disabled:opacity-40 rounded-xl transition-all shadow-sm"
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
    </div>
  );
};

export default CrmInbox;
