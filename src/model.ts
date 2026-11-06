import { z } from 'zod';

export type Page = 'overview' | 'worklist' | 'queries' | 'claims' | 'audit' | 'methodology';
export type EncounterTab = 'review' | 'sources' | 'clinical' | 'charges' | 'comparison' | 'claim' | 'history';
export type CaseKind = 'fusion' | 'diabetes' | 'charge' | 'false-positive' | 'portfolio';

export const noteSchema = z.object({
  id: z.string(), title: z.string(), author: z.string(), text: z.string(),
  timestamp: z.string().optional(), source: z.string(),
  kind: z.enum(['note', 'lab', 'order', 'procedure', 'medication', 'response']),
  synthetic: z.boolean(), highlight: z.string().optional(),
});
export type SourceNote = z.infer<typeof noteSchema>;

const responseSchema = z.enum(['anemia-confirmed', 'hyperglycemia', 'ckd', 'both', 'no-change', 'undetermined']);
export type QueryResponse = z.infer<typeof responseSchema>;
export const statusSchema = z.enum(['review', 'query-open', 'escalated', 'routed', 'approved', 'rejected', 'submitted']);
export type ReviewStatus = z.infer<typeof statusSchema>;
export const claimSchema = z.object({
  diagnoses: z.array(z.string()), procedures: z.array(z.string()),
  drg: z.string(), chargePosted: z.boolean(), revision: z.number().int().positive(),
});
export type ClaimSnapshot = z.infer<typeof claimSchema>;
export const reviewSchema = z.object({
  status: statusSchema, owner: z.string(), claim: claimSchema, notes: z.array(noteSchema),
  query: z.object({
    id: z.string(), text: z.string(), createdAt: z.string(), status: z.enum(['open', 'answered']),
    response: responseSchema.optional(),
  }).optional(),
  receipt: z.string().optional(),
  evidenceVerified: z.boolean(),
  analysisReady: z.boolean().default(true),
  isNew: z.boolean().default(false),
  coderDecision: z.object({ decision: z.literal('reject'), reason: z.string(), author: z.string(), timestamp: z.string() }).optional(),
});
export type ReviewState = z.infer<typeof reviewSchema>;
const auditSchema = z.object({
  id: z.string(), encounterId: z.string(), timestamp: z.string(), actor: z.string(),
  action: z.string(), rationale: z.string(), before: z.string(), after: z.string(),
});
export type AuditEvent = z.infer<typeof auditSchema>;
export const notificationSchema = z.object({
  id: z.string(), encounterId: z.string(), timestamp: z.string(), read: z.boolean(),
  type: z.enum(['analysis', 'query-response', 'coder-decision']),
  title: z.string(), message: z.string(),
});
export type DemoNotification = z.infer<typeof notificationSchema>;
const demoSchema = z.object({
  automaticNotifications: z.boolean(),
  notificationIndex: z.number().int().min(0).max(3),
  notifications: z.array(notificationSchema),
  lastReviewed: z.array(z.object({ encounterId: z.string(), timestamp: z.string() })).max(4),
}).default({ automaticNotifications: true, notificationIndex: 0, notifications: [], lastReviewed: [] });
export const stateSchema = z.object({
  version: z.literal(2),
  reviews: z.record(reviewSchema),
  audit: z.array(auditSchema),
  demo: demoSchema,
});
export type WorkbenchState = z.infer<typeof stateSchema>;

export type WorkflowAction =
  | { type: 'approve'; rationale: string; evidenceReviewed: boolean }
  | { type: 'reject'; rationale: string; evidenceReviewed: boolean }
  | { type: 'escalate'; rationale: string }
  | { type: 'route'; rationale: string; owner: string }
  | { type: 'request-query'; rationale: string; queryText: string }
  | { type: 'answer-query'; answer: QueryResponse }
  | { type: 'reopen'; rationale: string }
  | { type: 'submit'; fail: boolean };

export interface AgentCheck {
  id: string;
  title: string;
  subtitle: string;
  confidence: number;
  status: 'supported' | 'query' | 'blocked' | 'review';
  conclusion: string;
  forEvidence: string[];
  againstEvidence: string[];
  missing: string[];
  sourceIds: string[];
  criteria: string[];
}

export interface LedgerLine {
  id: string; description: string; revenueCode: string; units: number;
  unitPrice: number; status: 'posted' | 'missing'; sourceId: string;
}

export interface CodeDocumentation {
  code: string;
  description: string;
  checkId: string;
  sourceId: string;
  excerpt: string;
  status: 'Linked' | 'Query required' | 'Not supported' | 'Current code' | 'Not selected';
  classification: string;
}
