# 笔记锁定与知识树返回导航修复

本次修复以 `v1.5.1`（`3619ec0812c0061860ac7a0c657a74e9f95357f2`）为基线。

## 问题与修改

- 富文本编辑器的 `setEditable(false)` 只限制 DOM 输入，工具栏命令仍可产生正文事务。新增 ProseMirror 事务守卫，拒绝只读状态下的正文修改；禁用格式、撤销和插入入口，锁定时关闭已经打开的编辑弹层。查找和选择仍可使用。接收到新的笔记内容时，仅在同步 `setContent` 调用内允许可信内容刷新。
- Markdown 编辑器同时设置 `EditorView.editable` 和 `EditorState.readOnly`。共享命令、预览修改、AI 插入、附件回调和保存入口检查当前编辑状态。锁定或切换笔记会使先前的上传与粘贴作用域失效。只读状态下仍接收协作内容，并刷新预览、字数和大纲，但不会发出本地保存。
- 从 A 的正文链接打开 B 后，直接从知识树返回 A 的请求没有登记新的导航意图，会被已有的过期回执保护拦截。知识树现在通过统一的 `useNoteLoader` 加载笔记，同时丢弃被后续导航取代的请求。

## 验证记录

2026-10-12，在隔离测试实例与合成笔记上验证：

- 10 个相关测试文件、79 项测试全部通过，包含动态锁定、Backspace、命令与插入接口、延迟上传、只读内容刷新及 Yjs 协作、桌面/移动知识树返回导航和迟到请求。
- `npm run build:web` 通过，包括 TypeScript、Vite、通知 UI 检查及静态资源压缩。存在原有的大体积 chunk 提示。
- 修改文件与原版 ESLint 诊断对比：新增诊断为 0；原有诊断未作为本次修复范围。
- 浏览器桌面及 393×852 窄屏验证：锁定后的富文本格式/表格/附件按钮禁用，Markdown 写入工具栏隐藏，快捷键不改变内容；解锁后两种编辑器加粗与保存正常，重新打开后内容保持。
- 浏览器验证 A → 正文链接 B → 左侧知识树 A，能返回正确笔记及 URL。
- 两种格式的锁定笔记，携带当前版本的正文更新请求均返回 `403 NOTE_LOCKED`，原内容保持。

相关测试命令（在 `frontend` 目录执行）：

```sh
npm run test:run -- \
  src/components/__tests__/MarkdownEditor.readOnly.test.tsx \
  src/lib/__tests__/richTextReadOnlyGuard.test.ts \
  src/components/__tests__/MarkdownEditor.photoUpload.test.tsx \
  src/components/__tests__/KnowledgeTreeNavigation.test.tsx \
  src/components/__tests__/NoteDeepLinkBridge.test.tsx \
  src/components/__tests__/KnowledgeTreeCreatedSelection.test.tsx \
  src/lib/__tests__/noteActivationGuard.test.ts \
  src/lib/__tests__/noteLoadCoordinator.test.ts \
  src/lib/__tests__/markdownCodeBlockFormatting.test.tsx \
  src/components/__tests__/TiptapInitializationFlushSync.test.tsx \
  --maxWorkers=1 --minWorkers=1
npm run build:web
```

此次验证覆盖 Web 编辑器，未执行 Electron 或 Android 原生应用验收。后端代码和数据格式均未修改。
