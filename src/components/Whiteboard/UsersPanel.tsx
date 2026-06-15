"use client";

import type { CursorData } from "@/types/shared";

interface UsersPanelProps {
  cursors: Map<string, CursorData>;
  currentUserId: string;
}

export function UsersPanel({ cursors, currentUserId }: UsersPanelProps) {
  const users = Array.from(cursors.values());

  return (
    <div className="bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 w-64 flex flex-col">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          Active Users ({users.length})
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {users.map((user) => {
          const isMe = user.userId === currentUserId;
          return (
            <div
              key={user.userId}
              className="flex items-center gap-3 px-2 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50"
            >
              {/* Avatar */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                style={{ backgroundColor: user.color }}
              >
                {user.userName.charAt(0).toUpperCase()}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                    {user.userName}
                  </span>
                  {isMe && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-medium">
                      you
                    </span>
                  )}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {user.position
                    ? `(${Math.round(user.position.x)}, ${Math.round(user.position.y)})`
                    : "Inactive"}
                </div>
              </div>
              {/* Status dot */}
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${
                  user.position
                    ? "bg-emerald-500"
                    : "bg-zinc-300 dark:bg-zinc-600"
                }`}
              />
            </div>
          );
        })}
        {users.length === 0 && (
          <div className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-8">
            No other users connected
          </div>
        )}
      </div>
    </div>
  );
}
