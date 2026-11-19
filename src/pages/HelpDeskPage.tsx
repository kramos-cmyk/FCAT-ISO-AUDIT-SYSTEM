import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  CheckCircle2,
  LifeBuoy,
  MessageCircle,
  Plus,
  Search,
  Send,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { fmtDateTime, isAuditorRole, roleLabel } from '../lib/format';
import { useRealtimeSubscription, type RealtimeMessage } from '../lib/realtime';
import type {
  DirectMessage,
  DmThreadSummary,
  HelpDeskMessage,
  HelpDeskTicket,
  HelpDeskTicketPriority,
  HelpDeskTicketStatus,
  SessionUser,
} from '../lib/types';
import { useToast } from '../components/Toast';

export interface HelpDeskTarget {
  tab: 'tickets' | 'dm';
  id?: string;
}

const CONCERN_CATEGORIES = [
  'CAR / Audit Clarification',
  'Evidence Upload Issue',
  'Account & Access Support',
  'ISO 9001 Compliance Question',
  'System Technical Issue',
  'General Concern',
];

function ticketStatusClass(status: HelpDeskTicketStatus): string {
  switch (status) {
    case 'Open':
      return 'bg-[#FDECEC] text-[#A32424] border-[#F4C2C2]';
    case 'In Progress':
      return 'bg-[#FBF0D6] text-[#6E5200] border-[#E7CF86]';
    case 'Resolved':
      return 'bg-[#E9F4EC] text-[#255A2D] border-[#C5E0CB]';
    case 'Closed':
      return 'bg-[#F2ECE9] text-[#5C5353] border-[#DFD0CC]';
    default:
      return 'bg-[#F8F4F0] text-[#4A1219] border-[#EAD9D4]';
  }
}

export function HelpDeskPage({
  user,
  target,
  onViewCar,
}: {
  user: SessionUser;
  target?: HelpDeskTarget | null;
  onViewCar: (carNo: string) => void;
}) {
  const { showToast } = useToast();
  const isStaff = isAuditorRole(user.role);
  const [activeTab, setActiveTab] = useState<'tickets' | 'dm'>(target?.tab || 'tickets');

  // Concerns / Tickets state
  const [tickets, setTickets] = useState<HelpDeskTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(
    target?.tab === 'tickets' && target.id ? target.id : null
  );
  const [ticketMessages, setTicketMessages] = useState<HelpDeskMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [ticketFilter, setTicketFilter] = useState<string>('');
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketReply, setTicketReply] = useState('');
  const [sendingTicketReply, setSendingTicketReply] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // New Concern modal state
  const [newOpen, setNewOpen] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newCategory, setNewCategory] = useState(CONCERN_CATEGORIES[0]);
  const [newPriority, setNewPriority] = useState<HelpDeskTicketPriority>('Normal');
  const [newCarNo, setNewCarNo] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [creatingTicket, setCreatingTicket] = useState(false);

  // Direct Messages state
  const [dmThreads, setDmThreads] = useState<DmThreadSummary[]>([]);
  const [dmLoading, setDmLoading] = useState(true);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    target?.tab === 'dm' && target.id ? target.id : null
  );
  const [dmMessages, setDmMessages] = useState<DirectMessage[]>([]);
  const [dmThreadLoading, setDmThreadLoading] = useState(false);
  const [dmSearch, setDmSearch] = useState('');
  const [dmDraft, setDmDraft] = useState('');
  const [sendingDm, setSendingDm] = useState(false);

  const ticketScrollRef = useRef<HTMLDivElement | null>(null);
  const dmScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!target) return;
    setActiveTab(target.tab);
    if (target.tab === 'tickets' && target.id) {
      setSelectedTicketId(target.id);
    } else if (target.tab === 'dm' && target.id) {
      setSelectedContactId(target.id);
    }
  }, [target]);

  const loadTickets = useCallback(async () => {
    setTicketsLoading(true);
    try {
      const list = await api.listHelpDeskTickets();
      setTickets(list || []);
      setSelectedTicketId((prev) => prev || (list && list.length > 0 ? list[0].TicketID : null));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not load Help Desk concerns.', 'error');
    } finally {
      setTicketsLoading(false);
    }
  }, [showToast]);

  const loadDmThreads = useCallback(async () => {
    setDmLoading(true);
    try {
      const list = await api.listDmThreads();
      setDmThreads(list || []);
      setSelectedContactId((prev) => prev || (list && list.length > 0 ? list[0].userId : null));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not load contacts.', 'error');
    } finally {
      setDmLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadTickets();
    loadDmThreads();
  }, [loadTickets, loadDmThreads]);

  // Load selected ticket thread
  useEffect(() => {
    if (!selectedTicketId) {
      setTicketMessages([]);
      return;
    }
    let cancelled = false;
    setMessagesLoading(true);
    api
      .listHelpDeskMessages(selectedTicketId)
      .then((msgs) => {
        if (!cancelled) setTicketMessages(msgs || []);
      })
      .catch(() => {
        if (!cancelled) setTicketMessages([]);
      })
      .finally(() => {
        if (!cancelled) setMessagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTicketId]);

  // Load selected DM conversation only when viewing Direct Messages tab
  useEffect(() => {
    if (activeTab !== 'dm' || !selectedContactId) {
      if (!selectedContactId) setDmMessages([]);
      return;
    }
    let cancelled = false;
    setDmThreadLoading(true);
    api
      .getDmThread(selectedContactId)
      .then((msgs) => {
        if (cancelled) return;
        setDmMessages(msgs || []);
        setDmThreads((prev) =>
          prev.map((t) => (t.userId === selectedContactId ? { ...t, unreadCount: 0 } : t))
        );
      })
      .catch(() => {
        if (!cancelled) setDmMessages([]);
      })
      .finally(() => {
        if (!cancelled) setDmThreadLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, selectedContactId]);

  // Auto-scroll message feeds
  useEffect(() => {
    if (ticketScrollRef.current) {
      ticketScrollRef.current.scrollTop = ticketScrollRef.current.scrollHeight;
    }
  }, [ticketMessages]);

  useEffect(() => {
    if (dmScrollRef.current) {
      dmScrollRef.current.scrollTop = dmScrollRef.current.scrollHeight;
    }
  }, [dmMessages]);

  // Real-time WebSocket event handling
  const handleRealtime = useCallback(
    (evt: RealtimeMessage) => {
      if (evt.type === 'helpdesk:ticket_created') {
        const ticket = evt.payload as HelpDeskTicket;
        if (!ticket?.TicketID) return;
        setTickets((prev) => (prev.some((t) => t.TicketID === ticket.TicketID) ? prev : [ticket, ...prev]));
      } else if (evt.type === 'helpdesk:ticket_updated') {
        const updated = evt.payload as HelpDeskTicket;
        if (!updated?.TicketID) return;
        setTickets((prev) => prev.map((t) => (t.TicketID === updated.TicketID ? updated : t)));
      } else if (evt.type === 'helpdesk:message') {
        const msg = evt.payload as HelpDeskMessage;
        if (!msg?.MessageID) return;
        if (msg.TicketID === selectedTicketId) {
          setTicketMessages((prev) => (prev.some((m) => m.MessageID === msg.MessageID) ? prev : [...prev, msg]));
        }
      } else if (evt.type === 'dm:new') {
        const msg = evt.payload as DirectMessage;
        if (!msg?.MessageID) return;
        const otherId = msg.FromUserID === user.userId ? msg.ToUserID : msg.FromUserID;
        const viewingThisThread = activeTab === 'dm' && selectedContactId === otherId;
        const incomingInOpenThread = viewingThisThread && msg.FromUserID === otherId;

        if (selectedContactId === otherId) {
          const normalizedMsg = incomingInOpenThread ? { ...msg, Read: true } : msg;
          setDmMessages((prev) =>
            prev.some((m) => m.MessageID === normalizedMsg.MessageID) ? prev : [...prev, normalizedMsg]
          );
        }

        if (incomingInOpenThread) {
          api.markDmRead(otherId).catch(() => {});
        }

        setDmThreads((prev) => {
          const updated = prev.map((t) => {
            if (t.userId !== otherId) return t;
            return {
              ...t,
              lastMessage: msg.Message,
              lastAt: msg.CreatedAt,
              lastFromMe: msg.FromUserID === user.userId,
              lastRead: msg.FromUserID === user.userId ? Boolean(msg.Read) : incomingInOpenThread || Boolean(msg.Read),
              unreadCount:
                msg.FromUserID === otherId && !viewingThisThread ? t.unreadCount + 1 : t.unreadCount,
            };
          });
          return updated.sort((a, b) => {
            if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
            if (a.lastAt && b.lastAt) return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime();
            if (a.lastAt) return -1;
            if (b.lastAt) return 1;
            return a.name.localeCompare(b.name);
          });
        });
      } else if (evt.type === 'dm:read') {
        const payload = (evt.payload || {}) as { readerId?: string; otherUserId?: string };
        const readerId = payload.readerId || '';
        if (!readerId) return;

        if (selectedContactId === readerId) {
          setDmMessages((prev) =>
            prev.map((m) =>
              m.FromUserID === user.userId && m.ToUserID === readerId && !m.Read
                ? { ...m, Read: true }
                : m
            )
          );
        }

        setDmThreads((prev) =>
          prev.map((t) => (t.userId === readerId && t.lastFromMe ? { ...t, lastRead: true } : t))
        );
      }
    },
    [activeTab, selectedContactId, selectedTicketId, user.userId]
  );

  useRealtimeSubscription(handleRealtime, true);

  const filteredTickets = useMemo(() => {
    const q = ticketSearch.trim().toLowerCase();
    return tickets.filter((t) => {
      if (ticketFilter && t.Status !== ticketFilter) return false;
      if (q) {
        const hay = [
          t.TicketID,
          t.Subject,
          t.Category,
          t.RelatedCARNo,
          t.CreatedByName,
          t.CreatedByDepartment,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tickets, ticketFilter, ticketSearch]);

  const selectedTicket = useMemo(
    () => tickets.find((t) => t.TicketID === selectedTicketId) || null,
    [tickets, selectedTicketId]
  );

  const filteredContacts = useMemo(() => {
    const q = dmSearch.trim().toLowerCase();
    if (!q) return dmThreads;
    return dmThreads.filter((c) =>
      [c.name, c.email, c.department, c.position, roleLabel(c.role)].join(' ').toLowerCase().includes(q)
    );
  }, [dmThreads, dmSearch]);

  const selectedContact = useMemo(
    () => dmThreads.find((c) => c.userId === selectedContactId) || null,
    [dmThreads, selectedContactId]
  );

  const totalDmUnread = useMemo(
    () => dmThreads.reduce((sum, t) => sum + (t.unreadCount || 0), 0),
    [dmThreads]
  );

  const openTicketCount = useMemo(
    () => tickets.filter((t) => t.Status === 'Open' || t.Status === 'In Progress').length,
    [tickets]
  );

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || !newMessage.trim()) {
      showToast('Please enter both a subject and your concern details.', 'error');
      return;
    }
    setCreatingTicket(true);
    try {
      const res = await api.createHelpDeskTicket({
        subject: newSubject.trim(),
        category: newCategory,
        priority: newPriority,
        relatedCarNo: newCarNo.trim(),
        message: newMessage.trim(),
      });
      if (!res.ok || !res.ticket) {
        showToast(res.error || 'Could not submit concern.', 'error');
        return;
      }
      setTickets((prev) =>
        prev.some((t) => t.TicketID === res.ticket!.TicketID) ? prev : [res.ticket!, ...prev]
      );
      setSelectedTicketId(res.ticket.TicketID);
      if (res.initialMessage) {
        setTicketMessages([res.initialMessage]);
      }
      setNewOpen(false);
      setNewSubject('');
      setNewCarNo('');
      setNewMessage('');
      setNewPriority('Normal');
      showToast(`Concern ${res.ticket.TicketID} submitted.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not submit concern.', 'error');
    } finally {
      setCreatingTicket(false);
    }
  };

  const handleSendTicketReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !ticketReply.trim() || sendingTicketReply) return;
    setSendingTicketReply(true);
    try {
      const res = await api.addHelpDeskMessage(selectedTicket.TicketID, ticketReply.trim());
      if (!res.ok || !res.message) {
        showToast(res.error || 'Could not send reply.', 'error');
        return;
      }
      setTicketMessages((prev) =>
        prev.some((m) => m.MessageID === res.message!.MessageID) ? prev : [...prev, res.message!]
      );
      if (res.ticket) {
        setTickets((prev) => prev.map((t) => (t.TicketID === res.ticket!.TicketID ? res.ticket! : t)));
      }
      setTicketReply('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Reply failed.', 'error');
    } finally {
      setSendingTicketReply(false);
    }
  };

  const handleStatusChange = async (status: HelpDeskTicketStatus) => {
    if (!selectedTicket || updatingStatus) return;
    setUpdatingStatus(true);
    try {
      const res = await api.updateHelpDeskStatus(selectedTicket.TicketID, status);
      if (!res.ok || !res.ticket) {
        showToast(res.error || 'Could not update status.', 'error');
        return;
      }
      setTickets((prev) => prev.map((t) => (t.TicketID === res.ticket!.TicketID ? res.ticket! : t)));
      showToast(`Ticket marked as ${status}.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Status update failed.', 'error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleSendDm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContactId || !dmDraft.trim() || sendingDm) return;
    setSendingDm(true);
    try {
      const res = await api.sendDirectMessage(selectedContactId, dmDraft.trim());
      if (!res.ok || !res.message) {
        showToast(res.error || 'Could not send message.', 'error');
        return;
      }
      setDmMessages((prev) =>
        prev.some((m) => m.MessageID === res.message!.MessageID) ? prev : [...prev, res.message!]
      );
      setDmThreads((prev) =>
        prev.map((t) =>
          t.userId === selectedContactId
            ? {
                ...t,
                lastMessage: res.message!.Message,
                lastAt: res.message!.CreatedAt,
                lastFromMe: true,
                lastRead: false,
              }
            : t
        )
      );
      setDmDraft('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Message failed.', 'error');
    } finally {
      setSendingDm(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header + Sub-tabs */}
      <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#4A1219] m-0 flex items-center gap-2">
              <LifeBuoy className="h-6 w-6 text-[#6B1A25]" />
              Help Desk &amp; Direct Messages
            </h1>
            <p className="text-xs text-[#7A6F6F] mt-1 m-0">
              Submit ISO audit or system concerns to Quality Assurance / Administrators, or chat directly with colleagues in real time.
            </p>
          </div>
          {activeTab === 'tickets' && (
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white font-semibold text-sm px-4 py-2 cursor-pointer whitespace-nowrap self-start sm:self-auto"
            >
              <Plus className="h-4 w-4" />
              New Concern
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-5 border-b border-[#EAD9D4]">
          <button
            type="button"
            onClick={() => setActiveTab('tickets')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer -mb-px ${
              activeTab === 'tickets'
                ? 'border-[#6B1A25] text-[#4A1219] bg-[#FBF7F4] rounded-t-lg'
                : 'border-transparent text-[#7A6F6F] hover:text-[#4A1219]'
            }`}
          >
            <LifeBuoy className="h-4 w-4" />
            Concerns &amp; Tickets
            {openTicketCount > 0 && (
              <span className="text-xs font-mono-tabular px-1.5 py-0.5 rounded bg-[#F4ECE9] text-[#4A1219]">
                {openTicketCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('dm')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer -mb-px ${
              activeTab === 'dm'
                ? 'border-[#6B1A25] text-[#4A1219] bg-[#FBF7F4] rounded-t-lg'
                : 'border-transparent text-[#7A6F6F] hover:text-[#4A1219]'
            }`}
          >
            <MessageCircle className="h-4 w-4" />
            Direct Messages
            {totalDmUnread > 0 && (
              <span className="text-xs font-mono-tabular px-1.5 py-0.5 rounded bg-[#6B1A25] text-white">
                {totalDmUnread}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* TAB 1: CONCERNS & TICKETS */}
      {activeTab === 'tickets' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Ticket List */}
          <div className="lg:col-span-5 bg-white border border-[#EAD9D4] rounded-xl p-4 shadow-sm flex flex-col max-h-[680px]">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="relative flex-1 min-w-[160px]">
                <Search className="h-4 w-4 text-[#7A6F6F] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={ticketSearch}
                  onChange={(e) => setTicketSearch(e.target.value)}
                  placeholder="Search subject, ID, CAR..."
                  className="w-full rounded-lg border border-[#EAD9D4] pl-9 pr-3 py-1.5 text-sm bg-white focus:outline-none focus:border-[#6B1A25]"
                />
              </div>
              <select
                aria-label="Filter concerns by status"
                value={ticketFilter}
                onChange={(e) => setTicketFilter(e.target.value)}
                className="rounded-lg border border-[#EAD9D4] px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:border-[#6B1A25]"
              >
                <option value="">All statuses</option>
                <option value="Open">Open</option>
                <option value="In Progress">In Progress</option>
                <option value="Resolved">Resolved</option>
                <option value="Closed">Closed</option>
              </select>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {ticketsLoading ? (
                <div className="py-12 text-center text-sm text-[#7A6F6F]">Loading concerns...</div>
              ) : filteredTickets.length === 0 ? (
                <div className="py-12 text-center text-sm text-[#7A6F6F]">
                  No concerns found. Click <strong>New Concern</strong> to reach Help Desk.
                </div>
              ) : (
                filteredTickets.map((t) => {
                  const active = t.TicketID === selectedTicketId;
                  return (
                    <button
                      key={t.TicketID}
                      type="button"
                      onClick={() => setSelectedTicketId(t.TicketID)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
                        active
                          ? 'border-[#6B1A25] bg-[#FBF4F2]'
                          : 'border-[#EAD9D4] bg-white hover:bg-[#FCF8F6]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono-tabular text-[11px] font-bold text-[#6B1A25]">
                          {t.TicketID}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {t.Priority === 'Urgent' && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-[#A32424] text-white">
                              Urgent
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 text-[11px] font-semibold rounded border ${ticketStatusClass(
                              t.Status
                            )}`}
                          >
                            {t.Status}
                          </span>
                        </div>
                      </div>
                      <div className="font-semibold text-sm text-[#2B2323] mt-1 line-clamp-1">
                        {t.Subject}
                      </div>
                      <div className="text-xs text-[#7A6F6F] mt-1 flex flex-wrap items-center justify-between gap-1">
                        <span className="truncate">
                          {t.Category}
                          {isStaff ? ` · ${t.CreatedByName}` : ''}
                        </span>
                        <span className="text-[11px] font-mono-tabular">
                          {fmtDateTime(t.UpdatedAt || t.CreatedAt)}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Ticket Conversation Thread */}
          <div className="lg:col-span-7 bg-white border border-[#EAD9D4] rounded-xl shadow-sm flex flex-col h-[680px]">
            {!selectedTicket ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-sm text-[#7A6F6F]">
                <LifeBuoy className="h-10 w-10 text-[#C8B5B0] mb-3" />
                Select a concern from the left to view or reply, or click <strong>New Concern</strong>.
              </div>
            ) : (
              <>
                <div className="p-4 sm:p-5 border-b border-[#EAD9D4] flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono-tabular text-xs font-bold text-[#6B1A25]">
                        {selectedTicket.TicketID}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-xs font-semibold rounded border ${ticketStatusClass(
                          selectedTicket.Status
                        )}`}
                      >
                        {selectedTicket.Status}
                      </span>
                      {selectedTicket.Priority === 'Urgent' && (
                        <span className="px-2 py-0.5 text-xs font-bold rounded bg-[#A32424] text-white">
                          Urgent
                        </span>
                      )}
                      {selectedTicket.RelatedCARNo && (
                        <button
                          type="button"
                          onClick={() => onViewCar(selectedTicket.RelatedCARNo)}
                          className="text-xs font-mono-tabular font-semibold text-[#6B1A25] hover:underline cursor-pointer"
                        >
                          Ref: {selectedTicket.RelatedCARNo}
                        </button>
                      )}
                    </div>
                    <h2 className="text-lg font-bold text-[#4A1219] mt-1 m-0">{selectedTicket.Subject}</h2>
                    <p className="text-xs text-[#7A6F6F] mt-1 m-0">
                      {selectedTicket.Category} · Submitted by{' '}
                      <strong className="text-[#2B2323]">{selectedTicket.CreatedByName}</strong> (
                      {selectedTicket.CreatedByDepartment || roleLabel(selectedTicket.CreatedByRole)}) ·{' '}
                      {fmtDateTime(selectedTicket.CreatedAt)}
                    </p>
                  </div>

                  {isStaff && (
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {selectedTicket.Status !== 'In Progress' && selectedTicket.Status !== 'Closed' && (
                        <button
                          type="button"
                          disabled={updatingStatus}
                          onClick={() => handleStatusChange('In Progress')}
                          className="px-2.5 py-1 text-xs font-semibold rounded-md border border-[#E7CF86] bg-[#FBF0D6] text-[#6E5200] hover:bg-[#F5E3B3] cursor-pointer disabled:opacity-50"
                        >
                          In Progress
                        </button>
                      )}
                      {selectedTicket.Status !== 'Resolved' && (
                        <button
                          type="button"
                          disabled={updatingStatus}
                          onClick={() => handleStatusChange('Resolved')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md bg-[#2F6D39] hover:bg-[#255A2D] text-white cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Resolve
                        </button>
                      )}
                      {selectedTicket.Status !== 'Closed' ? (
                        <button
                          type="button"
                          disabled={updatingStatus}
                          onClick={() => handleStatusChange('Closed')}
                          className="px-2.5 py-1 text-xs font-semibold rounded-md border border-[#EAD9D4] hover:border-[#6B1A25] text-[#4A1219] cursor-pointer disabled:opacity-50"
                        >
                          Close
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={updatingStatus}
                          onClick={() => handleStatusChange('Open')}
                          className="px-2.5 py-1 text-xs font-semibold rounded-md border border-[#EAD9D4] hover:border-[#6B1A25] text-[#4A1219] cursor-pointer disabled:opacity-50"
                        >
                          Reopen
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div ref={ticketScrollRef} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-[#FBF7F4]">
                  {messagesLoading ? (
                    <div className="py-8 text-center text-sm text-[#7A6F6F]">Loading conversation...</div>
                  ) : ticketMessages.length === 0 ? (
                    <div className="py-8 text-center text-sm text-[#7A6F6F]">No messages yet.</div>
                  ) : (
                    ticketMessages.map((m) => {
                      const mine = m.SenderID === user.userId;
                      return (
                        <div key={m.MessageID} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                          <div className="text-[11px] text-[#7A6F6F] mb-1 px-1">
                            <strong className="text-[#4A1219]">{mine ? 'You' : m.SenderName}</strong> ·{' '}
                            {roleLabel(m.SenderRole)} · {fmtDateTime(m.CreatedAt)}
                          </div>
                          <div
                            className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
                              mine
                                ? 'bg-[#6B1A25] text-white'
                                : 'bg-white border border-[#EAD9D4] text-[#2B2323]'
                            }`}
                          >
                            {m.Message}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {selectedTicket.Status === 'Closed' ? (
                  <div className="p-4 border-t border-[#EAD9D4] bg-[#F8F4F0] text-center text-xs text-[#7A6F6F]">
                    This concern ticket is closed.
                    {isStaff ? ' Click Reopen above if further follow-up is needed.' : ' Submit a New Concern if you need additional assistance.'}
                  </div>
                ) : (
                  <form onSubmit={handleSendTicketReply} className="p-3.5 border-t border-[#EAD9D4] flex gap-2">
                    <input
                      type="text"
                      value={ticketReply}
                      onChange={(e) => setTicketReply(e.target.value)}
                      placeholder="Write a reply..."
                      className="flex-1 rounded-lg border border-[#EAD9D4] px-3.5 py-2 text-sm focus:outline-none focus:border-[#6B1A25]"
                    />
                    <button
                      type="submit"
                      disabled={sendingTicketReply || !ticketReply.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white font-semibold text-sm px-4 py-2 cursor-pointer disabled:opacity-50"
                    >
                      <Send className="h-4 w-4" />
                      Send
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        /* TAB 2: DIRECT MESSAGES (CHAT) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Contacts / Conversations */}
          <div className="lg:col-span-4 bg-white border border-[#EAD9D4] rounded-xl p-4 shadow-sm flex flex-col h-[660px]">
            <div className="relative mb-3">
              <Search className="h-4 w-4 text-[#7A6F6F] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={dmSearch}
                onChange={(e) => setDmSearch(e.target.value)}
                placeholder="Search person or department..."
                className="w-full rounded-lg border border-[#EAD9D4] pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:border-[#6B1A25]"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {dmLoading ? (
                <div className="py-12 text-center text-sm text-[#7A6F6F]">Loading contacts...</div>
              ) : filteredContacts.length === 0 ? (
                <div className="py-12 text-center text-sm text-[#7A6F6F]">No contacts found.</div>
              ) : (
                filteredContacts.map((c) => {
                  const active = c.userId === selectedContactId;
                  return (
                    <button
                      key={c.userId}
                      type="button"
                      onClick={() => setSelectedContactId(c.userId)}
                      className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                        active
                          ? 'border-[#6B1A25] bg-[#FBF4F2]'
                          : 'border-transparent hover:border-[#EAD9D4] hover:bg-[#FCF8F6]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-[#2B2323] truncate">{c.name}</span>
                        {c.unreadCount > 0 && (
                          <span className="px-1.5 py-0.5 text-[11px] font-bold rounded bg-[#6B1A25] text-white font-mono-tabular shrink-0">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#7A6F6F] truncate mt-0.5">
                        {roleLabel(c.role)}
                        {c.department ? ` · ${c.department}` : ''}
                      </div>
                      {c.lastMessage && (
                        <div className="text-xs text-[#574D4D] truncate mt-1 flex items-center gap-1">
                          {c.lastFromMe && (
                            c.lastRead ? (
                              <CheckCheck
                                className="h-3.5 w-3.5 text-[#255A2D] shrink-0"
                                aria-label="Read"
                              />
                            ) : (
                              <Check
                                className="h-3.5 w-3.5 text-[#7A6F6F] shrink-0"
                                aria-label="Sent"
                              />
                            )
                          )}
                          <span className="truncate">
                            {c.lastFromMe ? 'You: ' : ''}
                            {c.lastMessage}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Live 1-on-1 Chat Window */}
          <div className="lg:col-span-8 bg-white border border-[#EAD9D4] rounded-xl shadow-sm flex flex-col h-[660px]">
            {!selectedContact ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-sm text-[#7A6F6F]">
                <MessageCircle className="h-10 w-10 text-[#C8B5B0] mb-3" />
                Select a contact on the left to start a direct chat.
              </div>
            ) : (
              <>
                <div className="p-4 border-b border-[#EAD9D4] flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-[#4A1219] m-0">{selectedContact.name}</h2>
                    <div className="text-xs text-[#7A6F6F] mt-0.5">
                      {roleLabel(selectedContact.role)}
                      {selectedContact.department ? ` · ${selectedContact.department}` : ''}
                      {selectedContact.email ? ` · ${selectedContact.email}` : ''}
                    </div>
                  </div>
                </div>

                <div ref={dmScrollRef} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-[#FBF7F4]">
                  {dmThreadLoading ? (
                    <div className="py-8 text-center text-sm text-[#7A6F6F]">Loading messages...</div>
                  ) : dmMessages.length === 0 ? (
                    <div className="py-12 text-center text-sm text-[#7A6F6F]">
                      No messages yet with {selectedContact.name}. Say hello below!
                    </div>
                  ) : (
                    dmMessages.map((m) => {
                      const mine = m.FromUserID === user.userId;
                      return (
                        <div key={m.MessageID} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                          <div
                            className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
                              mine
                                ? 'bg-[#6B1A25] text-white'
                                : 'bg-white border border-[#EAD9D4] text-[#2B2323]'
                            }`}
                          >
                            {m.Message}
                          </div>
                          <div className="text-[10px] text-[#7A6F6F] mt-1 px-1 font-mono-tabular flex items-center gap-1.5">
                            <span>{fmtDateTime(m.CreatedAt)}</span>
                            {mine && (
                              <span
                                className={`inline-flex items-center gap-0.5 font-sans font-semibold ${
                                  m.Read ? 'text-[#255A2D]' : 'text-[#7A6F6F]'
                                }`}
                                title={m.Read ? 'Viewed by recipient' : 'Delivered to recipient'}
                              >
                                {m.Read ? (
                                  <>
                                    <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                    Read
                                  </>
                                ) : (
                                  <>
                                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                    Sent
                                  </>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <form onSubmit={handleSendDm} className="p-3.5 border-t border-[#EAD9D4] flex gap-2">
                  <input
                    type="text"
                    value={dmDraft}
                    onChange={(e) => setDmDraft(e.target.value)}
                    placeholder={`Message ${selectedContact.name}...`}
                    className="flex-1 rounded-lg border border-[#EAD9D4] px-3.5 py-2 text-sm focus:outline-none focus:border-[#6B1A25]"
                  />
                  <button
                    type="submit"
                    disabled={sendingDm || !dmDraft.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white font-semibold text-sm px-4 py-2 cursor-pointer disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    Send
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* New Concern Modal */}
      {newOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#2B2323]/55 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-[#EAD9D4] rounded-xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-[#EFE3DF] pb-3">
              <h3 className="text-lg font-bold text-[#4A1219] m-0">Submit a Help Desk Concern</h3>
              <button
                type="button"
                onClick={() => setNewOpen(false)}
                className="p-1.5 rounded-md hover:bg-[#F8F4F0] text-[#7A6F6F] cursor-pointer"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-3.5 mt-4">
              <div>
                <label className="block text-xs font-semibold text-[#4A1219] mb-1">
                  Subject <span className="text-[#A32424]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="Brief summary of your concern"
                  className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm focus:outline-none focus:border-[#6B1A25]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#4A1219] mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#6B1A25]"
                  >
                    {CONCERN_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#4A1219] mb-1">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as HelpDeskTicketPriority)}
                    className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#6B1A25]"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A1219] mb-1">
                  Related CAR No. (optional)
                </label>
                <input
                  type="text"
                  value={newCarNo}
                  onChange={(e) => setNewCarNo(e.target.value)}
                  placeholder="e.g. CAR-2026-0001"
                  className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm focus:outline-none focus:border-[#6B1A25]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A1219] mb-1">
                  Concern Details <span className="text-[#A32424]">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Describe your concern, question, or issue..."
                  className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm focus:outline-none focus:border-[#6B1A25]"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setNewOpen(false)}
                  className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#EAD9D4] text-[#2B2323] hover:bg-[#F8F4F0] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingTicket}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white cursor-pointer disabled:opacity-50"
                >
                  {creatingTicket ? 'Submitting...' : 'Submit Concern'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
