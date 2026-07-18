export type TaskStatus = 'running' | 'success' | 'failed' | 'paused' | 'scheduled';
export type TaskSource = 'local' | 'github' | 'cloudflare' | 'other';

export interface ScheduledTask {
  id: string;
  name: string;
  source: TaskSource;
  environment: string;
  status: TaskStatus;
  schedule: string;
  lastRun: string | null;
  nextRun: string | null;
  durationSeconds: number | null;
  successRate: number;
  command?: string;
  host?: string;
  detail?: string;
}

export interface AgentStatus {
  id: string;
  name: string;
  kind: string;
  status: 'online' | 'offline' | 'not-configured';
  lastSeen: string | null;
  taskCount: number;
}

export interface TaskSnapshot {
  generatedAt: string;
  tasks: ScheduledTask[];
  agents: AgentStatus[];
  redacted: boolean;
}
