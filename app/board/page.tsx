'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Post {
  id: string
  title: string
  content: string
  created_at: string
  author: { id: string; name: string } | null
}

interface Comment {
  id: string
  content: string
  created_at: string
  author: { id: string; name: string } | null
}

export default function BoardPage() {
  const [user, setUser] = useState<any>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, Comment[]>>({})

  // 글 작성
  const [showWriteForm, setShowWriteForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 댓글 작성
  const [newComment, setNewComment] = useState<Record<string, string>>({})
  const [commentSubmitting, setCommentSubmitting] = useState<string | null>(null)

  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (!stored) { router.push('/'); return }
    setUser(JSON.parse(stored))
    fetchPosts()
  }, [])

  const fetchPosts = async () => {
    const { data } = await supabase
      .from('posts')
      .select(`id, title, content, created_at, author:author_id(id, name)`)
      .order('created_at', { ascending: false })
    setPosts((data as any) || [])
    setLoading(false)
  }

  const fetchComments = async (postId: string) => {
    const { data } = await supabase
      .from('comments')
      .select(`id, content, created_at, author:author_id(id, name)`)
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
    setComments(prev => ({ ...prev, [postId]: (data as any) || [] }))
  }

  const handleTogglePost = async (postId: string) => {
    if (expandedPostId === postId) {
      setExpandedPostId(null)
    } else {
      setExpandedPostId(postId)
      if (!comments[postId]) await fetchComments(postId)
    }
  }

  const handleSubmitPost = async () => {
    if (!newTitle.trim() || !newContent.trim()) return alert('제목과 내용을 입력해주세요.')
    setSubmitting(true)
    const { error } = await supabase.from('posts').insert({
      title: newTitle.trim(),
      content: newContent.trim(),
      author_id: user.id,
    })
    if (error) alert('작성 실패: ' + error.message)
    else {
      setNewTitle('')
      setNewContent('')
      setShowWriteForm(false)
      fetchPosts()
    }
    setSubmitting(false)
  }

  const handleDeletePost = async (postId: string) => {
    if (!confirm('게시글을 삭제할까요?')) return
    const { error } = await supabase.from('posts').delete().eq('id', postId)
    if (error) alert('삭제 실패: ' + error.message)
    else {
      if (expandedPostId === postId) setExpandedPostId(null)
      fetchPosts()
    }
  }

  const handleSubmitComment = async (postId: string) => {
    const content = newComment[postId]?.trim()
    if (!content) return
    setCommentSubmitting(postId)
    const { error } = await supabase.from('comments').insert({
      post_id: postId,
      content,
      author_id: user.id,
    })
    if (error) alert('댓글 작성 실패: ' + error.message)
    else {
      setNewComment(prev => ({ ...prev, [postId]: '' }))
      fetchComments(postId)
    }
    setCommentSubmitting(null)
  }

  const handleDeleteComment = async (commentId: string, postId: string) => {
    if (!confirm('댓글을 삭제할까요?')) return
    const { error } = await supabase.from('comments').delete().eq('id', commentId)
    if (error) alert('삭제 실패: ' + error.message)
    else fetchComments(postId)
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const canDelete = (authorId: string) => user?.is_admin || user?.id === authorId

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <button onClick={() => router.push('/schedule')} className="text-blue-500 text-sm mr-4">← 뒤로</button>
            <h1 className="text-xl font-bold text-gray-800">💬 자유게시판</h1>
          </div>
          <button
            onClick={() => setShowWriteForm(!showWriteForm)}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-full font-medium"
          >
            {showWriteForm ? '취소' : '✏️ 글쓰기'}
          </button>
        </div>

        {/* 글쓰기 폼 */}
        {showWriteForm && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="제목"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
            />
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="내용을 입력해주세요"
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 resize-none"
            />
            <button
              onClick={handleSubmitPost}
              disabled={submitting}
              className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            >
              {submitting ? '등록 중...' : '등록'}
            </button>
          </div>
        )}

        {/* 게시글 목록 */}
        {loading ? (
          <p className="text-center text-gray-400">불러오는 중...</p>
        ) : posts.length === 0 ? (
          <p className="text-center text-gray-400 mt-8">게시글이 없습니다. 첫 글을 작성해보세요!</p>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <div key={post.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* 게시글 헤더 */}
                <button
                  onClick={() => handleTogglePost(post.id)}
                  className="w-full p-4 text-left"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 truncate">{post.title}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {(post.author as any)?.name} · {formatDate(post.created_at)}
                      </div>
                    </div>
                    <span className="text-gray-400 text-xs ml-2">{expandedPostId === post.id ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* 게시글 내용 + 댓글 */}
                {expandedPostId === post.id && (
                  <div className="border-t border-gray-100">
                    {/* 본문 */}
                    <div className="p-4">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{post.content}</p>
                      {canDelete((post.author as any)?.id) && (
                        <button
                          onClick={() => handleDeletePost(post.id)}
                          className="mt-2 text-xs text-red-400 hover:text-red-600"
                        >
                          삭제
                        </button>
                      )}
                    </div>

                    {/* 댓글 목록 */}
                    <div className="bg-gray-50 px-4 py-2 border-t border-gray-100">
                      {(comments[post.id] || []).length === 0 ? (
                        <p className="text-xs text-gray-400 py-1">댓글이 없습니다.</p>
                      ) : (
                        <div className="space-y-2 py-1">
                          {(comments[post.id] || []).map((comment) => (
                            <div key={comment.id} className="flex justify-between items-start">
                              <div className="flex-1">
                                <span className="text-xs font-medium text-gray-700 mr-1">{(comment.author as any)?.name}</span>
                                <span className="text-xs text-gray-500">{comment.content}</span>
                                <div className="text-xs text-gray-400">{formatDate(comment.created_at)}</div>
                              </div>
                              {canDelete((comment.author as any)?.id) && (
                                <button
                                  onClick={() => handleDeleteComment(comment.id, post.id)}
                                  className="text-xs text-red-400 hover:text-red-600 ml-2 flex-shrink-0"
                                >
                                  삭제
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 댓글 입력 */}
                      <div className="flex gap-2 mt-2">
                        <input
                          type="text"
                          value={newComment[post.id] || ''}
                          onChange={(e) => setNewComment(prev => ({ ...prev, [post.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment(post.id)}
                          placeholder="댓글 입력..."
                          className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs"
                        />
                        <button
                          onClick={() => handleSubmitComment(post.id)}
                          disabled={commentSubmitting === post.id}
                          className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs disabled:opacity-50"
                        >
                          등록
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
