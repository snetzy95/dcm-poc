import axios from 'axios'

export const mlApi = axios.create({ baseURL: '/api/ml' })

export interface OrthancTagCriteria {
  tag: string
  name: string
  value: string
}

export interface CohortDefinition {
  cohort_definition_id: string
  cohort_definition_name: string
  cohort_description: string | null
  filters: Record<string, unknown>
  orthanc_tags: OrthancTagCriteria[]
  created_at: string
  updated_at: string
}

export interface CohortMember {
  cohort_definition_id: string
  subject_id: string
  orthanc_study_id: string
  cohort_start_date: string | null
  added_at: string
}

export interface ResolveResult {
  cohort_definition_id: string
  matched_count: number
  study_uids: string[]
}

export interface MLJob {
  id: string
  cohort_definition_id: string | null
  name: string
  algorithm: string
  params: Record<string, unknown>
  status: 'PENDING' | 'RUNNING' | 'AGGREGATING' | 'DONE' | 'FAILED'
  result_summary: Record<string, unknown> | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}

export const fetchCohortDefinitions = () =>
  mlApi.get<CohortDefinition[]>('/cohort-definitions').then(r => r.data)

export const createCohortDefinition = (body: Omit<CohortDefinition, 'cohort_definition_id' | 'created_at' | 'updated_at'>) =>
  mlApi.post<CohortDefinition>('/cohort-definitions', body).then(r => r.data)

export const resolveCohort = (id: string) =>
  mlApi.post<ResolveResult>(`/cohort-definitions/${id}/resolve`).then(r => r.data)

export const fetchMembers = (id: string) =>
  mlApi.get<CohortMember[]>(`/cohorts/${id}`).then(r => r.data)

export const fetchJobs = () =>
  mlApi.get<MLJob[]>('/jobs').then(r => r.data)

export const createJob = (body: Pick<MLJob, 'name' | 'algorithm' | 'params'> & { cohort_definition_id?: string }) =>
  mlApi.post<MLJob>('/jobs', body).then(r => r.data)

export const startJob = (id: string) =>
  mlApi.post<MLJob>(`/jobs/${id}/start`).then(r => r.data)
