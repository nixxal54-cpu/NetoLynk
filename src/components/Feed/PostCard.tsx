import { useState, useEffect, useCallback, useRef } from "react";
import { Heart, MessageCircle, Bookmark, Share2, MoreHorizontal, Send, X, ChevronDown, ChevronUp } from "lucide-react";

// Utility: format numbers (1200 -> 1.2K)
const formatCount = (n) => {
  if (n === undefined || n === null) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
};

// Utility: time ago
const timeAgo = (dateStr) => {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(dateStr).toLocaleDateString();
};

// ─── CommentItem ────────────────────────────────────────────────────────────
const CommentItem = ({ comment, currentUserId, onLike, onReply, depth = 0 }) => {
  const [showReplies, setShowReplies] = useState(false);
  const isLiked = comment.likedBy?.includes(currentUserId) ?? false;

  return (
    <div className={`flex gap-2 ${depth > 0 ? "ml-8 mt-2" : "mt-3"}`}>
      <img
        src={comment.author?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.author?.id}`}
        alt={comment.author?.name}
        className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl px-3 py-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
            {comment.author?.name}
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5 break-words">
            {comment.text}
          </p>
        </div>
        <div className="flex items-center gap-3 mt-1 ml-2">
          <span className="text-xs text-gray-400">{timeAgo(comment.createdAt)}</span>
          <button
            onClick={() => onLike(comment.id)}
            className={`text-xs font-medium transition-colors ${
              isLiked ? "text-red-500" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {isLiked ? "♥" : "♡"} {comment.likes > 0 ? formatCount(comment.likes) : "Like"}
          </button>
          {depth === 0 && (
            <button
              onClick={() => onReply(comment)}
              className="text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
            >
              Reply
            </button>
          )}
        </div>
        {/* Nested replies */}
        {comment.replies?.length > 0 && depth === 0 && (
          <div>
            <button
              onClick={() => setShowReplies(!showReplies)}
              className="flex items-center gap-1 text-xs text-blue-500 font-medium mt-1 ml-2 hover:underline"
            >
              {showReplies ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showReplies ? "Hide" : `View ${comment.replies.length} ${comment.replies.length === 1 ? "reply" : "replies"}`}
            </button>
            {showReplies && comment.replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                currentUserId={currentUserId}
                onLike={onLike}
                onReply={onReply}
                depth={1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── PostCard ────────────────────────────────────────────────────────────────
const PostCard = ({ post: initialPost, currentUser, onPostUpdate }) => {
  // Derive initial state from post prop — avoid stale closure bugs
  const [post, setPost] = useState(() => ({
    ...initialPost,
    likes: initialPost.likes ?? 0,
    comments: initialPost.comments ?? [],
    saves: initialPost.saves ?? 0,
    shares: initialPost.shares ?? 0,
    likedBy: initialPost.likedBy ?? [],
    savedBy: initialPost.savedBy ?? [],
  }));

  // Sync if parent changes post (e.g., refetch)
  useEffect(() => {
    setPost((prev) => ({
      ...initialPost,
      likedBy: initialPost.likedBy ?? prev.likedBy,
      savedBy: initialPost.savedBy ?? prev.savedBy,
      comments: initialPost.comments ?? prev.comments,
    }));
  }, [initialPost.id]);

  const currentUserId = currentUser?.id;

  // ── Derived booleans (computed fresh each render, no stale state) ──────────
  const isLiked = post.likedBy.includes(currentUserId);
  const isSaved = post.savedBy.includes(currentUserId);

  // True comment count = all top-level + all replies
  const totalComments = post.comments.reduce(
    (acc, c) => acc + 1 + (c.replies?.length ?? 0),
    0
  );

  // ── UI state ────────────────────────────────────────────────────────────────
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [replyingTo, setReplyingTo] = useState(null); // { id, author.name }
  const [isLoading, setIsLoading] = useState({ like: false, save: false, comment: false });
  const [showMenu, setShowMenu] = useState(false);
  const [mediaIndex, setMediaIndex] = useState(0);
  const inputRef = useRef(null);
  const menuRef = useRef(null);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Focus input when replying
  useEffect(() => {
    if (replyingTo) inputRef.current?.focus();
  }, [replyingTo]);

  // ── Optimistic Like ─────────────────────────────────────────────────────────
  const handleLike = useCallback(async () => {
    if (isLoading.like) return;
    const wasLiked = isLiked;

    // Optimistic update
    setPost((prev) => ({
      ...prev,
      likes: wasLiked ? prev.likes - 1 : prev.likes + 1,
      likedBy: wasLiked
        ? prev.likedBy.filter((id) => id !== currentUserId)
        : [...prev.likedBy, currentUserId],
    }));

    setIsLoading((l) => ({ ...l, like: true }));
    try {
      const result = await (onPostUpdate?.likePost?.(post.id, !wasLiked) ?? Promise.resolve(null));
      // If server returns authoritative counts, use them
      if (result) {
        setPost((prev) => ({
          ...prev,
          likes: result.likes ?? prev.likes,
          likedBy: result.likedBy ?? prev.likedBy,
        }));
      }
    } catch {
      // Rollback on failure
      setPost((prev) => ({
        ...prev,
        likes: wasLiked ? prev.likes + 1 : prev.likes - 1,
        likedBy: wasLiked
          ? [...prev.likedBy, currentUserId]
          : prev.likedBy.filter((id) => id !== currentUserId),
      }));
    } finally {
      setIsLoading((l) => ({ ...l, like: false }));
    }
  }, [isLiked, isLoading.like, currentUserId, post.id, onPostUpdate]);

  // ── Optimistic Save ─────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (isLoading.save) return;
    const wasSaved = isSaved;

    setPost((prev) => ({
      ...prev,
      saves: wasSaved ? prev.saves - 1 : prev.saves + 1,
      savedBy: wasSaved
        ? prev.savedBy.filter((id) => id !== currentUserId)
        : [...prev.savedBy, currentUserId],
    }));

    setIsLoading((l) => ({ ...l, save: true }));
    try {
      const result = await (onPostUpdate?.savePost?.(post.id, !wasSaved) ?? Promise.resolve(null));
      if (result) {
        setPost((prev) => ({
          ...prev,
          saves: result.saves ?? prev.saves,
          savedBy: result.savedBy ?? prev.savedBy,
        }));
      }
    } catch {
      setPost((prev) => ({
        ...prev,
        saves: wasSaved ? prev.saves + 1 : prev.saves - 1,
        savedBy: wasSaved
          ? [...prev.savedBy, currentUserId]
          : prev.savedBy.filter((id) => id !== currentUserId),
      }));
    } finally {
      setIsLoading((l) => ({ ...l, save: false }));
    }
  }, [isSaved, isLoading.save, currentUserId, post.id, onPostUpdate]);

  // ── Comment Like ────────────────────────────────────────────────────────────
  const handleCommentLike = useCallback((commentId) => {
    setPost((prev) => ({
      ...prev,
      comments: prev.comments.map((c) => {
        if (c.id === commentId) {
          const liked = c.likedBy?.includes(currentUserId);
          return {
            ...c,
            likes: liked ? (c.likes ?? 1) - 1 : (c.likes ?? 0) + 1,
            likedBy: liked
              ? (c.likedBy ?? []).filter((id) => id !== currentUserId)
              : [...(c.likedBy ?? []), currentUserId],
          };
        }
        // Check replies too
        return {
          ...c,
          replies: (c.replies ?? []).map((r) => {
            if (r.id === commentId) {
              const liked = r.likedBy?.includes(currentUserId);
              return {
                ...r,
                likes: liked ? (r.likes ?? 1) - 1 : (r.likes ?? 0) + 1,
                likedBy: liked
                  ? (r.likedBy ?? []).filter((id) => id !== currentUserId)
                  : [...(r.likedBy ?? []), currentUserId],
              };
            }
            return r;
          }),
        };
      }),
    }));
  }, [currentUserId]);

  // ── Submit Comment ───────────────────────────────────────────────────────────
  const handleSubmitComment = useCallback(async (e) => {
    e?.preventDefault();
    const text = commentText.trim();
    if (!text || isLoading.comment) return;

    const tempId = `temp_${Date.now()}`;
    const newComment = {
      id: tempId,
      text,
      author: currentUser,
      createdAt: new Date().toISOString(),
      likes: 0,
      likedBy: [],
      replies: [],
    };

    if (replyingTo) {
      // Add as nested reply
      setPost((prev) => ({
        ...prev,
        comments: prev.comments.map((c) =>
          c.id === replyingTo.id
            ? { ...c, replies: [...(c.replies ?? []), newComment] }
            : c
        ),
      }));
    } else {
      setPost((prev) => ({
        ...prev,
        comments: [...prev.comments, newComment],
      }));
    }

    setCommentText("");
    setReplyingTo(null);
    setIsLoading((l) => ({ ...l, comment: true }));

    try {
      const result = await (onPostUpdate?.addComment?.(post.id, text, replyingTo?.id) ?? Promise.resolve(null));
      // Replace temp comment with server response
      if (result?.comment) {
        if (replyingTo) {
          setPost((prev) => ({
            ...prev,
            comments: prev.comments.map((c) =>
              c.id === replyingTo.id
                ? {
                    ...c,
                    replies: (c.replies ?? []).map((r) =>
                      r.id === tempId ? result.comment : r
                    ),
                  }
                : c
            ),
          }));
        } else {
          setPost((prev) => ({
            ...prev,
            comments: prev.comments.map((c) => (c.id === tempId ? result.comment : c)),
          }));
        }
      }
    } catch {
      // Rollback temp comment on error
      if (replyingTo) {
        setPost((prev) => ({
          ...prev,
          comments: prev.comments.map((c) =>
            c.id === replyingTo.id
              ? { ...c, replies: (c.replies ?? []).filter((r) => r.id !== tempId) }
              : c
          ),
        }));
      } else {
        setPost((prev) => ({
          ...prev,
          comments: prev.comments.filter((c) => c.id !== tempId),
        }));
      }
    } finally {
      setIsLoading((l) => ({ ...l, comment: false }));
    }
  }, [commentText, replyingTo, isLoading.comment, currentUser, post.id, onPostUpdate]);

  // ── Share ────────────────────────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: post.title ?? "Post", url: post.url ?? window.location.href });
      } else {
        await navigator.clipboard.writeText(post.url ?? window.location.href);
      }
      setPost((prev) => ({ ...prev, shares: prev.shares + 1 }));
    } catch {
      // user cancelled share — no-op
    }
  }, [post.url, post.title]);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <article className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden mb-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex-shrink-0">
            <img
              src={post.author?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author?.id}`}
              alt={post.author?.name}
              className="w-10 h-10 rounded-full object-cover ring-2 ring-gray-100 dark:ring-gray-700"
            />
            {post.author?.isOnline && (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {post.author?.name}
            </p>
            <div className="flex items-center gap-1.5">
              {post.author?.username && (
                <span className="text-xs text-gray-400 truncate">@{post.author.username}</span>
              )}
              {post.author?.username && <span className="text-gray-300 dark:text-gray-600">·</span>}
              <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(post.createdAt)}</span>
            </div>
          </div>
        </div>
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <MoreHorizontal size={18} />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-9 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 z-10 w-44 py-1 overflow-hidden">
              {["Copy link", "Report post", "Not interested", "Unfollow"].map((item) => (
                <button
                  key={item}
                  onClick={() => setShowMenu(false)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 ${
                    item === "Report post" ? "text-red-500" : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Text content */}
      {post.content && (
        <div className="px-4 pb-3">
          <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap break-words">
            {post.content}
          </p>
          {post.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {post.tags.map((tag) => (
                <span key={tag} className="text-xs text-blue-500 font-medium hover:underline cursor-pointer">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Media */}
      {post.media?.length > 0 && (
        <div className="relative bg-gray-100 dark:bg-gray-800">
          <img
            src={post.media[mediaIndex]}
            alt="Post media"
            className="w-full max-h-96 object-cover"
            loading="lazy"
          />
          {post.media.length > 1 && (
            <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
              {mediaIndex + 1}/{post.media.length}
            </div>
          )}
          {post.media.length > 1 && (
            <div className="absolute inset-0 flex items-center justify-between px-2 pointer-events-none">
              {[
                { dir: -1, label: "←", show: mediaIndex > 0 },
                { dir: 1, label: "→", show: mediaIndex < post.media.length - 1 },
              ].map(({ dir, label, show }) =>
                show ? (
                  <button
                    key={dir}
                    onClick={() => setMediaIndex((i) => i + dir)}
                    className="pointer-events-auto w-8 h-8 bg-white/80 dark:bg-black/60 rounded-full flex items-center justify-center text-gray-800 dark:text-white shadow"
                  >
                    {label}
                  </button>
                ) : (
                  <span key={dir} />
                )
              )}
            </div>
          )}
        </div>
      )}

      {/* Stats row */}
      {(post.likes > 0 || totalComments > 0 || post.saves > 0) && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-50 dark:border-gray-800">
          <div className="flex items-center gap-3">
            {post.likes > 0 && (
              <button
                onClick={() => setShowComments(true)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                <span className="text-red-400">♥</span>
                <span>{formatCount(post.likes)}</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {totalComments > 0 && (
              <button
                onClick={() => setShowComments(!showComments)}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                {formatCount(totalComments)} {totalComments === 1 ? "comment" : "comments"}
              </button>
            )}
            {post.saves > 0 && (
              <span className="text-xs text-gray-400">{formatCount(post.saves)} saves</span>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-4 border-t border-gray-100 dark:border-gray-800">
        {/* Like */}
        <button
          onClick={handleLike}
          disabled={isLoading.like}
          className={`flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-all active:scale-95 disabled:opacity-60 ${
            isLiked
              ? "text-red-500"
              : "text-gray-500 dark:text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
          }`}
        >
          <Heart
            size={18}
            className={`transition-all ${isLiked ? "fill-red-500 scale-110" : ""}`}
          />
          <span className="text-xs">{formatCount(post.likes)}</span>
        </button>

        {/* Comment */}
        <button
          onClick={() => {
            setShowComments(true);
            setTimeout(() => inputRef.current?.focus(), 100);
          }}
          className="flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-all active:scale-95"
        >
          <MessageCircle size={18} />
          <span className="text-xs">{formatCount(totalComments)}</span>
        </button>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={isLoading.save}
          className={`flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-all active:scale-95 disabled:opacity-60 ${
            isSaved
              ? "text-amber-500"
              : "text-gray-500 dark:text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/20"
          }`}
        >
          <Bookmark
            size={18}
            className={`transition-all ${isSaved ? "fill-amber-500 scale-110" : ""}`}
          />
          <span className="text-xs">{formatCount(post.saves)}</span>
        </button>

        {/* Share */}
        <button
          onClick={handleShare}
          className="flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-950/20 transition-all active:scale-95"
        >
          <Share2 size={18} />
          {post.shares > 0 && <span className="text-xs">{formatCount(post.shares)}</span>}
        </button>
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 pb-4">
          {post.comments.length > 0 && (
            <div className="max-h-80 overflow-y-auto pr-1 -mr-1">
              {post.comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  currentUserId={currentUserId}
                  onLike={handleCommentLike}
                  onReply={(c) => setReplyingTo(c)}
                />
              ))}
            </div>
          )}

          {/* Reply indicator */}
          {replyingTo && (
            <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-950/30 rounded-lg px-3 py-2 mt-3 text-xs text-blue-600 dark:text-blue-400">
              <span>Replying to <strong>{replyingTo.author?.name}</strong></span>
              <button
                onClick={() => setReplyingTo(null)}
                className="text-blue-400 hover:text-blue-600"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Comment input */}
          <div className="flex items-center gap-2 mt-3">
            <img
              src={currentUser?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser?.id}`}
              alt="You"
              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
            />
            <div className="flex-1 flex items-center gap-1 bg-gray-50 dark:bg-gray-800 rounded-full px-3 py-1.5 border border-gray-200 dark:border-gray-700 focus-within:border-blue-400 transition-colors">
              <input
                ref={inputRef}
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmitComment(e)}
                placeholder={replyingTo ? `Reply to ${replyingTo.author?.name}…` : "Write a comment…"}
                className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 outline-none min-w-0"
              />
              <button
                onClick={handleSubmitComment}
                disabled={!commentText.trim() || isLoading.comment}
                className="text-blue-500 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
};

export default PostCard;
