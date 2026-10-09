import { z } from "zod";

// NMC 응급의료정보조회서비스 활용가이드 V13. The older 11-condition
// MKioskTy codes in legacy examples must not be used with this 27-condition feed.
export const PROCEDURES = {
  mkioskty1: "심근경색 재관류중재술",
  mkioskty2: "뇌경색 재관류중재술",
  mkioskty3: "뇌출혈수술 · 거미막하출혈",
  mkioskty4: "뇌출혈수술 · 거미막하출혈 외",
  mkioskty5: "대동맥응급 · 흉부",
  mkioskty6: "대동맥응급 · 복부",
  mkioskty7: "담낭질환",
  mkioskty8: "담도포함질환",
  mkioskty9: "복부응급수술 · 비외상",
  mkioskty10: "장중첩/폐색 · 영유아",
  mkioskty11: "응급내시경 · 성인 위장관",
  mkioskty12: "응급내시경 · 영유아 위장관",
  mkioskty13: "응급내시경 · 성인 기관지",
  mkioskty14: "응급내시경 · 영유아 기관지",
  mkioskty15: "저체중출생아 집중치료",
  mkioskty16: "분만",
  mkioskty17: "산과수술",
  mkioskty18: "부인과수술",
  mkioskty19: "중증화상 전문치료",
  mkioskty20: "사지접합 · 수족지",
  mkioskty21: "사지접합 · 수족지 외",
  mkioskty22: "응급투석 · HD",
  mkioskty23: "응급투석 · CRRT",
  mkioskty24: "정신과적응급 폐쇄병동입원",
  mkioskty25: "안과 응급수술",
  mkioskty26: "영상의학 혈관중재 · 성인",
  mkioskty27: "영상의학 혈관중재 · 영유아",
} as const;

export const DEPARTMENTS = {
  D001: "내과", D002: "소아청소년과", D003: "신경과", D004: "정신건강의학과",
  D006: "외과", D007: "흉부외과", D008: "정형외과", D009: "신경외과",
  D010: "성형외과", D011: "산부인과", D012: "안과", D013: "이비인후과",
  D014: "비뇨기과", D017: "마취통증의학과", D018: "영상의학과", D024: "응급의학과",
} as const;

export const EQUIPMENT = {
  hvctayn: "CT", hvmriayn: "MRI", hvangioayn: "혈관촬영기",
  hvventiayn: "인공호흡기", hvventisoayn: "조산아 인공호흡기",
  hvincuayn: "인큐베이터", hvcrrtayn: "CRRT", hvecmoayn: "ECMO",
} as const;

export const BEDS = {
  hvec: "일반 응급병상", hv28: "소아 응급병상", hvoc: "수술실",
  hvicc: "일반 중환자실", hv2: "내과 중환자실", hv3: "외과 중환자실",
  hv6: "신경외과 중환자실", hv9: "외상 중환자실", hvncc: "신생아 중환자실",
  hv32: "소아 중환자실", hv29: "응급실 음압격리", hv30: "응급실 일반격리",
} as const;

const keys = <T extends Record<string, string>>(values: T) => Object.keys(values) as [keyof T & string, ...(keyof T & string)[]];
export const hospitalSearchSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusKm: z.number().min(1).max(100).default(20),
  limit: z.number().int().min(1).max(30).default(10),
  departments: z.array(z.enum(keys(DEPARTMENTS))).max(5).default([]),
  procedures: z.array(z.enum(keys(PROCEDURES))).max(10).default([]),
  equipment: z.array(z.enum(keys(EQUIPMENT))).max(8).default([]),
  beds: z.array(z.enum(keys(BEDS))).max(5).default([]),
  includeUnknown: z.boolean().default(true),
}).strict();

export type HospitalSearch = z.infer<typeof hospitalSearchSchema>;
export type ConditionCheck = {
  code: string;
  label: string;
  status: "reported_available" | "reported_unavailable" | "unknown";
  detail: string | null;
};
export type HospitalCandidate = {
  id: string;
  name: string;
  address: string;
  emergencyPhone: string | null;
  phone: string | null;
  classification: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
  roadRoute?: { provider: "OSRM"; distanceKm: number; durationSeconds: number; calculatedAt: string };
  acceptance: "unconfirmed";
  match: "reported_match" | "needs_confirmation";
  checks: ConditionCheck[];
  beds: Record<keyof typeof BEDS, number | null>;
  bedUpdatedAt: string | null;
  bedDataFresh: boolean;
  procedureNotes: string[];
};
export type HospitalSearchResult = {
  source: "국립중앙의료원";
  retrievedAt: string;
  sourceRetrievedAt: { hospitals: string; beds: string | null; procedures: string | null };
  distanceType: "straight_line" | "road" | "mixed";
  routing?: { provider: "OSRM"; status: "complete" | "partial" | "unavailable" };
  totalNearby: number;
  totalMatched: number;
  candidates: HospitalCandidate[];
  warnings: string[];
};
