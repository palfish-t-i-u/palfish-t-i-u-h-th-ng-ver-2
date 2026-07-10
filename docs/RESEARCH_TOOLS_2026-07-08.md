# Research: Open-source Tools cho GMV (2026-07-08)

Nghiên cứu 3 tool + 1 skill ecosystem để đánh giá tích hợp vào dự án.

---

## 1. PageAgent (Alibaba) — DOM-based browser AI agent

**Repo**: https://github.com/alibaba/page-agent  
**Stars**: ~25k | **License**: MIT | **Status**: Production-ready (v1.11.0)

**Là gì**: JS snippet nhúng vào website, AI đọc DOM trực tiếp thay vì screenshot. Không cần vision model, tiết kiệm token, nhanh hơn.

**GMV fit**: **Cao** — có thể dùng cho:
- AI Copilot tự động hoá thao tác trên DingTalk web / CRM / hệ thống nội bộ
- Auto-fill form ERP/CRM
- Điều khiển web bằng ngôn ngữ tự nhiên

**Free**: Có. MIT. Tự cung cấp API key LLM (GPT, Claude, Qwen, DeepSeek...).

**Cài đặt nhanh (demo)**:
```html
<script src="https://cdn.jsdelivr.net/npm/page-agent@1.11.0/dist/iife/page-agent.demo.js" crossorigin="anonymous"></script>
```

**Production (npm)**:
```bash
npm install page-agent
```
```javascript
import { PageAgent } from 'page-agent'
const agent = new PageAgent({
    model: 'gpt-4o',
    baseURL: 'https://api.openai.com/v1',
    apiKey: 'YOUR_API_KEY',
    language: 'vi',
})
await agent.execute('Click nút thanh toán')
```

**MCP Server** (để Claude/Cursor điều khiển web):
```json
{
  "mcpServers": {
    "page-agent": {
      "command": "npx",
      "args": ["-y", "@page-agent/mcp"],
      "env": {
        "LLM_BASE_URL": "https://api.openai.com/v1",
        "LLM_API_KEY": "sk-xxx",
        "LLM_MODEL_NAME": "gpt-4o"
      }
    }
  }
}
```
Cần Chrome Extension "Page Agent Ext" + Node.js >= 20.

**Lưu ý**: PageAgent dùng OpenAI-compatible format. Dùng Claude cần proxy (LiteLLM).

**Hiện tại**: Chưa tìm use case cụ thể → để dành.

---

## 2. Underthesea — Vietnamese NLP toolkit

**Repo**: https://github.com/undertheseanlp/underthesea  
**Stars**: 1.8k | **License**: Apache-2.0 | **Status**: Active (v9.5.0, May 2026)

**Là gì**: Full NLP pipeline tiếng Việt bằng Python.

**Capabilities**:
- Tách từ: `word_tokenize`
- NER (người/tổ chức/địa điểm): `ner`
- Phân tích cảm xúc: `sentiment` → positive/negative/neutral
- Dịch thuật: `translate`
- Text-to-speech: `tts`
- Phát hiện ngôn ngữ: `lang_detect`

**GMV fit**: **Trung bình** — hữu ích nếu:
- Phân tích cảm xúc feedback khách hàng tiếng Việt
- Search/NER trên dữ liệu text nội bộ
- Dịch tài liệu Chinese→Vietnamese (DingTalk docs, etc.)

**Cài**:
```bash
pip install underthesea
```
```python
from underthesea import word_tokenize, sentiment, ner
sentiment("Dịch vụ rất tốt, tôi hài lòng")  # → 'positive'
```

**Node.js**: Không native — cần Python subprocess hoặc expose REST API.

---

## 3. Harness Starter / Gangline — git-based multi-agent scaffold

**Repo**: https://github.com/ogamic/harness-starter-git-based  
**Stars**: 8 | **Status**: Experimental (5 commits, no community)

**Là gì**: Template tổ chức multi-agent AI workflow qua git/markdown. PM agent + domain sub-agents track decisions bằng markdown files.

**GMV fit**: **Thấp** — concept hay nhưng quá sớm, Claude Code đã có built-in workflow tools tốt hơn.

**Kết luận**: Skip.

---

## 4. skills.sh — AI agent skill package manager

**URL**: https://skills.sh  
**Stars**: 25.4k ecosystem | **Status**: Active (909k+ skills)

**Là gì**: npm-like package manager cho AI agent capabilities. Install skill → agent có thêm kiến thức/workflow chuyên biệt.

**Đã cài** (global, dùng được mọi project):
```bash
# Đã chạy từ ~/ → global install
npx skills add vercel-labs/skills@find-skills
```

**Dùng**:
```bash
npx skills find "react testing"      # tìm skill theo keyword
npx skills find "deployment"
npx skills add <owner/repo@skill>    # cài skill tìm được
```

**GMV fit**: Developer productivity tool — không tích hợp vào product, nhưng tăng tốc dev khi cần domain-specific skills.

---

## Tóm tắt đánh giá

| Tool | GMV Fit | Effort | Trạng thái |
|------|---------|--------|------------|
| PageAgent | Cao | Thấp-Trung | Chờ use case |
| Underthesea | Trung bình | Trung bình | Chờ nhu cầu NLP |
| Gangline | Thấp | Cao | Skip |
| skills.sh find-skills | Dev tool | Thấp | Đã cài global |
