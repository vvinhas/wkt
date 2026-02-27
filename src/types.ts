export interface Project {
  path: string;
  label: string;
  startCommands: string[];
}

export interface Config {
  projects: Record<string, Project>;
}
