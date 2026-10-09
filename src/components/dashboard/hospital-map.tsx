"use client";

import { memo, useEffect, useRef, useState } from "react";
import L from "leaflet";
import { LocateFixed, Minus, Plus, RefreshCw, WifiOff } from "lucide-react";
import { CALL_STATUS, type Hospital } from "@/lib/dashboard/types";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface HospitalMapProps {
  hospitals: Hospital[];
  ambulancePosition: [number, number];
  unit: string;
  selectedHospitalId: string | null;
  onSelectHospital: (id: string) => void;
}

interface HospitalMarker {
  marker: L.Marker;
  fingerprint: string;
}

const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';
const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
// Provider attribution is additive so the underlying OSM data credit stays visible.
const TILE_ATTRIBUTION = [process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION, OSM_ATTRIBUTION].filter(Boolean).join(" · ");

const STATUS_GLYPHS: Record<Hospital["status"], string> = {
  calling: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.79a2 2 0 0 1-.45 2.11L8.09 9.89a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.89.34 1.83.58 2.79.7A2 2 0 0 1 22 16.92Z"/>',
  available: '<path d="m5 12 4 4L19 6"/>',
  unavailable: '<path d="m6 6 12 12M18 6 6 18"/>',
  error: '<path d="M10.3 3.9 1.8 18.6A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.4L13.7 3.9a2 2 0 0 0-3.4 0ZM12 9v4m0 4h.01"/>',
};
// Lucide Ambulance, rendered as SVG for the Leaflet marker.
const ambulanceGlyph = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 10H6M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M19 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-1.923-.641a1 1 0 0 1-.578-.502l-1.539-3.076A1 1 0 0 0 16.382 8H14M8 8v4M9 18h6"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>';

function hospitalIcon(hospital: Hospital) {
  const wrapper = document.createElement("div");
  wrapper.className = `olp-hospital-marker olp-hospital-marker--${hospital.status}`;
  wrapper.style.setProperty("--marker-color", CALL_STATUS[hospital.status].color);
  const leader = document.createElement("span");
  leader.className = "olp-hospital-leader";
  const pin = document.createElement("span");
  pin.className = "olp-hospital-pin";
  pin.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${STATUS_GLYPHS[hospital.status]}</svg>`;
  const label = document.createElement("span");
  label.className = "olp-hospital-label";
  const name = document.createElement("strong");
  name.className = "olp-hospital-name";
  name.textContent = hospital.name;
  const meta = document.createElement("span");
  meta.className = "olp-hospital-meta";
  const status = document.createElement("span");
  status.className = "olp-hospital-status";
  status.textContent = CALL_STATUS[hospital.status].shortLabel;
  meta.append(status);
  if (hospital.status !== "unavailable") {
    const details = document.createElement("span");
    details.className = "olp-hospital-details";
    const eta = document.createElement("b");
    eta.textContent = `약 ${hospital.eta}분`;
    const separator = document.createElement("span");
    separator.className = "olp-hospital-separator";
    separator.textContent = "·";
    const distance = document.createElement("span");
    distance.textContent = `${hospital.distance.toFixed(1)} km`;
    details.append(eta, separator, distance);
    meta.append(details);
  }
  label.append(name, meta);
  wrapper.append(leader, pin, label);
  return L.divIcon({ html: wrapper, className: "olp-leaflet-marker", iconSize: [34, 34], iconAnchor: [17, 17] });
}

function ambulanceIcon(unit: string) {
  const wrapper = document.createElement("div");
  wrapper.className = "olp-ambulance-marker";
  const icon = document.createElement("span");
  icon.className = "olp-ambulance-pin";
  icon.innerHTML = ambulanceGlyph;
  const label = document.createElement("span");
  label.className = "olp-ambulance-label";
  const name = document.createElement("strong");
  name.textContent = unit;
  label.append(name);
  wrapper.append(icon, label);
  return L.divIcon({ html: wrapper, className: "olp-leaflet-ambulance", iconSize: [46, 46], iconAnchor: [23, 23] });
}

function mapInsets(map: L.Map) {
  const size = map.getSize();
  const container = map.getContainer();
  const workspace = container.closest(".workspace");
  const clippedLeft = Math.max(0, (workspace?.getBoundingClientRect().left ?? container.getBoundingClientRect().left) - container.getBoundingClientRect().left);
  const configuredWidth = Number.parseFloat(getComputedStyle(container).getPropertyValue("--detail-width"));
  const detailWidth = Number.isFinite(configuredWidth) ? configuredWidth : 400;
  return { left: clippedLeft + Math.min(75, (size.x - clippedLeft) * 0.075), right: detailWidth + 40, top: Math.min(170, size.y * 0.27), bottom: Math.min(100, size.y * 0.16), detailWidth, clippedLeft };
}

function fitHospitalBounds(map: L.Map, markers: Map<string, HospitalMarker>, ambulance: L.Marker | null) {
  const points = Array.from(markers.values()).map(({ marker }) => marker.getLatLng());
  if (ambulance) points.push(ambulance.getLatLng());
  if (!points.length) return;
  const insets = mapInsets(map);
  map.fitBounds(L.latLngBounds(points), {
    paddingTopLeft: [insets.left, insets.top],
    paddingBottomRight: [insets.right, insets.bottom],
    maxZoom: 14,
    animate: false,
  });
}

const HospitalMap = memo(function HospitalMap({ hospitals, ambulancePosition, unit, selectedHospitalId, onSelectHospital }: HospitalMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tilesRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef(new Map<string, HospitalMarker>());
  const ambulanceRef = useRef<L.Marker | null>(null);
  const selectRef = useRef(onSelectHospital);
  const extentRef = useRef("");
  const dataFingerprintRef = useRef("");
  const [tileError, setTileError] = useState(false);

  useEffect(() => { selectRef.current = onSelectHospital; }, [onSelectHospital]);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: true, center: [37.4979, 127.0276], zoom: 13, minZoom: 9, maxZoom: 18, zoomSnap: 0.5 });
    mapRef.current = map;
    map.attributionControl.setPrefix(false);
    const tiles = L.tileLayer(TILE_URL, {
      attribution: TILE_ATTRIBUTION,
      maxZoom: 19,
    });
    tilesRef.current = tiles;
    let failures = 0;
    let loaded = 0;
    const onLoading = () => { failures = 0; loaded = 0; };
    const onTileError = () => { failures += 1; if (failures >= 3 && loaded === 0) setTileError(true); };
    const onTileLoad = () => { loaded += 1; };
    // A few successful tiles must not hide failures elsewhere in the viewport.
    const onTilesComplete = () => { setTileError(failures > 0); };
    tiles.on("loading", onLoading);
    tiles.on("tileerror", onTileError);
    tiles.on("tileload", onTileLoad);
    tiles.on("load", onTilesComplete);
    tiles.addTo(map);
    let frame = 0;
    const container = containerRef.current;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const size = map.getSize();
        // Sidebar motion only clips the fixed canvas. A real viewport resize
        // updates Leaflet's size while retaining the current center and zoom.
        if (size.x !== container.clientWidth || size.y !== container.clientHeight) {
          map.invalidateSize({ pan: true, animate: false, debounceMoveend: true });
        }
      });
    });
    observer.observe(container);
    const markers = markersRef.current;
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      tiles.off("loading", onLoading);
      tiles.off("tileerror", onTileError);
      tiles.off("tileload", onTileLoad);
      tiles.off("load", onTilesComplete);
      map.remove();
      markers.clear();
      ambulanceRef.current = null;
      mapRef.current = null;
      tilesRef.current = null;
      extentRef.current = "";
      dataFingerprintRef.current = "";
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Call timers and streamed messages update frequently but do not change the map.
    const dataFingerprint = JSON.stringify([unit, ambulancePosition, selectedHospitalId, hospitals.map(({ id, name, shortName, distance, eta, status, position }) => [id, name, shortName, distance, eta, status, position])]);
    if (dataFingerprint === dataFingerprintRef.current) return;
    dataFingerprintRef.current = dataFingerprint;
    const activeIds = new Set(hospitals.map((hospital) => hospital.id));
    for (const [id, entry] of markersRef.current) {
      if (!activeIds.has(id)) { entry.marker.remove(); markersRef.current.delete(id); }
    }
    for (const hospital of hospitals) {
      const fingerprint = JSON.stringify([hospital.name, hospital.shortName, hospital.distance, hospital.eta, hospital.status, hospital.position]);
      let entry = markersRef.current.get(hospital.id);
      if (!entry) {
        const marker = L.marker(hospital.position, { icon: hospitalIcon(hospital), keyboard: true, title: hospital.name, riseOnHover: true });
        marker.on("click", () => selectRef.current(hospital.id));
        marker.addTo(map);
        entry = { marker, fingerprint };
        markersRef.current.set(hospital.id, entry);
        marker.getElement()?.addEventListener("keydown", (event) => {
          if (event.key === " ") { event.preventDefault(); selectRef.current(hospital.id); }
        });
      } else if (entry.fingerprint !== fingerprint) {
        entry.marker.setLatLng(hospital.position).setIcon(hospitalIcon(hospital));
        entry.fingerprint = fingerprint;
      }
      const element = entry.marker.getElement();
      element?.setAttribute("role", "button");
      const travelDetails = hospital.status === "unavailable" ? "" : `, 예상 ${hospital.eta}분, ${hospital.distance}킬로미터`;
      element?.setAttribute("aria-label", `${hospital.name}, ${CALL_STATUS[hospital.status].label}${travelDetails}. 통화 내용 보기`);
      element?.setAttribute("aria-pressed", String(hospital.id === selectedHospitalId));
      element?.classList.toggle("olp-marker-selected", hospital.id === selectedHospitalId);
      entry.marker.setZIndexOffset(hospital.id === selectedHospitalId ? 900 : 0);
    }
    if (!ambulanceRef.current) {
      ambulanceRef.current = L.marker(ambulancePosition, { icon: ambulanceIcon(unit), keyboard: false, interactive: false, zIndexOffset: 1000 }).addTo(map);
    } else {
      ambulanceRef.current.setLatLng(ambulancePosition);
      const label = ambulanceRef.current.getElement()?.querySelector(".olp-ambulance-label strong");
      if (label) label.textContent = unit;
    }
    const extent = JSON.stringify([ambulancePosition, hospitals.map(({ id, position }) => [id, position])]);
    if (extent !== extentRef.current) {
      extentRef.current = extent;
      fitHospitalBounds(map, markersRef.current, ambulanceRef.current);
    }
  }, [hospitals, ambulancePosition, unit, selectedHospitalId]);

  return (
    <div className="olp-map-shell">
      <div ref={containerRef} className="olp-map-canvas" aria-label="구급차와 병원 위치 지도. 화살표 키로 이동하고 더하기와 빼기 키로 확대 및 축소할 수 있습니다." />
      <div className="olp-map-controls" aria-label="지도 조작">
        <Button variant="outline" size="icon" className="olp-map-locate" type="button" title="구급차 위치로 이동" aria-label="구급차 위치로 이동" onClick={() => {
          const map = mapRef.current;
          if (!map) return;
          const insets = mapInsets(map);
          const zoom = map.getZoom();
          const center = map.project(ambulancePosition, zoom).add([(insets.right - insets.left) / 2, (insets.bottom - insets.top) / 2]);
          map.flyTo(map.unproject(center, zoom), zoom, { duration: 0.65 });
        }}><LocateFixed size={19} /></Button>
        <div className="olp-map-zoom">
          <Button variant="ghost" size="icon" type="button" title="지도 확대" aria-label="지도 확대" onClick={() => mapRef.current?.zoomIn()}><Plus size={20} /></Button>
          <Button variant="ghost" size="icon" type="button" title="지도 축소" aria-label="지도 축소" onClick={() => mapRef.current?.zoomOut()}><Minus size={20} /></Button>
        </div>
      </div>
      {tileError && <Alert className="olp-map-error"><WifiOff size={19} /><div><AlertTitle>지도를 불러오지 못했습니다</AlertTitle><AlertDescription>네트워크 연결을 확인한 후 다시 시도해 주세요.</AlertDescription></div><Button variant="outline" size="sm" type="button" onClick={() => { setTileError(false); tilesRef.current?.redraw(); }}><RefreshCw size={14} />다시 시도</Button></Alert>}
    </div>
  );
});

export default HospitalMap;
