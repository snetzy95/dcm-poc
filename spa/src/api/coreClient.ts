import axios from 'axios'

export const coreApi = axios.create({ baseURL: '/api/core' })

export interface Study {
  id: string
  study_uid: string
  orthanc_id: string
  patient_id: string | null
  patient_name: string | null
  patient_sex: string | null
  study_date: string | null
  study_description: string | null
  institution_name: string | null
  num_series: number
  num_instances: number
  ingested_at: string
  deleted_at: string | null
  series: Series[]
}

export interface Series {
  id: string
  series_uid: string
  modality: string | null
  series_description: string | null
  body_part_examined: string | null
  num_instances: number
}

export interface StudyListResponse {
  total: number
  page: number
  page_size: number
  items: Study[]
}

export const fetchStudies = (params?: Record<string, string | number>) =>
  coreApi.get<StudyListResponse>('/studies', { params }).then(r => r.data)

export const fetchStudy = (uid: string) =>
  coreApi.get<Study>(`/studies/${uid}`).then(r => r.data)
