import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { cn } from "@/lib/utils";

interface TiptapEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export function TiptapEditor({
  value,
  onChange,
  placeholder = "Add instructions...",
  className,
  minHeight = "120px",
}: TiptapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    onUpdate({ editor }) {
      // Emit empty string for empty doc so the parent can treat it as absent
      const html = editor.isEmpty ? "" : editor.getHTML();
      onChange(html);
    },
    editorProps: {
      handleKeyDown(_view, event) {
        // Shift+Enter inserts a hard break instead of submitting any parent form
        if (event.key === "Enter" && event.shiftKey) {
          return false; // let Tiptap handle it (inserts <br>)
        }
        return false;
      },
    },
  });

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
        "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        "[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[var(--tiptap-min-h)]",
        "[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
        "[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground",
        "[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none",
        "[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left",
        "[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0",
        "[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-4",
        "[&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-4",
        "[&_.ProseMirror_p]:my-1",
        className,
      )}
      style={{ "--tiptap-min-h": minHeight } as React.CSSProperties}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
