"use client";

import { TaskItem } from "./TaskItem";

interface Task {
  id: string;
  title: string;
  description: string;
  order: number;
  completed: boolean;
  notes: string;
  metadata: Record<string, unknown> | null;
}

interface TaskListProps {
  planId: string;
  tasks: Task[];
}

export function TaskList({ planId, tasks }: TaskListProps) {
  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <TaskItem key={task.id} planId={planId} task={task} />
      ))}
    </div>
  );
}
