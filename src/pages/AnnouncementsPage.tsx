import React, { useEffect, useState } from 'react';
import { History, ImagePlus, Plus, Send, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { driveImageSrc, fmtDateTime, safeUrl } from '../lib/format';
import type {
  AnnouncementComment,
  AnnouncementHistoryItem,
  AnnouncementItem,
  SessionUser,
} from '../lib/types';
import { ConfirmModal } from '../components/ConfirmModal';
import { useToast } from '../components/Toast';

export function AnnouncementsPage({ user }: { user: SessionUser }) {
  const { showToast } = useToast();
  const isAdmin = user.role === 'Admin';
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [commentsByAnn, setCommentsByAnn] = useState<Record<string, AnnouncementComment[]>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [postingCommentId, setPostingCommentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Create/Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [pendingImages, setPendingImages] = useState<Array<{ file: File; previewUrl: string }>>([]);
  const [saving, setSaving] = useState(false);

  // History Modal
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<AnnouncementHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Delete Confirm Modal
  const [deleteTarget, setDeleteTarget] = useState<
    { kind: 'announcement'; id: string } | { kind: 'comment'; commentId: string; announcementId: string } | null
  >(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadAnnouncements = async () => {
    setLoading(true);
    try {
      const rows = await api.listAnnouncements();
      setAnnouncements(rows || []);
      for (const a of rows || []) {
        api
          .getAnnouncementComments(a.AnnouncementID)
          .then((cmts) => {
            setCommentsByAnn((prev) => ({ ...prev, [a.AnnouncementID]: cmts || [] }));
          })
          .catch(() => {});
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not load announcements.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const openModal = (item?: AnnouncementItem) => {
    setEditingId(item ? item.AnnouncementID : null);
    setTitle(item ? item.Title : '');
    setMessage(item ? item.Message : '');
    setExistingImages(item ? item.ImageLinks || [] : []);
    setPendingImages([]);
    setModalOpen(true);
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      if (file.size > 8 * 1024 * 1024) {
        showToast(`${file.name} is too large (max 8MB).`, 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setPendingImages((prev) => [...prev, { file, previewUrl: String(reader.result) }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      showToast('Please fill in both the title and message.', 'error');
      return;
    }
    setSaving(true);
    try {
      const uploaded: string[] = [];
      for (const p of pendingImages) {
        const up = await api.uploadAnnouncementImage(p.file);
        if (!up.ok || !up.url) throw new Error(up.error || 'Image upload failed');
        uploaded.push(up.url);
      }
      const allLinks = [...existingImages, ...uploaded];
      if (editingId) {
        const res = await api.updateAnnouncement(editingId, title.trim(), message.trim(), allLinks);
        if (!res.ok) throw new Error(res.error || 'Could not update announcement.');
        showToast('Announcement updated.', 'success');
      } else {
        const res = await api.createAnnouncement(title.trim(), message.trim(), allLinks);
        if (!res.ok) throw new Error(res.error || 'Could not post announcement.');
        showToast('Announcement posted.', 'success');
      }
      setModalOpen(false);
      loadAnnouncements();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async (id: string) => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const rows = await api.getAnnouncementHistory(id);
      setHistoryItems(rows || []);
    } catch {
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      if (deleteTarget.kind === 'announcement') {
        const res = await api.deleteAnnouncement(deleteTarget.id);
        if (!res.ok) throw new Error(res.error || 'Could not delete announcement.');
        setAnnouncements((prev) => prev.filter((a) => a.AnnouncementID !== deleteTarget.id));
        showToast('Announcement deleted.', 'success');
      } else {
        const res = await api.deleteAnnouncementComment(deleteTarget.commentId);
        if (!res.ok) throw new Error(res.error || 'Could not delete comment.');
        const cmts = await api.getAnnouncementComments(deleteTarget.announcementId);
        setCommentsByAnn((prev) => ({ ...prev, [deleteTarget.announcementId]: cmts || [] }));
        showToast('Comment deleted.', 'success');
      }
      setDeleteTarget(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed.', 'error');
    } finally {
      setDeleteBusy(false);
    }
  };

  const handlePostComment = async (announcementId: string) => {
    const msg = (commentInputs[announcementId] || '').trim();
    if (!msg) {
      showToast('Please enter a comment.', 'error');
      return;
    }
    setPostingCommentId(announcementId);
    try {
      const res = await api.addAnnouncementComment(announcementId, msg);
      if (!res.ok) throw new Error(res.error || 'Could not post comment.');
      setCommentInputs((prev) => ({ ...prev, [announcementId]: '' }));
      const cmts = await api.getAnnouncementComments(announcementId);
      setCommentsByAnn((prev) => ({ ...prev, [announcementId]: cmts || [] }));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to post comment.', 'error');
    } finally {
      setPostingCommentId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#4A1219] m-0">Announcements</h1>
            <p className="text-sm text-[#7A6F6F] mt-1">
              Company-wide updates and notices posted by Auditor Accounts.
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => openModal()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white font-semibold text-sm px-4 py-2 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              New Announcement
            </button>
          )}
        </div>

        <div className="mt-6 space-y-5">
          {loading ? (
            <div className="py-10 text-center text-sm text-[#7A6F6F]">Loading announcements...</div>
          ) : announcements.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#7A6F6F]">No announcements yet.</div>
          ) : (
            announcements.map((a) => {
              const wasEdited = a.UpdatedAt && a.CreatedAt && a.UpdatedAt !== a.CreatedAt;
              const initial = (a.PostedByName || '?').trim().charAt(0).toUpperCase();
              const comments = commentsByAnn[a.AnnouncementID] || [];

              return (
                <article
                  key={a.AnnouncementID}
                  className="border border-[#EAD9D4] rounded-xl overflow-hidden bg-white"
                >
                  <div className="h-1 bg-gradient-to-r from-[#C9A227] to-[#6B1A25]" />
                  <div className="p-5">
                    <div className="flex items-start gap-3.5">
                      <div className="h-9 w-9 rounded-full bg-[#6B1A25] text-white flex items-center justify-center font-display font-bold text-sm shrink-0">
                        {initial}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <h2 className="text-lg font-bold text-[#4A1219] m-0">{a.Title}</h2>
                          {isAdmin && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => openModal(a)}
                                className="px-2.5 py-1 text-xs font-semibold rounded-md border border-[#EAD9D4] hover:border-[#6B1A25] text-[#4A1219] cursor-pointer"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget({ kind: 'announcement', id: a.AnnouncementID })}
                                className="px-2.5 py-1 text-xs font-semibold rounded-md border border-[#EAD9D4] hover:border-[#A32424] text-[#A32424] cursor-pointer"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-[#7A6F6F] mt-0.5">
                          Posted by {a.PostedByName} ·{' '}
                          <span className="font-mono-tabular">{fmtDateTime(a.CreatedAt)}</span>
                          {wasEdited && (
                            <>
                              {' · '}
                              <button
                                type="button"
                                onClick={() => openHistory(a.AnnouncementID)}
                                className="inline-flex items-center gap-1 text-[#6B1A25] hover:underline cursor-pointer"
                              >
                                <History className="h-3 w-3" />
                                Edited {fmtDateTime(a.UpdatedAt)}
                              </button>
                            </>
                          )}
                        </div>
                        <div className="mt-3 text-sm text-[#2B2323] whitespace-pre-wrap leading-relaxed">
                          {a.Message}
                        </div>

                        {a.ImageLinks && a.ImageLinks.length > 0 && (
                          <div className="flex flex-wrap gap-2.5 mt-4">
                            {a.ImageLinks.map((url, idx) => (
                              <a
                                key={idx}
                                href={safeUrl(url)}
                                target="_blank"
                                rel="noreferrer"
                                className="block rounded-lg overflow-hidden border border-[#EAD9D4] hover:opacity-90"
                              >
                                <img
                                  src={driveImageSrc(url)}
                                  alt={`Announcement attachment ${idx + 1}`}
                                  referrerPolicy="no-referrer"
                                  className="w-32 h-24 object-cover"
                                />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Comments */}
                    <div className="mt-5 pt-4 border-t border-[#F0E4DF]">
                      <div className="text-xs font-bold uppercase tracking-wider text-[#7A6F6F] mb-2">
                        Comments ({comments.length})
                      </div>
                      {comments.length === 0 ? (
                        <div className="text-xs text-[#7A6F6F] py-1">No comments yet.</div>
                      ) : (
                        <div className="divide-y divide-[#F0E4DF]">
                          {comments.map((c) => {
                            const canDelete = isAdmin || c.UserID === user.userId;
                            return (
                              <div key={c.CommentID} className="py-2.5 flex items-start gap-2.5">
                                <div className="h-7 w-7 rounded-full bg-[#F3E8DE] text-[#4A1219] flex items-center justify-center font-bold text-xs shrink-0">
                                  {(c.UserName || '?').trim().charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-semibold text-[#2B2323]">
                                      {c.UserName}
                                      {c.Role === 'Admin' && (
                                        <span className="ml-1.5 text-[10px] font-semibold text-[#4A1219] bg-[#F3E8DE] px-1.5 py-0.5 rounded">
                                          Auditor
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-[11px] text-[#7A6F6F] font-mono-tabular flex items-center gap-2">
                                      {fmtDateTime(c.CreatedAt)}
                                      {canDelete && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setDeleteTarget({
                                              kind: 'comment',
                                              commentId: c.CommentID,
                                              announcementId: a.AnnouncementID,
                                            })
                                          }
                                          className="text-[#A32424] hover:underline cursor-pointer"
                                        >
                                          Delete
                                        </button>
                                      )}
                                    </span>
                                  </div>
                                  <div className="text-sm text-[#2B2323] mt-0.5 whitespace-pre-wrap">
                                    {c.Message}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="mt-3 flex items-start gap-2">
                        <textarea
                          rows={1}
                          value={commentInputs[a.AnnouncementID] || ''}
                          onChange={(e) =>
                            setCommentInputs((prev) => ({ ...prev, [a.AnnouncementID]: e.target.value }))
                          }
                          placeholder="Write a comment..."
                          className="flex-1 rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm focus:outline-none focus:border-[#6B1A25]"
                        />
                        <button
                          type="button"
                          disabled={postingCommentId === a.AnnouncementID}
                          onClick={() => handlePostComment(a.AnnouncementID)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                        >
                          <Send className="h-3.5 w-3.5" />
                          Post
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>

      {/* Create / Edit Announcement Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2B2323]/55 p-4" role="dialog" aria-modal="true">
          <div className="bg-white border border-[#EAD9D4] rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-[#4A1219] m-0">
              {editingId ? 'Edit Announcement' : 'New Announcement'}
            </h3>
            <form onSubmit={handleSaveAnnouncement} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-[#4A1219] mb-1">
                  Title <span className="text-[#A32424]">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Scheduled internal audit"
                  className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm focus:outline-none focus:border-[#6B1A25]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A1219] mb-1">
                  Message <span className="text-[#A32424]">*</span>
                </label>
                <textarea
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Details for everyone to see..."
                  className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm focus:outline-none focus:border-[#6B1A25]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A1219] mb-1">Images (optional)</label>
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-[#EAD9D4] hover:border-[#6B1A25] rounded-lg p-4 text-center cursor-pointer">
                  <ImagePlus className="h-5 w-5 text-[#6B1A25] mb-1" />
                  <span className="text-xs text-[#7A6F6F]">
                    Click to attach one or more images (max 8MB each)
                  </span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleImagePick} />
                </label>

                {(existingImages.length > 0 || pendingImages.length > 0) && (
                  <div className="flex flex-wrap gap-2.5 mt-3">
                    {existingImages.map((url, idx) => (
                      <div key={url + idx} className="relative">
                        <img
                          src={driveImageSrc(url)}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-20 h-16 object-cover rounded border border-[#EAD9D4]"
                        />
                        <button
                          type="button"
                          onClick={() => setExistingImages((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-[#A32424] text-white text-xs flex items-center justify-center cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {pendingImages.map((img, idx) => (
                      <div key={idx} className="relative">
                        <img
                          src={img.previewUrl}
                          alt=""
                          className="w-20 h-16 object-cover rounded border border-[#EAD9D4]"
                        />
                        <button
                          type="button"
                          onClick={() => setPendingImages((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-[#A32424] text-white text-xs flex items-center justify-center cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#EAD9D4] text-[#2B2323] hover:bg-[#F8F4F0] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Post Announcement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Modal */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2B2323]/55 p-4" role="dialog" aria-modal="true">
          <div className="bg-white border border-[#EAD9D4] rounded-xl max-w-xl w-full max-h-[82vh] overflow-y-auto p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-[#4A1219] m-0">Edit History</h3>
            <div className="mt-4 space-y-3">
              {historyLoading ? (
                <div className="text-sm text-[#7A6F6F]">Loading history...</div>
              ) : historyItems.length === 0 ? (
                <div className="text-sm text-[#7A6F6F]">No previous versions recorded.</div>
              ) : (
                historyItems.map((h) => (
                  <div key={h.HistoryID} className="border border-[#EAD9D4] rounded-lg p-3.5">
                    <div className="text-xs text-[#7A6F6F] mb-1">
                      Replaced by {h.EditedByName} · {fmtDateTime(h.EditedAt)}
                    </div>
                    <div className="font-bold text-sm text-[#4A1219]">{h.Title}</div>
                    <div className="text-sm text-[#2B2323] mt-1 whitespace-pre-wrap">{h.Message}</div>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-end mt-5">
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#EAD9D4] text-[#2B2323] hover:bg-[#F8F4F0] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title={deleteTarget?.kind === 'announcement' ? 'Delete this announcement?' : 'Delete this comment?'}
        description={
          deleteTarget?.kind === 'announcement'
            ? 'This also removes its comments and edit history permanently.'
            : 'This comment will be permanently removed.'
        }
        confirmLabel="Delete"
        confirmVariant="danger"
        busy={deleteBusy}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
