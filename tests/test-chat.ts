import assert from 'node:assert';
import { MockApiClient } from '../src/mocks/mock-client';
import { ChatService } from '../src/features/chat/chat-service';
import type { PredictionRef } from '../src/contracts/api';

async function runTests() {
  console.log('=== RUNNING ADVISOR CHATBOT UNIT & INTEGRATION TESTS ===\n');

  const mockApi = new MockApiClient();
  const chatService = new ChatService(mockApi);

  const predictions = await mockApi.listPredictions({});
  const student = predictions.items.find((s) => s.status === 'scored') ?? predictions.items[0];
  const studentRef: PredictionRef = {
    codeModule: student.codeModule,
    codePresentation: student.codePresentation,
    studentKey: student.studentKey,
  };

  // 1. Test quick prompts
  console.log('[Test 1] Lấy danh sách câu hỏi gợi ý nhanh (Quick Prompts)');
  const quickPrompts = await chatService.getQuickPrompts();
  assert(Array.isArray(quickPrompts), 'quickPrompts phải là một array');
  assert(quickPrompts.length >= 3, 'Phải có ít nhất 3 câu hỏi gợi ý nhanh');
  console.log(`  ✓ Đã lấy ${quickPrompts.length} câu hỏi gợi ý: "${quickPrompts[0]}"...`);

  // 2. Test create or resume chat session
  console.log('\n[Test 2] Khởi tạo phiên chat cho sinh viên');
  const session = await chatService.createOrResumeSession(studentRef);
  assert(session.sessionId > 0, 'sessionId phải là số nguyên dương');
  assert.strictEqual(session.studentKey, studentRef.studentKey);
  assert.strictEqual(session.codeModule, studentRef.codeModule);
  assert.strictEqual(session.codePresentation, studentRef.codePresentation);
  assert.strictEqual(session.status, 'active');
  assert.strictEqual(session.briefId, null, 'Ban đầu briefId phải là null');
  console.log(`  ✓ Đã khởi tạo phiên chat #${session.sessionId} (status: ${session.status})`);

  // 3. Test idempotency: Calling createOrResumeSession returns the same active session
  console.log('\n[Test 3] Tính liên tục của phiên: Gọi lại trả về cùng phiên active');
  const resumedSession = await chatService.createOrResumeSession(studentRef);
  assert.strictEqual(resumedSession.sessionId, session.sessionId, 'Phải tái sử dụng phiên active');
  console.log(`  ✓ Phiên #${resumedSession.sessionId} được tái sử dụng thành công`);

  // 4. Test initial messages (welcome message seeded)
  console.log('\n[Test 4] Kiểm tra tin nhắn chào mừng khởi đầu');
  const initialMessages = await chatService.listMessages(session.sessionId);
  assert(initialMessages.length >= 1, 'Phải có ít nhất 1 tin nhắn chào mừng');
  assert.strictEqual(initialMessages[0].role, 'assistant');
  console.log(`  ✓ Tin nhắn chào mừng: "${initialMessages[0].content.slice(0, 50)}..."`);

  // 5. Test advisor asking about risk reasons and verifying cited evidence
  console.log('\n[Test 5] Cố vấn hỏi về nguyên nhân nguy cơ rớt môn');
  const riskQuestion = 'Tại sao sinh viên này có nguy cơ rớt môn cao?';
  const riskReply = await chatService.sendMessage(session.sessionId, riskQuestion);
  assert.strictEqual(riskReply.role, 'assistant');
  assert(riskReply.content.length > 50, 'Nội dung trả lời phải đầy đủ chi tiết');
  assert(riskReply.tokensUsed > 0, 'Phải đo lường số token đã dùng');
  assert(Array.isArray(riskReply.citedEvidence), 'Phải có mảng citedEvidence');
  assert(riskReply.citedEvidence.length > 0, 'Phải trích dẫn ít nhất 1 đặc trưng từ mô hình');
  console.log(`  ✓ Trợ lý phản hồi (${riskReply.tokensUsed} tokens), trích dẫn ${riskReply.citedEvidence.length} bằng chứng:`);
  riskReply.citedEvidence.forEach((ev) => {
    console.log(`    - ${ev.featureName}: đóng góp ${ev.contribution}`);
  });

  // 6. Test advisor asking about VLE interaction drop-off
  console.log('\n[Test 6] Cố vấn hỏi về sụt giảm tương tác VLE theo tuần');
  const vleQuestion = 'Sinh viên sụt giảm tương tác từ tuần mấy?';
  const vleReply = await chatService.sendMessage(session.sessionId, vleQuestion);
  assert.strictEqual(vleReply.role, 'assistant');
  assert(vleReply.content.includes('tuần 3'), 'Phản hồi phải phân tích mốc tuần 3');
  assert(vleReply.citedEvidence.some((e) => e.featureName.includes('click') || e.featureName.includes('trend')), 'Phải trích dẫn chỉ số clicks');
  console.log(`  ✓ Trợ lý phân tích chi tiết dữ liệu click theo tuần và độ dốc suy giảm`);

  // 7. Test advisor asking for intervention script and email draft
  console.log('\n[Test 7] Yêu cầu gợi ý kịch bản trao đổi và soạn email');
  const scriptQuestion = 'Gợi ý kịch bản trao đổi và soạn email mẫu gửi sinh viên';
  const scriptReply = await chatService.sendMessage(session.sessionId, scriptQuestion);
  assert.strictEqual(scriptReply.role, 'assistant');
  assert(scriptReply.content.includes('kịch bản') || scriptReply.content.includes('mẫu'), 'Phải có kịch bản hoặc mẫu email');
  console.log(`  ✓ Trợ lý cung cấp kịch bản sư phạm và soạn sẵn mẫu email gửi sinh viên`);

  // 8. Verify history list length
  console.log('\n[Test 8] Lịch sử hội thoại đầy đủ các lượt hỏi đáp');
  const updatedHistory = await chatService.listMessages(session.sessionId);
  // Initial (1) + 3 advisor turns + 3 assistant turns = 7
  assert.strictEqual(updatedHistory.length, 7, 'Phải có đủ 7 tin nhắn trong phiên');
  console.log(`  ✓ Tổng số tin nhắn đã lưu trong phiên: ${updatedHistory.length}`);

  // 9. Test finalize chat to official AdvisorBrief
  console.log('\n[Test 9] Chốt phiên chat thành bản tóm tắt Brief chính thức (Finalize Brief)');
  const advisorNotes = 'Đã thống nhất gửi email nhắc nhở trước ngày 15, kết nối trợ giảng kèm cặp.';
  const finalizedBrief = await chatService.finalizeBrief(session.sessionId, { advisorNotes });

  assert(finalizedBrief.briefId > 0, 'Brief ID phải hợp lệ');
  assert.strictEqual(finalizedBrief.studentKey, studentRef.studentKey);
  assert.strictEqual(finalizedBrief.codeModule, studentRef.codeModule);
  assert.strictEqual(finalizedBrief.codePresentation, studentRef.codePresentation);
  assert(finalizedBrief.reasons.length >= 2, 'Brief phải tổng hợp các lý do rủi ro từ cuộc hội thoại');
  assert(finalizedBrief.supportSuggestions.length >= 2, 'Brief phải có đề xuất hỗ trợ');
  assert(finalizedBrief.limitations.some((l) => l.includes(advisorNotes)), 'Ghi chú của cố vấn phải được lưu trong limitations');
  console.log(`  ✓ Đã tổng hợp thành công Brief #${finalizedBrief.briefId} (version ${finalizedBrief.version})`);
  console.log(`    - Tóm tắt: ${finalizedBrief.summary}`);
  console.log(`    - Số lý do: ${finalizedBrief.reasons.length}`);
  console.log(`    - Số đề xuất can thiệp: ${finalizedBrief.supportSuggestions.length}`);

  // 10. Verify session status updated to finalized and linked to briefId
  console.log('\n[Test 10] Kiểm tra trạng thái phiên sau khi chốt');
  const checkedSession = await chatService.getSession(session.sessionId);
  assert.strictEqual(checkedSession.status, 'finalized', 'Trạng thái phiên phải đổi thành finalized');
  assert.strictEqual(checkedSession.briefId, finalizedBrief.briefId, 'Phiên phải liên kết đúng briefId');
  console.log(`  ✓ Phiên #${checkedSession.sessionId} chuyển sang trạng thái: ${checkedSession.status}, gắn với briefId: ${checkedSession.briefId}`);

  // 11. Test that sending message on finalized session is rejected
  console.log('\n[Test 11] Không cho phép gửi tin nhắn trên phiên đã chốt');
  let rejected = false;
  try {
    await chatService.sendMessage(session.sessionId, 'Thêm câu hỏi sau khi đã chốt');
  } catch (err: any) {
    rejected = true;
    console.log(`  ✓ Bị từ chối hợp lệ: ${err.message}`);
  }
  assert(rejected, 'Gửi tin nhắn trên phiên đã chốt phải ném lỗi');

  // 12. Test advisor decision workflow on the finalized brief
  console.log('\n[Test 12] Cố vấn phê duyệt chấp nhận Brief đã chốt (Decision workflow)');
  const decision = await mockApi.saveBriefDecision(finalizedBrief.briefId, 'accepted');
  assert.strictEqual(decision.decision, 'accepted');
  assert.strictEqual(decision.briefId, finalizedBrief.briefId);
  console.log(`  ✓ Đã ghi nhận quyết định "${decision.decision}" cho Brief #${decision.briefId} vào lúc ${decision.decidedAt}`);

  console.log('\n======================================================');
  console.log('🎉 TOÀN BỘ 12/12 TEST CASES CHATBOT ĐÃ VƯỢT QUA XUẤT SẮC!');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
