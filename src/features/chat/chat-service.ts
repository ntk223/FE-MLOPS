import type {
  AdvisorBrief,
  ChatMessage,
  ChatSession,
  CreateChatSessionParams,
  FinalizeBriefParams,
} from '../../contracts/api';
import type { ILearnGuardApiClient } from '../../api/client';

/**
 * Service encapsulating interactive Advisor Copilot Chatbot workflows.
 */
export class ChatService {
  private readonly inFlightSessions = new Map<string, Promise<ChatSession>>();

  constructor(private readonly api: ILearnGuardApiClient) {}

  /** Lấy danh sách câu hỏi gợi ý nhanh từ server. */
  getQuickPrompts(): Promise<string[]> {
    return this.api.getQuickPrompts();
  }

  /** Khởi tạo hoặc lấy lại phiên chat đang active của sinh viên (chống gọi đúp khi mount). */
  createOrResumeSession(params: CreateChatSessionParams): Promise<ChatSession> {
    const key = `${params.codeModule}::${params.codePresentation}::${params.studentKey}`;
    const inFlight = this.inFlightSessions.get(key);
    if (inFlight) {
      return inFlight;
    }
    const promise = this.api.createOrResumeChatSession(params).finally(() => {
      this.inFlightSessions.delete(key);
    });
    this.inFlightSessions.set(key, promise);
    return promise;
  }

  /** Lấy chi tiết phiên chat. */
  getSession(sessionId: number): Promise<ChatSession> {
    return this.api.getChatSession(sessionId);
  }

  /** Lấy lịch sử tin nhắn trong phiên. */
  listMessages(sessionId: number, limit = 100, offset = 0): Promise<ChatMessage[]> {
    return this.api.listChatMessages(sessionId, limit, offset);
  }

  /** Gửi câu hỏi của cố vấn và nhận câu trả lời kèm bằng chứng từ trợ lý. */
  sendMessage(sessionId: number, content: string): Promise<ChatMessage> {
    return this.api.sendChatMessage(sessionId, content);
  }

  /** Chốt phiên chat thành bản tóm tắt Brief chính thức. */
  finalizeBrief(
    sessionId: number,
    params?: FinalizeBriefParams,
  ): Promise<AdvisorBrief> {
    return this.api.finalizeChatToBrief(sessionId, params);
  }
}
