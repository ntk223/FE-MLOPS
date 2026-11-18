import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import type {
  AdvisorBrief,
  ChatMessage,
  ChatSession,
  CitedEvidence,
  PredictionRef,
} from '../../contracts/api';
import { apiClient } from '../../api';
import { ChatService } from '../../features/chat/chat-service';
import { Button, Badge, Spinner } from '../ui';
import { signalLabel } from '../../features/advisor/feature-labels';
import styles from './AdvisorChatDrawer.module.css';

const chatService = new ChatService(apiClient);

export interface AdvisorChatDrawerProps {
  open: boolean;
  onClose: () => void;
  predictionRef: PredictionRef;
  onBriefFinalized?: (brief: AdvisorBrief) => void;
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

/** Format message text with basic paragraphs, bullet points, and blockquotes */
function FormattedContent({ text }: { text: string }): ReactElement {
  const lines = text.split('\n');
  const elements: ReactElement[] = [];
  let currentList: string[] = [];

  const flushList = (keyPrefix: string) => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`${keyPrefix}-list`}>
          {currentList.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>,
      );
      currentList = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      currentList.push(trimmed.slice(2));
    } else if (trimmed.startsWith('> ')) {
      flushList(`l-${i}`);
      elements.push(
        <blockquote key={`bq-${i}`}>{trimmed.slice(2)}</blockquote>,
      );
    } else {
      flushList(`l-${i}`);
      if (trimmed.length > 0) {
        elements.push(<p key={`p-${i}`}>{trimmed}</p>);
      }
    }
  }
  flushList('end');

  return <>{elements}</>;
}

export function AdvisorChatDrawer({
  open,
  onClose,
  predictionRef,
  onBriefFinalized,
}: AdvisorChatDrawerProps): ReactElement | null {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [quickPrompts, setQuickPrompts] = useState<string[]>([]);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sending, setSending] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Finalize Brief Dialog state
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [advisorNotes, setAdvisorNotes] = useState('');
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeSuccess, setFinalizeSuccess] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && open) {
        if (showFinalizeModal) {
          setShowFinalizeModal(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, showFinalizeModal, onClose]);

  // Load or resume chat session when drawer opens
  useEffect(() => {
    if (!open) {
      return;
    }

    let isMounted = true;
    setLoadingSession(true);
    setError(null);
    setFinalizeSuccess(false);

    async function initChat() {
      try {
        const activeSession = await chatService.createOrResumeSession({
          codeModule: predictionRef.codeModule,
          codePresentation: predictionRef.codePresentation,
          studentKey: predictionRef.studentKey,
        });

        if (!isMounted) return;
        setSession(activeSession);

        // Fetch messages and starter prompts
        const [history, prompts] = await Promise.all([
          chatService.listMessages(activeSession.sessionId),
          chatService.getQuickPrompts().catch(() => activeSession.quickPrompts),
        ]);

        if (!isMounted) return;
        setMessages(history);
        setQuickPrompts(
          prompts && prompts.length > 0 ? prompts : activeSession.quickPrompts,
        );
      } catch (err) {
        if (!isMounted) return;
        setError(
          err instanceof Error
            ? err.message
            : 'Không thể kết nối phiên chat với Trợ lý AI.',
        );
      } finally {
        if (isMounted) {
          setLoadingSession(false);
        }
      }
    }

    void initChat();

    return () => {
      isMounted = false;
    };
  }, [
    open,
    predictionRef.codeModule,
    predictionRef.codePresentation,
    predictionRef.studentKey,
  ]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (open) {
      scrollToBottom();
    }
  }, [messages, sending, open]);

  // Calculate total session tokens
  const totalTokens = messages.reduce((acc, m) => acc + (m.tokensUsed || 0), 0);

  const handleSendMessage = async (textToSend?: string) => {
    const content = (textToSend ?? inputMessage).trim();
    if (!content || !session || sending) {
      return;
    }

    setInputMessage('');
    setSending(true);
    setError(null);

    // Optimistically show advisor message
    const tempAdvisorMsg: ChatMessage = {
      messageId: Date.now(),
      sessionId: session.sessionId,
      role: 'advisor',
      content,
      citedEvidence: [],
      tokensUsed: 0,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempAdvisorMsg]);

    try {
      const assistantReply = await chatService.sendMessage(session.sessionId, content);
      setMessages((prev) => [...prev, assistantReply]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Lỗi khi gửi tin nhắn tới Trợ lý AI.',
      );
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  };

  const handleConfirmFinalize = async () => {
    if (!session || finalizing) {
      return;
    }

    setFinalizing(true);
    setError(null);

    try {
      const generatedBrief = await chatService.finalizeBrief(session.sessionId, {
        advisorNotes: advisorNotes.trim() ? advisorNotes.trim() : undefined,
      });

      // Update session status to finalized
      setSession((prev) => (prev ? { ...prev, status: 'finalized', briefId: generatedBrief.briefId } : null));
      setShowFinalizeModal(false);
      setFinalizeSuccess(true);

      // Notify parent component (e.g. StudentDetailPage)
      if (onBriefFinalized) {
        onBriefFinalized(generatedBrief);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Không thể chốt Brief từ phiên hội thoại.',
      );
    } finally {
      setFinalizing(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div
        className={styles.drawer}
        role="dialog"
        aria-label="Cửa sổ Hỏi đáp với Trợ lý Cố vấn Học thuật"
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerInfo}>
            <div className={styles.headerTitleRow}>
              <span className={styles.botIcon} aria-hidden="true">AI</span>
              <h2 className={styles.headerTitle}>Advisor Copilot</h2>
              {session?.status === 'finalized' ? (
                <Badge color="success">Đã chốt Brief</Badge>
              ) : (
                <Badge color="primary">Đang tương tác</Badge>
              )}
            </div>
            <p className={styles.headerMeta}>
              Sinh viên:{' '}
              <span className={styles.studentKeyTag}>
                {predictionRef.studentKey}
              </span>
              {' · '}
              Học phần:{' '}
              <strong>
                {predictionRef.codeModule}-{predictionRef.codePresentation}
              </strong>
              {totalTokens > 0 && (
                <span> · {totalTokens.toLocaleString('vi-VN')} tokens</span>
              )}
            </p>
          </div>

          <div className={styles.headerActions}>
            {session && session.status === 'active' && (
              <Button
                variant="primary"
                className={styles.finalizeButton}
                onClick={() => setShowFinalizeModal(true)}
                disabled={sending || finalizing || messages.length <= 1}
              >
                Chốt Brief
              </Button>
            )}
            <button
              type="button"
              className={styles.closeButton}
              onClick={onClose}
              aria-label="Đóng cửa sổ chat"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Privacy Notice Banner */}
        <div className={styles.privacyNotice}>
          <span>🔒 <strong>Zero-PII Grounding:</strong> Ngữ cảnh được bảo mật qua mã băm ẩn danh, số liệu trích dẫn trực tiếp từ dự đoán & hành vi VLE.</span>
        </div>

        {/* Finalized Banner if applicable */}
        {session?.status === 'finalized' && (
          <div className={styles.finalizedBanner}>
            <span>
              ✓ <strong>Phiên đã chốt Brief:</strong> Nội dung trao đổi đã được tổng hợp thành bản thảo Brief chính thức (mã #{session.briefId ?? 'M8'}).
            </span>
            <Button
              variant="secondary"
              onClick={() => {
                // Allows starting a fresh consultation
                setSession((prev) => (prev ? { ...prev, status: 'active' } : null));
                setFinalizeSuccess(false);
              }}
            >
              Mở lại phiên
            </Button>
          </div>
        )}

        {/* Messages Body */}
        <div className={styles.messagesContainer}>
          {loadingSession && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <Spinner />
              <p style={{ marginTop: '0.5rem', color: '#64748b', fontSize: '0.875rem' }}>
                Đang khởi tạo phiên hỏi đáp và nạp ngữ cảnh sinh viên...
              </p>
            </div>
          )}

          {error && (
            <div
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                borderRadius: '8px',
                fontSize: '0.875rem',
              }}
            >
              <strong>Lỗi:</strong> {error}
            </div>
          )}

          {finalizeSuccess && (
            <div
              style={{
                padding: '0.85rem 1rem',
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                color: '#166534',
                borderRadius: '8px',
                fontSize: '0.875rem',
              }}
            >
              🎉 <strong>Thành công!</strong> Bản tóm tắt tư vấn (Brief) đã được tạo và lưu vào hệ thống. Bạn có thể xem và duyệt ngay trên hồ sơ sinh viên.
            </div>
          )}

          {messages.map((msg) => {
            const isAdvisor = msg.role === 'advisor';
            return (
              <div
                key={msg.messageId}
                className={`${styles.messageRow} ${
                  isAdvisor ? styles.advisorRow : styles.assistantRow
                }`}
              >
                <div className={styles.messageMeta}>
                  <span className={styles.senderName}>
                    {isAdvisor ? 'Cố vấn học tập (Bạn)' : 'Trợ lý LearnGuard'}
                  </span>
                  {msg.createdAt && (
                    <span>{formatTime(msg.createdAt)}</span>
                  )}
                </div>

                <div
                  className={`${styles.messageBubble} ${
                    isAdvisor ? styles.advisorBubble : styles.assistantBubble
                  }`}
                >
                  <FormattedContent text={msg.content} />

                  {/* Cited Evidence Cards */}
                  {!isAdvisor && msg.citedEvidence && msg.citedEvidence.length > 0 && (
                    <div className={styles.evidenceCard}>
                      <div className={styles.evidenceHeader}>
                        <span>📊 Bằng chứng trích dẫn từ mô hình & VLE:</span>
                      </div>
                      <div className={styles.evidenceChips}>
                        {msg.citedEvidence.map((ev: CitedEvidence, idx: number) => {
                          const label = signalLabel(ev.featureName);
                          const isRiskUp = ev.direction === 'increases_risk';
                          const isRiskDown = ev.direction === 'decreases_risk';
                          const valText =
                            ev.observedValue !== undefined && ev.observedValue !== null
                              ? String(ev.observedValue)
                              : ev.contribution !== undefined
                              ? `${ev.contribution > 0 ? '+' : ''}${ev.contribution.toFixed(2)}`
                              : '';

                          return (
                            <span
                              key={idx}
                              className={`${styles.evidenceChip} ${
                                isRiskUp
                                  ? styles.evidenceRiskUp
                                  : isRiskDown
                                  ? styles.evidenceRiskDown
                                  : ''
                              }`}
                              title={ev.description ?? ev.featureName}
                            >
                              <span>{label}</span>
                              {valText && (
                                <span className={styles.evidenceChipVal}>
                                  ({valText})
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {!isAdvisor && msg.tokensUsed > 0 && (
                    <span className={styles.tokenBadge}>
                      ⚡ {msg.tokensUsed} tokens
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Typing Indicator */}
          {sending && (
            <div className={`${styles.messageRow} ${styles.assistantRow}`}>
              <div className={styles.messageMeta}>
                <span className={styles.senderName}>Trợ lý LearnGuard</span>
              </div>
              <div className={styles.typingIndicator} aria-label="Đang phân tích...">
                <div className={styles.typingDot} />
                <div className={styles.typingDot} />
                <div className={styles.typingDot} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Prompts Bar */}
        {quickPrompts.length > 0 && session?.status === 'active' && (
          <div className={styles.quickPromptsSection}>
            <div className={styles.quickPromptsLabel}>Câu hỏi gợi ý nhanh:</div>
            <div className={styles.quickPromptsScroll}>
              {quickPrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={styles.promptChip}
                  disabled={sending}
                  onClick={() => {
                    setInputMessage(prompt);
                    void handleSendMessage(prompt);
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Bar */}
        <div className={styles.inputArea}>
          <div className={styles.inputRow}>
            <textarea
              className={styles.textarea}
              placeholder={
                session?.status === 'finalized'
                  ? 'Phiên này đã chốt Brief. Bấm "Mở lại phiên" ở trên nếu muốn hỏi tiếp...'
                  : 'Đặt câu hỏi phân tích nguy cơ, hành vi VLE hoặc soạn kế hoạch can thiệp... (Enter để gửi)'
              }
              value={inputMessage}
              disabled={sending || session?.status === 'finalized'}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
            />
            <Button
              variant="primary"
              className={styles.sendButton}
              onClick={() => void handleSendMessage()}
              disabled={sending || !inputMessage.trim() || session?.status === 'finalized'}
            >
              {sending ? 'Đang gửi...' : 'Gửi'}
            </Button>
          </div>
          <div className={styles.inputFooter}>
            <span>Nhấn <strong>Enter</strong> để gửi, <strong>Shift + Enter</strong> để xuống dòng</span>
            <span>{inputMessage.length} / 4000 ký tự</span>
          </div>
        </div>

        {/* Finalize Brief Confirmation Modal */}
        {showFinalizeModal && (
          <div className={styles.finalizeDialogOverlay}>
            <div className={styles.finalizeCard}>
              <h3 className={styles.finalizeTitle}>Chốt phiên & Tạo Brief chính thức</h3>
              <p className={styles.finalizeDesc}>
                Trợ lý sẽ tự động trích xuất các rào cản học tập, bằng chứng từ VLE và phương án can thiệp đã thống nhất trong cuộc hội thoại để tạo bản <strong>Advisor Brief</strong> chính thức lưu vào CSDL phục vụ phê duyệt quyết định.
              </p>

              <div>
                <label
                  htmlFor="advisor-notes-input"
                  style={{
                    display: 'block',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    marginBottom: '0.35rem',
                    color: '#334155',
                  }}
                >
                  Ghi chú bổ sung của Cố vấn (tùy chọn):
                </label>
                <textarea
                  id="advisor-notes-input"
                  className={styles.finalizeNotesArea}
                  placeholder="Ví dụ: Đã liên hệ phụ huynh, sinh viên cam kết nộp bù bài TMA tuần tới..."
                  value={advisorNotes}
                  onChange={(e) => setAdvisorNotes(e.target.value)}
                  disabled={finalizing}
                />
              </div>

              <div className={styles.finalizeActions}>
                <Button
                  variant="ghost"
                  onClick={() => setShowFinalizeModal(false)}
                  disabled={finalizing}
                >
                  Hủy
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void handleConfirmFinalize()}
                  disabled={finalizing}
                >
                  {finalizing ? 'Đang tổng hợp Brief...' : 'Xác nhận chốt & Lưu Brief'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
