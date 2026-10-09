import "server-only";
import { handleHospitalSearch } from "@/lib/server/hospital-candidates";
import { enrichRoadRoutes } from "@/lib/server/hospital-routes";

export async function POST(request: Request) { return handleHospitalSearch(request, undefined, enrichRoadRoutes); }
