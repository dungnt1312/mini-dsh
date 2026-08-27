# Web UI Redesign — Workspace Shell + Base Component Kit

- **Ngày:** 2026-08-27
- **Status:** approved qua brainstorming (visual companion, 5 màn mockup)
- **Phạm vi:** chỉ client `web/`. Không đổi gì server/API (`src/web/server.ts` giữ nguyên).

## 1. Mục tiêu

1. Thay shell 2 vùng (sidebar + chat) bằng **workspace shell kiểu desktop-app** đúng như mockup đã chốt: topbar điều khiển toàn cục · sidebar nhóm session · transcript trung tâm · composer "control center" · panel Environment bên phải.
2. Đi một bước xây **base component kit thật** (`web/components/ui/`) — primitive dùng lại được để các view tương lai (file tree, diff, terminal) không phải dựng lại từ đầu.
3. Giữ nguyên hai nguyên tắc kiến trúc hiện có: client **stateless**, render từ event stream (`projectItems`); log là nguồn sự thật duy nhất.

## 2. Non-goals

- Không thêm API backend mới; không implement file tree / diff / terminal / upload (chỉ chừa slot cấu trúc).
- Không có dữ liệu git/diff/branch thật → các số liệu branch trong mockup không render ở bản này.
- Không làm theme switcher hay light mode.

## 3. Quyết định đã chốt trong brainstorm

| Câu hỏi | Quyết định |
|---|---|
| Bố cục base | Layout 3 vùng theo ảnh tham chiếu do người dùng cung cấp (phương án A/B/C ban đầu bị bỏ) |
| Tính năng mở rộng (file tree, diff…) | Để sau; giờ chỉ cần base UI chuẩn, dễ scale |
| Preset hình ảnh | **Sharp kiểu VS Code** (thắng preset Balanced) |

## 4. Design tokens (`styles/tokens.css` v2)

```
Surfaces:   --bg-pane #0f1013 (topbar/sidebar/env)
            --bg-canvas #121418 (vùng chat)
            --bg-card #15171b        --bg-elevated #181a20 (composer, hover card)
            --bg-inset #101216 (chip code nền trong card)
Borders:    --border #24272e   --border-strong #33373f   --hairline #1c1f25 (phân cách pane)
Text:       --text #dcdee3  --text-dim #8b909c  --text-faint #565b66
Accent:     --accent #5c7cfa  --accent-tint rgba(110,139,255,.15)
            --accent-border rgba(110,139,255,.4)  --accent-text #9db4ff
Status:     --ok #46c286  --bad #f47166  --warn #d29922 (+ mỗi cái một tint/border rgba)
Radius:     --r-chip 3px  --r-sm 4px  --r-md 5px  --r-lg 7px
            (bubble user lệch góc 8/8/2/8 xử lý trong css của component)
Ring focus: 2px solid rgba(92,124,250,.55), offset 1px
Type:       --font-ui 'Instrument Sans', system-ui  (giữ)
            --font-mono 'JetBrains Mono' cho mọi path/id/count/duration/timestamp
Density:    row padding 5–9px, gap panel 10px, gutter ngang chat ≈46px desktop
```

Mọi màu cũ phẳng (#141517 hệ Zed cũ) được thay bởi ba mức pane/canvas/card ở trên.

## 5. Layout

```
┌ TopBar 42px ─ logo ⌬ · chip workspace(folder ▾) │ title + path-chip + provider-chip │ [☰][chat][◫ env] ┐
├ Sidebar 234px ┬ Center chat (flex-1) ──────────── ┬ EnvPanel 252px ┤
│ New chat ⌃N   │ transcript items                 │ SESSION         │
│ Search  ⌘K    │   … tool-row · approval · bubble │ MODEL           │
│ ▾ MINI-DSH    │ Composer control-center          │ FOLDER          │
│   sessions…   │                                  │ (slots)         │
│ footer status │                                  │                 │
└───────────────┴──────────────────────────────────┴─────────────────┘
```

**TopBar.** Trái: logo + chip workspace (điểm xanh connected). Giữa: tiêu đề session active, chip đường dẫn folder (mở dropdown → ô nhập path mới → `PUT /api/folder`), chip provider (chỉ hiển thị). Phải: nút toggle sidebar, toggle EnvPanel. Nút view dashed "tương lai" **không render mặc định**.

**Sidebar.** New chat (`⌃N`); ô Search luôn hiển thị (`⌘K` focus); sessions liệt kê dưới một group tiêu đề = tên workspace hiện tại (API không cho biết folder từng session → mọi session nằm trong 1 group, thứ tự giữ nguyên như listing server). Row: title + phụ đề `{eventCount} sự kiện`; row active = khối đặc `#20304d` + thanh trái accent 2px, bo phải 3px. Hover row lộ action rename/delete (pencil/trash → Modal xác nhận như hiện tại). Footer: dot trạng thái stream + `provider · connected/reconnecting/connecting`, vẫn toast khi lỗi như ngày nay.

**Center.** Gutter ngang 46px. Item:
- *UserBubble*: card phải, bg `#20242c`, radius 8/8/2/8.
- *AssistantMessage*: markdown tràn khổ cột, thinking panel bo 4px hairline; dòng meta nhỏ mono `formatTime` + CopyButton (không có retry — backend chưa có resend).
- *ToolCard* → **tool-row** compact: chevron hướng + icon verdict (check/x/spinner 3 chấm), tên bold, arg chips mono 3px, duration phải; expand ra `<pre>` inset như cũ.
- *ApprovalBar* giữ vị trí trên composer nhưng thành card sharp bo trái 3px viền trái 2px warn: chip `edit · file.tsx` + dòng hỏi + Button success/danger Allow/Deny. Nhiều approval xếp dọc.
- *Empty state*: mark ⌬ + suggestions là outline sharp buttons.
- Jump-to-bottom pill giữ hành vi (`useAutoScroll` nguyên trạng).

**Composer control-center.** Container r-lg 7px, viền `--border-strong`, không shadow. Hàng 1 textarea autosize (logic `resize` giữ nguyên), placeholder "Message… (Enter gửi · Shift+Enter xuống dòng)". Hàng action: model ChipSelect (menu liệt kê `meta.models`, chọn → `PUT /api/model`) · Stop ghost khi running · nút gửi 29px vuông bo 5px fill accent icon arrow-up, disable khi draft rỗng/ngắt kết nối. Plus/attach không render.

**EnvPanel.** Header uppercase + caret toggle collapse. Sections dạng label nhỏ + card r-sm: SESSION (id cắt ngắn mono, events, stream state dot), MODEL (provider, model có caret mở cùng Menu model, folder path mono break-all), và block dashed "Uploads · Diff staged" **chỉ render khi flag bật**.

**Responsive.** ≥1280px đủ 3 cột. <1280px EnvPanel thu về hidden, mở bằng nút toggle trên TopBar (overlay phải, đóng khi click ra ngoài/Esc). <1100px Sidebar chuyển drawer overlay như cơ chế đang có. Mobile giữ hành vi drawer cũ, EnvPanel tắt hẳn.

## 6. Base component kit — `web/components/ui/`

Quy ước: component nhận props, className bền vững `ui-<name>`, style nằm trong `styles/ui.css` đọc token; không hardcode màu/radius trong TSX. Icon set mở rộng trên `common/Icon.tsx` hiện có (stroke 1.8): thêm `folder, zap, clock, messageSquare, fileText, panelRight, gitBranch, alertTriangle, sliders, chevronRight, square` (stop), `arrowUp`.

| Component | API tối thiểu | Dùng ở đâu |
|---|---|---|
| `Button` | `variant: primary\|ghost\|outline\|success\|danger`, `size: sm\|md` | Allow/Deny, suggestions, New chat |
| `IconButton` | `variant: ghost\|outline\|tinted`, square sm/md | toggles, copy, rename/delete, send |
| `Chip` | static; `interactive?: boolean`, `caret?: boolean`, `icon?` | workspace/provider/model trigger, path chip |
| `CodeChip` | text mono nền inset | arg chips tool-row, inline code fallback |
| `Badge` | `tone: amber\|blue\|green` | "slot sau", count |
| `Panel` | `variant: flat\|raised` | EnvPanel section cards |
| `Kbd` | children keycap | hint ⌘N/⌘K, placeholder composer |
| `Menu`/`Select` | listbox keyboard ↑↓↵Esc, aria-selected | model picker (composer + env), folder switcher |
| `TextInput` | leading icon, right slot (Kbd) | search sidebar, nhập path mới |
| `Modal` | open/title/onConfirm/onDismiss (giữ API ConfirmDialog) | delete confirm, folder input? (folder dùng inline popover thì Modal chỉ cho confirm xóa) |
| `Spinner` | giữ nguyên, restyle token | tool pending, connecting |

`Toast`, `useAutoScroll`, `useHotkeys`, `useSessionStream`, `lib/*` giữ nguyên hành vi.

## 7. Hotkeys

| Phím | Hành động |
|---|---|
| `Ctrl/Cmd+N` | new session (chuyển từ Ctrl+K cũ) |
| `Ctrl/Cmd+K` | focus ô search session |
| `Esc` | đóng menu/drawer/modal |
| Enter / Shift+Enter | gửi / xuống dòng (giữ nguyên) |

Update tương ứng trong docs và README mô tả phím.

## 8. Flag & slot tương lai

`SHOW_SLOTS: boolean` const ở `web/lib/config.ts`, mặc định **false**. Khi true render: nút view dashed (file panel, side panel), Badge "slot sau" git/branch, block Uploads·Diff trong EnvPanel — đúng hình ảnh mockup, phục vụ demo roadmap. Khi false UI chỉ còn tính năng thật.

## 9. Xử lý trạng thái/lỗi (không đổi logic)

- REST fail → toast (hiện có); `streamError` → toast; trạng thái `connecting/open/reconnecting` điều khiển pill footer + disable composer.
- Turn fail/stop vẫn là StatusLine trong transcript.
- Model/folder đổi thất bại (400/404) → toast, giá trị chọn revert về `meta`.

## 10. Accessibility

- Mọi control là `<button>` thật; icon button bắt buộc `aria-label`.
- Select/Menu: `role="listbox"/"option"`, `aria-selected`, Esc đóng, focus quay lại trigger.
- Modal: `role="dialog"` + `aria-modal` + label từ title.
- Focus-visible ring đồng bộ toàn app; hover không phải tín hiệu duy nhất (action ẩn hiện được cả qua focus).

## 11. Kiểm thử & nghiệm thu

- `npm run build:web` build sạch; `tests/web/server.spec.ts` vẫn green (server không đổi).
- Thêm `tests/web/ui.spec.tsx`: smoke-render `Chip/Kbd/Button/Badge` bằng `react-dom/server` (không cần jsdom) — assert class variant đúng, không crash.
- QA thủ công theo checklist so ảnh mockup ở 3 bề rộng 1600/1280/1000: spacing, radius, trạng thái hover/active/disabled, hotkeys mới, vòng đời approval, reconnect SSE.

## 12. Thứ tự triển khai dự kiến (chi tiết hóa bằng plan)

1. Tokens v2 + `ui.css` + mở rộng Icon set
2. Primitives kit (Bảng mục 6)
3. Shell: AppShell/TopBar/Sidebar/EnvPanel + responsive
4. Chat surface: Transcript parts, ToolCard→tool-row, ApprovalBar→card, Composer control-center, empty state
5. Dọn css/component cũ vô dụng, cập nhật `docs/web.md`, flag default off

## Mở-kết quả rõ ràng (đã quyết định sẵn)

- Nhóm session theo folder: không khả thi từ API → một group duy nhất (mục 5).
- Retry message: bỏ (backend chưa hỗ trợ) (mục 5).
- Branch stats/uploads: chỉ hiện khi `SHOW_SLOTS=true` (mục 8).
