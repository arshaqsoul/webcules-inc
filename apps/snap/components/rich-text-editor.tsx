"use client";

/* Lightweight WYSIWYG editor (WEB-286) — Tiptap over a JSON document model,
 * so photographers never see raw HTML and the contentEditable bug class
 * (unclosed tags, style bleed) is structurally impossible. HTML in/out to
 * match the snippet/email pipeline; merge fields ({{client_name}}) are plain
 * text. Loaded via dynamic import — the ~60KB stays out of the main bundle. */
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 88,
}: {
  /** HTML string (snippet/email body). */
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false })],
    content: value || "<p></p>",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose-snap min-w-0 outline-none",
        style: `min-height:${minHeight}px`,
        ...(placeholder ? { "data-placeholder": placeholder } : {}),
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  // External value swaps (e.g. loading a snippet into the form) replace the
  // doc without touching cursor state otherwise.
  useEffect(() => {
    if (editor && value !== editor.getHTML()) editor.commands.setContent(value || "<p></p>", { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (!editor) return <div className="rounded-md border border-hairline bg-canvas" style={{ minHeight }} />;

  const btn = "rounded-md px-2 py-1 text-xs font-medium text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40";

  return (
    <div className="rounded-md border border-hairline bg-canvas">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-hairline px-1.5 py-1">
        <button type="button" className={btn} onClick={() => editor.chain().focus().toggleBold().run()} disabled={!editor.can().chain().focus().toggleBold().run()} aria-label="Bold"><strong>B</strong></button>
        <button type="button" className={btn} onClick={() => editor.chain().focus().toggleItalic().run()} disabled={!editor.can().chain().focus().toggleItalic().run()} aria-label="Italic"><em>I</em></button>
        <button type="button" className={btn} onClick={() => editor.chain().focus().toggleBulletList().run()} aria-label="Bullet list">• List</button>
        <button type="button" className={btn} onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} aria-label="Clear formatting">Clear</button>
      </div>
      <EditorContent editor={editor} className="px-3 py-2 text-sm text-ink [&_.tiptap]:outline-none [&_.tiptap_p]:my-1 [&_.tiptap_ul]:my-1 list-disc pl-5" />
    </div>
  );
}
