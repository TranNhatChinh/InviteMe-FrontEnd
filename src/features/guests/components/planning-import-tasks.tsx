"use client";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import { listImportTasks, resolveImportTask } from "../api/planning.api";
import { Button } from "@/shared/ui/button";

export function PlanningImportTasks({ weddingId }: { weddingId: string }) {
  const { api } = useRuntime();
  const cache = useQueryClient();
  const key = ["guest-import-tasks", weddingId];
  const tasks = useQuery({ queryKey: key, queryFn: () => listImportTasks(api, weddingId) });
  const resolve = useMutation({
    mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) =>
      resolveImportTask(api, weddingId, id, resolved),
    onSuccess: () => cache.invalidateQueries({ queryKey: key }),
  });
  if (tasks.isPending)
    return (
      <p role="status" className="text-sm">
        Đang tải việc sau import…
      </p>
    );
  if (tasks.isError)
    return (
      <div role="alert">
        Không tải được việc sau import.{" "}
        <Button variant="outline" onClick={() => void tasks.refetch()}>
          Thử lại
        </Button>
      </div>
    );
  if (!tasks.data?.length) return null;
  return (
    <details className="rounded-xl border p-4" open>
      <summary className="cursor-pointer font-semibold">
        Việc cần xử lý sau Import ({tasks.data.filter((x) => !x.resolvedAt).length})
      </summary>
      {resolve.isError && <p role="alert">Không lưu được trạng thái xử lý. Hãy thử lại.</p>}
      <ul className="mt-3 space-y-3">
        {tasks.data.map((task) => (
          <li key={task.id} className="rounded border p-3 text-sm">
            <strong>{task.recipientName}</strong> · {task.resolvedAt ? "Đã xử lý" : "Chưa xử lý"}
            <p className="my-1">{task.reason}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Link className="underline" href={task.path}>
                Mở{" "}
                {task.kind === "SEATING" ? "xếp bàn" : task.kind === "RSVP" ? "RSVP" : "gửi thiệp"}
              </Link>
              <Button
                size="sm"
                variant="outline"
                disabled={resolve.isPending}
                onClick={() => resolve.mutate({ id: task.id, resolved: !task.resolvedAt })}
              >
                {task.resolvedAt ? "Mở lại việc" : "Đánh dấu đã xử lý"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
