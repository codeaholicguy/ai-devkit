# Development Guide - AI DevKit Fork

Hướng dẫn này dành cho việc phát triển và sử dụng fork cá nhân của AI DevKit.

## Setup môi trường development

### 1. Clone và cài đặt

```bash
git clone <your-fork-url>
cd ai-devkit
npm install
```

### 2. Build project

```bash
npm run build
```

### 3. Link globally (khuyến nghị)

```bash
npm link
```

Sau khi link, bạn có thể sử dụng `ai-devkit` ở bất kỳ đâu:

```bash
cd /path/to/your/project
ai-devkit init
```

### 4. Hoặc chạy trực tiếp với npm

```bash
# Từ thư mục ai-devkit
npm run dev init

# Với arguments
npm run dev -- init --environment copilot --all
npm run dev -- phase requirements
```

## Development workflow

### Chỉnh sửa code

1. Chỉnh sửa files trong `src/`
2. Build lại: `npm run build`
3. Nếu đã link: thay đổi có hiệu lực ngay lập tức
4. Nếu chưa link: chạy `npm run dev -- <command>`

### Watch mode (tự động build khi có thay đổi)

```bash
npm run dev:watch init
```

### Testing thay đổi

```bash
# Tạo một thư mục test
mkdir /tmp/test-project
cd /tmp/test-project

# Chạy init
ai-devkit init

# Hoặc
npm run dev init
```

## Cấu trúc thư mục

```
ai-devkit/
├── src/
│   ├── commands/          # CLI commands
│   │   ├── init.ts        # Init command
│   │   └── phase.ts       # Phase command
│   ├── lib/               # Core libraries
│   │   ├── Config.ts      # Configuration management
│   │   └── TemplateManager.ts  # Template handling
│   ├── cli.ts             # CLI entry point
│   ├── index.ts           # Library exports
│   └── types.ts           # TypeScript types
├── templates/
│   ├── commands/          # Command templates (cho Cursor, Claude, Copilot)
│   ├── env/               # Environment-specific configs
│   │   ├── cursor/        # Cursor rules & workspace
│   │   └── claude/        # Claude workspace
│   └── phases/            # Phase templates
├── dist/                  # Built files (generated)
└── package.json
```

## Thêm features mới

### Thêm một environment mới

1. Cập nhật `src/types.ts`: thêm vào `Environment` type
2. Cập nhật `src/commands/init.ts`: thêm vào choices
3. Cập nhật `src/lib/TemplateManager.ts`: thêm method copy templates
4. Tạo templates trong `templates/env/<environment>/`

### Thêm một phase mới

1. Thêm vào `AVAILABLE_PHASES` trong `src/types.ts`
2. Thêm display name vào `PHASE_DISPLAY_NAMES`
3. Tạo template file trong `templates/phases/<phase>.md`

### Thêm một command mới

1. Tạo template trong `templates/commands/<command>.md`
2. Template sẽ tự động được copy cho tất cả environments

## Unlink khi không dùng nữa

```bash
npm run local:unlink
# Hoặc
npm unlink -g ai-devkit
```

## Troubleshooting

### Command không được cập nhật sau khi sửa code

```bash
npm run build
npm link
```

### Lỗi "command not found" sau khi link

```bash
# Kiểm tra npm global bin path
npm bin -g

# Đảm bảo path này có trong $PATH
echo $PATH
```

### Muốn test mà không ảnh hưởng global

```bash
# Không link, chỉ dùng npm run dev
npm run dev init
```

## GitHub Copilot Integration

Prompts được tự động copy vào `.github/prompts/` khi chọn environment `copilot` hoặc `all`.

Sử dụng trong VS Code:

1. Mở Copilot Chat (Ctrl/Cmd + I)
2. Gõ `#` để xem danh sách prompts
3. Chọn prompt cần dùng

## Notes

- Fork này không được publish lên npm
- Dùng `npm link` để sử dụng như global command
- Hoặc dùng `npm run dev` để test trực tiếp
- Tất cả thay đổi chỉ có hiệu lực sau khi build lại
