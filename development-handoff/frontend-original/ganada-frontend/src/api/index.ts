import { config } from '../config';
import { mockClassDashboard, mockMaterialList, mockStudentHome } from '../mocks/data';
import { request } from './client';
import type { ClassDashboard, MaterialList, StudentHome } from './types';

export * from './types';

const mock = <T,>(data: T) => new Promise<T>((r) => setTimeout(() => r(data), 150));

// TODO(개발자): 경로는 실제 백엔드에 맞게 바꾸고, 응답 이름이 다르면 여기서 화면용 모양으로 변환
export const api = {
  getClassDashboard: (classId: string) =>
    config.USE_MOCK ? mock(mockClassDashboard) : request<ClassDashboard>(`/classes/${classId}/dashboard`),
  getMaterials: (classId: string) =>
    config.USE_MOCK ? mock(mockMaterialList) : request<MaterialList>(`/classes/${classId}/materials`),
  getStudentHome: (classId: string) =>
    config.USE_MOCK ? mock(mockStudentHome) : request<StudentHome>(`/student/classes/${classId}/home`),
};
