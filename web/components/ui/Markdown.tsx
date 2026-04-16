"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { attachmentDownloadURL } from "@/lib/api";

/**
 * Render markdown with GitHub-flavored extensions. Image URLs of the form
 * `attachment:<id>` are rewritten to the API download endpoint so uploaded
 * files render inline.
 */
export function Markdown({ source }: { source: string }) {
  if (!source) return null;
  return (
    <div className="prose prose-sm max-w-none text-ink-800">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => {
          if (url.startsWith("attachment:")) {
            return attachmentDownloadURL(url.slice("attachment:".length));
          }
          return url;
        }}
        components={{
          a: (props) => (
            <a
              {...props}
              target={props.href?.startsWith("http") ? "_blank" : undefined}
              rel="noreferrer"
              className="text-brand-600 underline hover:text-brand-700"
            />
          ),
          img: (props) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img {...props} alt={props.alt ?? ""} className="max-w-full rounded-md border border-ink-200" />
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
