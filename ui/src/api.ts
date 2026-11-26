import type { CaseDetail, CaseSummary, Connector, DemoPerson, ManualItem, QuestionView } from './types';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      message = body.detail ?? body.message ?? message;
    } catch {
      /* not JSON */
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  cases: () => request<CaseSummary[]>('/v1/cases'),
  case: (id: string) => request<CaseDetail>(`/v1/cases/${id}`),
  people: () => request<DemoPerson[]>('/v1/demo/people'),
  depart: (personId: string) => post<CaseDetail>(`/v1/demo/people/${personId}/depart`),
  answer: (id: string, answer: string) => post<CaseDetail>(`/v1/cases/${id}/interview/answer`, { answer }),
  finish: (id: string) => post<CaseDetail>(`/v1/cases/${id}/interview/finish`),
  retry: (id: string) => post<CaseDetail>(`/v1/cases/${id}/retry`),
  approve: (id: string, approver: string) => post<CaseDetail>(`/v1/cases/${id}/pack/approve`, { approver }),
  ask: (id: string, question: string, askedBy = 'successor') =>
    post<QuestionView>(`/v1/cases/${id}/ask`, { question, askedBy }),
  onboarding: (id: string) => post<CaseDetail>(`/v1/cases/${id}/onboarding`),
  addLink: (id: string, body: { url: string; title: string; itemId?: string | null; turnLabel?: string | null; addedBy?: string }) =>
    post<CaseDetail>(`/v1/cases/${id}/attachments`, body),
  upload: async (id: string, file: Blob, fields: { title: string; itemId?: string | null; turnLabel?: string | null; addedBy?: string }, fileName = 'recording.webm') => {
    const form = new FormData();
    form.append('file', file, fileName);
    Object.entries(fields).forEach(([k, v]) => v && form.append(k, v));
    const res = await fetch(`/v1/cases/${id}/attachments/upload`, { method: 'POST', body: form });
    if (!res.ok) {
      let message = `${res.status} ${res.statusText}`;
      try {
        message = (await res.json()).detail ?? message;
      } catch {
        /* not JSON */
      }
      throw new ApiError(message, res.status);
    }
    return (await res.json()) as CaseDetail;
  },
  removeAttachment: (id: string, attachmentId: number) =>
    request<CaseDetail>(`/v1/cases/${id}/attachments/${attachmentId}`, { method: 'DELETE' }),
  backfill: (id: string) => post<CaseDetail>(`/v1/cases/${id}/backfill`),
  connectors: () => request<Connector[]>('/v1/connectors'),
  addItem: (id: string, item: ManualItem) => post<CaseDetail>(`/v1/cases/${id}/items`, item),
  dismissItem: (id: string, itemId: string) => request<CaseDetail>(`/v1/cases/${id}/items/${itemId}`, { method: 'DELETE' }),
  assign: (id: string, itemId: string, successor: string) =>
    request<CaseDetail>(`/v1/cases/${id}/items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ successor }) }),
};
