"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DownloadButton } from "@/components/ui/DownloadButton";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";

export interface LessonFile {
  id: string;
  lesson_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  position: number;
  can_download: boolean;
}

const BUCKET = "lesson-files";

function formatSize(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Files attached to one lesson. Teachers upload/manage; students open or download. */
export function LessonFilesManager({ lessonId, canEdit, canDownload = true }: { lessonId: string; canEdit: boolean; canDownload?: boolean }) {
  const t = useT();
  const toast = useToast();
  const [files, setFiles] = useState<LessonFile[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const { data, error } = await getSupabase()
        .from("lesson_files")
        .select("id,lesson_id,storage_path,file_name,mime_type,file_size,position,can_download")
        .eq("lesson_id", lessonId)
        .order("position");
      if (error) throw error;
      setFiles((data ?? []) as LessonFile[]);
    } catch (error) {
      console.error("Unable to load lesson files:", error);
      setFiles([]);
    }
  }, [lessonId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount into component state
    void load();
  }, [load]);

  async function upload(file: File) {
    if (file.size > 50 * 1024 * 1024) {
      toast.push(t("lessons.files.tooBig"));
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^\p{L}\p{N}._-]+/gu, "-");
      const path = `${lessonId}/${crypto.randomUUID()}-${safeName}`;
      const { error } = await getSupabase().storage.from(BUCKET)
        .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (error) throw error;
      const count = files?.length ?? 0;
      await getSupabase().from("lesson_files").insert({
        lesson_id: lessonId,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
        file_size: file.size,
        position: count,
      });
      await load();
    } catch (error) {
      console.error("Unable to upload the lesson file:", error);
      toast.push(t("lessons.files.uploadError"));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(file: LessonFile) {
    try {
      await getSupabase().storage.from(BUCKET).remove([file.storage_path]);
      await getSupabase().from("lesson_files").delete().eq("id", file.id);
      await load();
    } catch (error) {
      console.error("Unable to delete the lesson file:", error);
      toast.push(t("lessons.files.deleteError"));
    }
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {(files ?? []).map((file) => (
          <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cova-line p-3 text-sm">
            <span className="min-w-0">
              <span className="block truncate font-medium">{file.file_name}</span>
              <span className="text-xs text-cova-mute">{formatSize(file.file_size)}</span>
            </span>
            <span className="flex items-center gap-2">
              <SignedFileButton bucket={BUCKET} path={file.storage_path} fileName={file.file_name} label={t("resources.openInNewTab")} />
              {file.can_download && canDownload && (
                <DownloadButton getUrl={async () => {
                  const { data } = await getSupabase().storage.from(BUCKET)
                    .createSignedUrl(file.storage_path, 600, { download: file.file_name });
                  return data?.signedUrl ?? null;
                }} openUrl={null} label={t("dlb.download")} openLabel={t("dlb.open")} />
              )}
              {canEdit && (
                <Button size="sm" variant="ghost" onClick={() => void remove(file)} aria-label={t("common.cancel")}>
                  {t("lessons.files.delete")}
                </Button>
              )}
            </span>
          </li>
        ))}
        {files !== null && files.length === 0 && (
          <li className="rounded-lg border border-dashed border-cova-line p-4 text-sm text-cova-mute">{t("lessons.files.empty")}</li>
        )}
      </ul>
      {canEdit && (
        <>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Button type="button" variant="secondary" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? t("lessons.files.uploading") : t("lessons.files.upload")}
          </Button>
        </>
      )}
    </div>
  );
}

/** Small open-in-new-tab trigger with a fresh signed URL per click. */
export function SignedFileButton({ bucket, path, fileName, label }: { bucket: string; path: string; fileName: string; label: string }) {
  const t = useT();
  return (
    <DownloadButton
      getUrl={async () => {
        const { data } = await getSupabase().storage.from(bucket).createSignedUrl(path, 600, { download: fileName });
        return data?.signedUrl ?? null;
      }}
      openUrl={null}
      label={label}
      openLabel={t("dlb.open")}
    />
  );
}
