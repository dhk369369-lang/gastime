'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Post {
  id: string
  title: string
  content: string
  image_urls: string[] | null
  created_at: string
  author: { id: string; name: string } | null
}

// 사진 첨부 설정
const IMAGE_BUCKET = 'post-images'
const MAX_IMAGES = 5
const MAX_IMAGE_SIZE = 1280 // 긴 변 기준 px

// 업로드 전에 사진 크기를 줄여서 JPEG로 변환 (실패하면 원본 그대로)
const compressImage = async (file: File): Promise<Blob> => {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_IMAGE_SIZE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
    return blob || file
  } catch {
    return file
  }
}

// 공개 URL에서 스토리지 경로 추출 (삭제용)
const storagePathFromUrl = (url: string) => url.split(`/${IMAGE_BUCKET}/`)[1]

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

  // 권한 (DB에서 조회)
  const [isBoardAdmin, setIsBoardAdmin] = useState(false)
  const [canComment, setCanComment] = useState(true)

  // 글 작성
  const [showWriteForm, setShowWriteForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newImages, setNewImages] = useState<{ file: File; preview: string }[]>([])
  const [submitting, setSubmitting] = useState(false)

  // 사진 크게 보기
  const [viewerImage, setViewerImage] = useState<string | null>(null)

  // 댓글 작성
  const [newComment, setNewComment] = useState<Record<string, string>>({})
  const [commentSubmitting, setCommentSubmitting] = useState<string | null>(null)

  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    setUser(u)
    fetchPermissions(u.id)
    fetchPosts()
  }, [])

  // 내 권한 조회 (is_admin / is_board_admin / can_comment)
  const fetchPermissions = async (userId: string) => {
    const { data } = await supabase
      .from('instructors')
      .select('is_admin, is_board_admin, can_comment')
      .eq('id', userId)
      .single()
    if (data) {
      setIsBoardAdmin(!!(data.is_admin || data.is_board_admin))
      setCanComment(data.can_comment !== false)
    }
  }

  const fetchPosts = async () => {
    const { data } = await supabase
      .from('posts')
      .select(`id, title, content, image_urls, created_at, author:author_id(id, name)`)
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
    // 글쓰기 차단 목록
    const blockedIds = ['2ae04927-9078-44c6-b90e-61f64d93c923']
    if (blockedIds.includes(user.id)) return alert('우선배님. 당신은 글을 쓸 수 없습니다')
    setSubmitting(true)

    // 사진 먼저 업로드
    const uploadedPaths: string[] = []
    const imageUrls: string[] = []
    for (const { file } of newImages) {
      const blob = await compressImage(file)
      const ext = blob.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() || 'jpg')
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from(IMAGE_BUCKET)
        .upload(path, blob, { contentType: blob.type || file.type })
      if (uploadError) {
        if (uploadedPaths.length) await supabase.storage.from(IMAGE_BUCKET).remove(uploadedPaths)
        alert('사진 업로드 실패: ' + uploadError.message)
        setSubmitting(false)
        return
      }
      uploadedPaths.push(path)
      imageUrls.push(supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl)
    }

    const { error } = await supabase.from('posts').insert({
      title: newTitle.trim(),
      content: newContent.trim(),
      image_urls: imageUrls,
      author_id: user.id,
    })
    if (error) {
      if (uploadedPaths.length) await supabase.storage.from(IMAGE_BUCKET).remove(uploadedPaths)
      alert('작성 실패: ' + error.message)
    } else {
      setNewTitle('')
      setNewContent('')
      clearNewImages()
      setShowWriteForm(false)
      fetchPosts()
    }
    setSubmitting(false)
  }

  const handleSelectImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'))
    e.target.value = '' // 같은 사진 다시 선택 가능하도록
    if (newImages.length + files.length > MAX_IMAGES) alert(`사진은 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.`)
    const added = files.slice(0, MAX_IMAGES - newImages.length).map(file => ({ file, preview: URL.createObjectURL(file) }))
    setNewImages(prev => [...prev, ...added])
  }

  const handleRemoveImage = (index: number) => {
    URL.revokeObjectURL(newImages[index].preview)
    setNewImages(prev => prev.filter((_, i) => i !== index))
  }

  const clearNewImages = () => {
    newImages.forEach(img => URL.revokeObjectURL(img.preview))
    setNewImages([])
  }

  const handleDeletePost = async (post: Post) => {
    if (!confirm('게시글을 삭제할까요?')) return
    const { error } = await supabase.from('posts').delete().eq('id', post.id)
    if (error) alert('삭제 실패: ' + error.message)
    else {
      // 첨부 사진도 스토리지에서 삭제
      const paths = (post.image_urls || []).map(storagePathFromUrl).filter(Boolean)
      if (paths.length) await supabase.storage.from(IMAGE_BUCKET).remove(paths)
      if (expandedPostId === post.id) setExpandedPostId(null)
      fetchPosts()
    }
  }

  const handleSubmitComment = async (postId: string) => {
    const content = newComment[postId]?.trim()
    if (!content) return

    // 등록 직전에 DB에서 댓글 권한 다시 확인
    const { data: me } = await supabase
      .from('instructors')
      .select('can_comment')
      .eq('id', user.id)
      .single()
    if (me?.can_comment === false) {
      setCanComment(false)
      return alert('댓글 작성 권한이 없습니다.')
    }

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

  // 관리자, 게시판 관리자, 본인만 삭제 가능
  const canDelete = (authorId: string) => user?.is_admin || isBoardAdmin || user?.id === authorId

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

            {/* 사진 첨부 */}
            <div className="flex flex-wrap gap-2 mb-2">
              {newImages.map((img, i) => (
                <div key={img.preview} className="relative w-16 h-16">
                  <img src={img.preview} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                  <button
                    onClick={() => handleRemoveImage(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-700 text-white rounded-full text-xs leading-5"
                  >
                    ×
                  </button>
                </div>
              ))}
              {newImages.length < MAX_IMAGES && (
                <label className="w-16 h-16 flex flex-col items-center justify-center border border-dashed border-gray-300 rounded-lg text-gray-400 text-xs cursor-pointer">
                  <span className="text-lg">📷</span>
                  {newImages.length}/{MAX_IMAGES}
                  <input type="file" accept="image/*" multiple onChange={handleSelectImages} className="hidden" />
                </label>
              )}
            </div>

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
                      <div className="font-medium text-gray-800 truncate">
                        {post.title}
                        {!!post.image_urls?.length && <span className="ml-1 text-xs text-gray-400">📷{post.image_urls.length}</span>}
                      </div>
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
                      {!!post.image_urls?.length && (
                        <div className="mt-3 space-y-2">
                          {post.image_urls.map((url) => (
                            <img
                              key={url}
                              src={url}
                              alt=""
                              loading="lazy"
                              onClick={() => setViewerImage(url)}
                              className="w-full rounded-lg border border-gray-100 cursor-zoom-in"
                            />
                          ))}
                        </div>
                      )}
                      {canDelete((post.author as any)?.id) && (
                        <button
                          onClick={() => handleDeletePost(post)}
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

                      {/* 댓글 입력 (권한 없으면 안내 문구) */}
                      {canComment ? (
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
                      ) : (
                        <p className="text-xs text-gray-400 mt-2">댓글 작성 권한이 없습니다.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 사진 크게 보기 */}
      {viewerImage && (
        <div
          onClick={() => setViewerImage(null)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
        >
          <img src={viewerImage} alt="" className="max-w-full max-h-full object-contain" />
          <button className="absolute top-4 right-4 text-white text-2xl">×</button>
        </div>
      )}
    </div>
  )
}
