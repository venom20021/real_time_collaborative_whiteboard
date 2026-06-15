"use client";

import { useState } from "react";
import { WhiteboardPage } from "@/components/Whiteboard/WhiteboardPage";
import { trpc } from "@/trpc/client";

type Phase = "landing" | "whiteboard";

const COLORS = [
  "#6366f1", "#ef4444", "#f59e0b", "#10b981", "#3b82f6",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#84cc16",
];

export default function Home() {
  const [phase, setPhase] = useState<Phase>("landing");
  const [roomId, setRoomId] = useState<string>("");
  const [finalUserName, setFinalUserName] = useState<string>("");
  const [finalUserColor, setFinalUserColor] = useState<string>(COLORS[0]);

  // Separate states for Create and Join forms
  const [createName, setCreateName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [error, setError] = useState("");

  const createRoomMutation = trpc.room.create.useMutation();
  const joinRoomMutation = trpc.room.join.useMutation();
  const roomsQuery = trpc.room.list.useQuery(undefined, {
    refetchInterval: 5000,
  });

  const handleCreateRoom = async () => {
    if (!createName.trim()) {
      setError("Enter your name");
      return;
    }
    if (!roomName.trim()) {
      setError("Enter a room name");
      return;
    }

    try {
      setError("");
      const result = await createRoomMutation.mutateAsync({
        name: roomName.trim(),
        userName: createName.trim(),
      });
      setRoomId(result.room.id);
      setFinalUserName(createName.trim());
      setFinalUserColor(
        result.user?.color || COLORS[Math.floor(Math.random() * COLORS.length)]
      );
      setPhase("whiteboard");
    } catch (err) {
      setError("Failed to create room");
    }
  };

  const handleJoinRoom = async () => {
    if (!joinName.trim()) {
      setError("Enter your name");
      return;
    }
    if (!joinRoomId.trim()) {
      setError("Enter a room ID");
      return;
    }

    try {
      setError("");
      const user = await joinRoomMutation.mutateAsync({
        roomId: joinRoomId.trim(),
        userName: joinName.trim(),
        userColor: COLORS[Math.floor(Math.random() * COLORS.length)],
      });
      setRoomId(joinRoomId.trim());
      setFinalUserName(joinName.trim());
      setFinalUserColor(user.color);
      setPhase("whiteboard");
    } catch (err) {
      setError("Room not found. Check the ID and try again.");
    }
  };

  if (phase === "whiteboard") {
    return (
      <WhiteboardPage
        roomId={roomId}
        userName={finalUserName}
        userColor={finalUserColor}
        onLeave={() => {
          setPhase("landing");
          setRoomId("");
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-indigo-950 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-zinc-900 dark:text-zinc-50 mb-3 tracking-tight">
            Collaborative Whiteboard
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Draw together in real-time. No sign-up required.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Create Room */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg border border-zinc-200 dark:border-zinc-800 p-8">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-6">
              Create a Room
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Your Name
                </label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  maxLength={30}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Room Name
                </label>
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="e.g. Team Brainstorm"
                  className="w-full px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  maxLength={50}
                />
              </div>
              <button
                onClick={handleCreateRoom}
                disabled={createRoomMutation.isPending}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {createRoomMutation.isPending ? "Creating..." : "Create Room"}
              </button>
            </div>
          </div>

          {/* Join Room */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg border border-zinc-200 dark:border-zinc-800 p-8">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-6">
              Join a Room
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Your Name
                </label>
                <input
                  type="text"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  maxLength={30}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Room ID
                </label>
                <input
                  type="text"
                  value={joinRoomId}
                  onChange={(e) => setJoinRoomId(e.target.value)}
                  placeholder="Paste room ID"
                  className="w-full px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                onClick={handleJoinRoom}
                disabled={joinRoomMutation.isPending}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {joinRoomMutation.isPending ? "Joining..." : "Join Room"}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-6 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl text-red-700 dark:text-red-300 text-sm text-center">
            {error}
          </div>
        )}

        {roomsQuery.data && roomsQuery.data.length > 0 && (
          <div className="mt-12">
            <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-4">
              Active Rooms
            </h3>
            <div className="grid gap-3">
              {roomsQuery.data.map((room) => (
                <button
                  key={room.id}
                  onClick={() => {
                    setJoinRoomId(room.id);
                    if (!joinName) setJoinName("Anonymous");
                  }}
                  className="flex items-center justify-between p-4 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors text-left"
                >
                  <div>
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">
                      {room.name}
                    </div>
                    <div className="text-sm text-zinc-500 dark:text-zinc-400">
                      {room._count.shapes} shapes · {room._count.participants} users
                    </div>
                  </div>
                  <div className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">
                    {room.id.slice(0, 8)}...
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-12 text-center text-sm text-zinc-400 dark:text-zinc-600">
          Free · Real-time · Open source
        </div>
      </div>
    </div>
  );
}
