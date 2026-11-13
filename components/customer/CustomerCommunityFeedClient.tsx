"use client";

import React, { useState } from "react";
import {
  MessageSquare,
  Heart,
  Share2,
  Flag,
  Send,
  Sparkles,
  Radio,
  BookOpen,
  Filter,
} from "lucide-react";
import {
  createCommunityPostAction,
  reportCommunityContentAction,
  type CommunityPostRecord,
} from "@/app/actions/community";

export function CustomerCommunityFeedClient({
  initialPosts = [],
  currentUserId,
}: {
  initialPosts: CommunityPostRecord[];
  currentUserId: string;
}) {
  const [posts, setPosts] = useState<CommunityPostRecord[]>(initialPosts);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [newPostContent, setNewPostContent] = useState("");
  const [newPostCategory, setNewPostCategory] = useState<"general" | "astrology_insights" | "vedic_philosophy" | "broadcast_announcement" | "daily_guidance">("general");
  const [submitting, setSubmitting] = useState(false);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostContent.trim()) return;

    setSubmitting(true);
    try {
      const res = await createCommunityPostAction({
        content: newPostContent,
        category: newPostCategory,
      });

      if (res.success) {
        setNewPostContent("");
        // Optimistic UI addition
        const optimisticPost: CommunityPostRecord = {
          id: `temp_${Date.now()}`,
          author_id: currentUserId,
          author_role: "customer",
          content: newPostContent,
          category: newPostCategory,
          likes_count: 0,
          comments_count: 0,
          is_pinned: false,
          status: "published",
          created_at: new Date().toISOString(),
          author: { full_name: "You" },
        };
        setPosts([optimisticPost, ...posts]);
      } else {
        alert(res.error || "Failed to publish post");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = (postId: string) => {
    setLikedPostIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  };

  const handleReport = async (postId: string) => {
    const reason = prompt("Please provide a reason for reporting this post:");
    if (!reason) return;

    const res = await reportCommunityContentAction({
      targetType: "post",
      targetId: postId,
      reason,
    });

    if (res.success) {
      alert("Post reported to administrators for review.");
    } else {
      alert(res.error || "Failed to submit report");
    }
  };

  const filteredPosts = posts.filter(
    (p) => activeCategory === "all" || p.category === activeCategory
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Header Banner */}
      <div className="rounded-3xl border border-gold/30 bg-midnight p-6 text-ivory space-y-2">
        <div className="inline-flex items-center gap-1.5 text-xs text-champagne font-bold">
          <BookOpen className="h-4 w-4 text-gold" />
          Vedic Community & Satsang Feed
        </div>
        <h1 className="font-display text-2xl font-bold text-champagne">
          Spiritual Discussions & Astrologer Insights
        </h1>
        <p className="text-xs text-ivory/70">
          Engage in respectful Vedic discourse, study planetary wisdom, and connect with fellow seekers.
        </p>
      </div>

      {/* Composer */}
      <div className="rounded-2xl border border-gold/25 bg-white p-5 shadow-xs space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-midnight">
          Share a Question or Spiritual Insight
        </h2>
        <form onSubmit={handleCreatePost} className="space-y-3">
          <textarea
            value={newPostContent}
            onChange={(e) => setNewPostContent(e.target.value)}
            rows={3}
            placeholder="Share an insight or ask a question about Vedic philosophy, dashas, or rituals..."
            className="w-full rounded-xl border border-gold/30 bg-parchment/20 p-3 text-xs outline-none focus:border-gold resize-none"
          />

          <div className="flex items-center justify-between gap-3">
            <select
              value={newPostCategory}
              onChange={(e) => setNewPostCategory(e.target.value as any)}
              className="rounded-xl border border-gold/30 bg-white px-3 py-1.5 text-xs font-medium text-midnight outline-none focus:border-gold"
            >
              <option value="general">General Discussion</option>
              <option value="astrology_insights">Astrology Insights</option>
              <option value="vedic_philosophy">Vedic Philosophy</option>
              <option value="daily_guidance">Daily Guidance</option>
            </select>

            <button
              type="submit"
              disabled={submitting || !newPostContent.trim()}
              className="rounded-xl bg-midnight text-champagne px-4 py-2 text-xs font-bold hover:bg-plum transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              {submitting ? "Publishing..." : "Post"}
            </button>
          </div>
        </form>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <Filter className="h-4 w-4 text-muted shrink-0" />
        {["all", "astrology_insights", "vedic_philosophy", "daily_guidance"].map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`rounded-full px-3 py-1 font-semibold transition shrink-0 capitalize ${
              activeCategory === cat
                ? "bg-gold text-midnight"
                : "border border-gold/30 bg-white text-muted hover:text-midnight"
            }`}
          >
            {cat.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Posts List */}
      <div className="space-y-4">
        {filteredPosts.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gold/30 bg-white p-8 text-center text-xs text-muted">
            No community posts yet in this category. Be the first to share an insight!
          </div>
        )}

        {filteredPosts.map((post) => {
          const isLiked = likedPostIds.has(post.id);
          const likes = post.likes_count + (isLiked ? 1 : 0);

          return (
            <div
              key={post.id}
              className="rounded-2xl border border-gold/20 bg-white p-5 shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-gold/15 text-gold-deep flex items-center justify-center font-bold text-xs">
                    {post.author?.full_name?.charAt(0) || "S"}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-midnight">
                      {post.author?.full_name || "Vedic Seeker"}
                    </h4>
                    <span className="text-[10px] text-muted capitalize">
                      {post.author_role.replace("_", " ")} • {new Date(post.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleReport(post.id)}
                  title="Report Post"
                  className="text-muted hover:text-red-600 p-1"
                >
                  <Flag className="h-3.5 w-3.5" />
                </button>
              </div>

              <p className="text-xs text-midnight/90 leading-relaxed whitespace-pre-wrap">
                {post.content}
              </p>

              <div className="flex items-center justify-between pt-2 border-t border-gold/10 text-xs text-muted">
                <button
                  onClick={() => handleLike(post.id)}
                  className={`flex items-center gap-1 font-bold ${
                    isLiked ? "text-red-500" : "hover:text-midnight"
                  }`}
                >
                  <Heart className={`h-4 w-4 ${isLiked ? "fill-current" : ""}`} />
                  {likes}
                </button>

                <div className="flex items-center gap-1">
                  <MessageSquare className="h-4 w-4" />
                  {post.comments_count}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

