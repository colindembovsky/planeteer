export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'failed';

export interface Task {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  dependsOn: string[];
  status: TaskStatus;
  agentResult?: string;
}

export interface SkillConfig {
  name: string;
  enabled: boolean;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  tasks: Task[];
  skills?: SkillConfig[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type Screen = 'welcome' | 'home' | 'clarify' | 'breakdown' | 'refine' | 'execute' | 'validate';

export function createTask(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    description: '',
    acceptanceCriteria: [],
    dependsOn: [],
    status: 'pending',
    ...partial,
  };
}

export function createPlan(partial: Partial<Plan> & Pick<Plan, 'id' | 'name'>): Plan {
  const now = new Date().toISOString();
  return {
    description: '',
    createdAt: now,
    updatedAt: now,
    tasks: [],
    ...partial,
  };
}
