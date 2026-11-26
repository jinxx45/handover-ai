// Mirrors backend com.handover.web.dto.CaseViews

export type CaseStatus = 'MAPPING' | 'INTERVIEWING' | 'REVIEW' | 'PUBLISHED' | 'FAILED';
export type Coverage = 'NONE' | 'DOCUMENTED' | 'INTERVIEWED';

export interface CaseSummary {
  id: string;
  personName: string;
  role: string | null;
  status: CaseStatus;
  lastDay: string | null;
  daysLeft: number | null;
  itemCount: number;
  coveragePct: number;
  atRisk: number;
  toReassign: number;
  createdAt: string;
}

export interface Person {
  personId: string;
  name: string;
  email: string | null;
  role: string | null;
  managerName: string | null;
  lastDay: string | null;
  daysLeft: number | null;
  exitType: string | null;
}

export interface Stats {
  total: number;
  documented: number;
  interviewed: number;
  uncovered: number;
  atRisk: number;
  toReassign: number;
  coveragePct: number;
}

export interface Item {
  id: string;
  kind: string;
  title: string;
  source: string;
  url: string | null;
  activity: number;
  hasDocs: boolean;
  lastActivityDays: number | null;
  ownershipShare: number | null;
  needsReassignment: boolean;
  riskScore: number | null;
  riskReason: string | null;
  needsInterview: boolean;
  coverage: Coverage;
  successor: string | null;
  origin: 'auto' | 'manual';
  addedBy: string | null;
}

export interface Connector {
  name: string;
  enabled: boolean;
}

export interface ManualItem {
  title: string;
  kind: string;
  notes: string;
  needsReassignment: boolean;
  addedBy: string;
}

export interface Question {
  itemId: string;
  itemTitle: string;
  question: string;
  isFollowup: boolean;
  remaining: number;
}

export interface Turn {
  label: string;
  itemId: string;
  question: string;
  answer: string;
  createdAt: string;
}

export interface EvidenceView {
  label: string;
  itemId: string;
  source: string;
  url: string | null;
  text: string;
}

export interface PackSection {
  key: string;
  heading: string;
  body: string;
  citations: string[];
}

export interface Pack {
  title: string;
  summary: string;
  sections: PackSection[];
}

export interface Skill {
  name: string;
  category: 'Technical' | 'Domain' | 'Responsibility' | 'People';
  priority: 'must' | 'nice';
  why: string;
  citations: string[];
}

export interface BackfillProfile {
  title: string;
  summary: string;
  skills: Skill[];
}

export interface AttachmentView {
  id: number;
  itemId: string | null;
  turnLabel: string | null;
  kind: 'link' | 'video' | 'audio';
  url: string;
  title: string;
  addedBy: string | null;
  createdAt: string;
}

export interface KitTask {
  title: string;
  detail: string;
  type: 'read' | 'watch' | 'meet' | 'shadow' | 'do' | 'learn';
  itemId: string | null;
  link: string | null;
  citations: string[];
}

export interface OnboardingKit {
  title: string;
  intro: string;
  phases: { name: string; goal: string; tasks: KitTask[] }[];
  people: { name: string; why: string; citations: string[] }[];
}

export interface QuestionView {
  id: number;
  askedBy: string;
  question: string;
  answer: string;
  citations: string[];
  covered: boolean;
  createdAt: string;
}

export interface CaseDetail {
  id: string;
  person: Person;
  status: CaseStatus;
  errorMessage: string | null;
  eventSource: string | null;
  stats: Stats;
  items: Item[];
  currentQuestion: Question | null;
  turns: Turn[];
  pack: Pack | null;
  backfill: BackfillProfile | null;
  onboarding: OnboardingKit | null;
  attachments: AttachmentView[];
  approvedBy: string | null;
  approvedAt: string | null;
  questions: QuestionView[];
  evidence: EvidenceView[];
  createdAt: string;
}

export interface DemoPerson {
  personId: string;
  name: string;
  email: string;
  role: string;
  managerName: string;
  noticeDays: number;
  exitType: string;
}
