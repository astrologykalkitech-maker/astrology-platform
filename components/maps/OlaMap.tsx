"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  MapPin,
  ExternalLink,
  Navigation,
  Loader2,
  Compass,
  AlertTriangle,
} from "lucide-react";

export interface OlaMapProps {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  landmark?: string | null;
  venueName?: string | null;
  interactive?: boolean;
  zoom?: number;
  heightClass?: string;
  className?: string;
  showNavigationButton?: boolean;
}

declare global {
  interface Window {
    OlaMaps?: any;
    OlaMapsSDK?: any;
  }
}

/**
 * Validates whether coordinates are geographically legitimate.
 * Rejects NaN, null, undefined, out-of-range, and zero-point coordinates.
 */
function isValidGeoCoordinate(lat: unknown, lng: unknown): boolean {
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return false;
  }
  const latNum = typeof lat === "number" ? lat : Number(lat);
  const lngNum = typeof lng === "number" ? lng : Number(lng);

  if (Number.isNaN(latNum) || Number.isNaN(lngNum)) return false;
  if (latNum === 0 && lngNum === 0) return false;
  if (latNum < -90 || latNum > 90) return false;
  if (lngNum < -180 || lngNum > 180) return false;

  return true;
}

export function OlaMap({
  latitude,
  longitude,
  address,
  landmark,
  venueName,
  interactive = true,
  zoom = 15,
  heightClass = "h-56 sm:h-64",
  className = "",
  showNavigationButton = true,
}: OlaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerInstanceRef = useRef<any>(null);
  const containerIdRef = useRef<string>(
    `olamap-instance-${Math.random().toString(36).slice(2, 9)}`
  );

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const hasValidCoordinates = isValidGeoCoordinate(latitude, longitude);
  const lat = hasValidCoordinates ? Number(latitude) : null;
  const lng = hasValidCoordinates ? Number(longitude) : null;

  // Cleanup map instance properly to prevent memory leaks and WebGL context limits
  const destroyMap = useCallback(() => {
    if (markerInstanceRef.current) {
      try {
        if (typeof markerInstanceRef.current.remove === "function") {
          markerInstanceRef.current.remove();
        }
      } catch {}
      markerInstanceRef.current = null;
    }

    if (mapInstanceRef.current) {
      try {
        if (typeof mapInstanceRef.current.remove === "function") {
          mapInstanceRef.current.remove();
        }
      } catch {}
      mapInstanceRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!hasValidCoordinates || lat === null || lng === null) {
      setIsLoading(false);
      destroyMap();
      return;
    }

    let isMounted = true;
    const apiKey =
      process.env.NEXT_PUBLIC_OLA_MAPS_API_KEY ||
      process.env.OLA_MAPS_API_KEY ||
      "";

    const initializeOlaMapSDK = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);

        // 1. Inject MapLibre CSS if not already attached to document
        if (!document.getElementById("maplibre-gl-css")) {
          const link = document.createElement("link");
          link.id = "maplibre-gl-css";
          link.rel = "stylesheet";
          link.href = "https://unpkg.com/maplibre-gl/dist/maplibre-gl.css";
          document.head.appendChild(link);
        }

        // 2. Inject Ola Maps Web SDK v2 UMD bundle if not on window
        if (!window.OlaMaps) {
          await new Promise<void>((resolve, reject) => {
            const existingScript = document.getElementById("olamaps-web-sdk");
            if (existingScript) {
              existingScript.addEventListener("load", () => resolve());
              existingScript.addEventListener("error", () =>
                reject(new Error("Failed to load Ola Maps SDK"))
              );
              return;
            }

            const script = document.createElement("script");
            script.id = "olamaps-web-sdk";
            script.src =
              "https://unpkg.com/olamaps-web-sdk@latest/dist/olamaps-web-sdk.umd.js";
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () =>
              reject(new Error("Failed to load Ola Maps SDK script from CDN."));
            document.head.appendChild(script);
          });
        }

        if (!isMounted || !containerRef.current) return;

        const OlaMapsClass = window.OlaMaps;
        if (!OlaMapsClass) {
          throw new Error("Ola Maps Web SDK failed to expose OlaMaps constructor.");
        }

        // Clean up any stale instances before re-initializing
        destroyMap();

        // 3. Initialize Ola Maps client
        const olaMaps = new OlaMapsClass({
          apiKey: apiKey || "sOQ9CJiqMeRo8mBECfuWjaA7hu4L4RNRCQvXglZo",
        });

        // 4. Initialize Map container with GeoJSON vector tile standard
        // NOTE: SDK expects [longitude, latitude] for center
        const map = olaMaps.init({
          style:
            "https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json",
          container: containerRef.current,
          center: [lng, lat],
          zoom,
          interactive,
        });

        mapInstanceRef.current = map;

        // 5. Add custom Vedic Gold venue marker
        if (typeof olaMaps.addMarker === "function") {
          const marker = olaMaps
            .addMarker({
              offset: [0, -10],
              anchor: "bottom",
              color: "#b98a36", // Vedic gold
            })
            .setLngLat([lng, lat])
            .addTo(map);

          markerInstanceRef.current = marker;
        }

        if (isMounted) {
          setIsLoading(false);
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.warn("[OlaMap] Initialization failure, falling back to tile view:", err);
        setLoadError(err?.message || "Failed to initialize Ola Maps.");
        setIsLoading(false);
      }
    };

    void initializeOlaMapSDK();

    return () => {
      isMounted = false;
      destroyMap();
    };
  }, [hasValidCoordinates, lat, lng, zoom, interactive, destroyMap]);

  // Generate universal cross-platform navigation link
  const navigationUrl = hasValidCoordinates && lat !== null && lng !== null
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        address || venueName || "Holy Event Venue"
      )}`;

  return (
    <div
      className={`rounded-2xl border border-gold/25 bg-white overflow-hidden shadow-xs space-y-3 p-4 ${className}`}
    >
      {/* Venue Header Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold/15 text-gold-deep shrink-0">
            <Compass className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <span className="font-semibold text-xs text-midnight block truncate">
              {venueName || "Event Venue Location (Ola Maps)"}
            </span>
            <span className="text-[10px] text-muted block truncate">
              Official Geospatial Navigation
            </span>
          </div>
        </div>

        {showNavigationButton && (
          <a
            href={navigationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gold/15 hover:bg-gold/25 text-gold-deep text-xs font-bold transition shadow-xs shrink-0"
            title="Open turn-by-turn directions"
          >
            <Navigation className="h-3.5 w-3.5" />
            <span>Open Navigation</span>
            <ExternalLink className="h-3 w-3 ml-0.5" />
          </a>
        )}
      </div>

      {/* Map Rendering Container */}
      <div
        className={`w-full ${heightClass} rounded-xl overflow-hidden border border-gold/20 bg-parchment/30 relative`}
      >
        {!hasValidCoordinates ? (
          <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center text-muted">
            <MapPin className="h-8 w-8 text-gold/40 mb-2" />
            <p className="text-xs font-semibold text-midnight">
              Venue Coordinates Pending
            </p>
            <p className="text-[11px] mt-1 max-w-xs text-ink/70">
              Exact GPS coordinates have not been submitted for this booking yet.
              Please refer to the physical address details below.
            </p>
          </div>
        ) : loadError ? (
          /* Graceful Fallback: OpenStreetMap Tile layer embed when WebGL/SDK blocks */
          <div className="h-full w-full relative">
            <iframe
              title="Geospatial Location Map"
              width="100%"
              height="100%"
              frameBorder="0"
              scrolling="no"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng! - 0.01}%2C${lat! - 0.01}%2C${lng! + 0.01}%2C${lat! + 0.01}&layer=mapnik&marker=${lat}%2C${lng}`}
              className="w-full h-full"
            />
          </div>
        ) : (
          <>
            {isLoading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-parchment/70 backdrop-blur-xs">
                <Loader2 className="h-6 w-6 animate-spin text-gold-deep mb-2" />
                <span className="text-xs font-semibold text-midnight">
                  Loading Ola Maps...
                </span>
              </div>
            )}
            <div
              id={containerIdRef.current}
              ref={containerRef}
              className="w-full h-full min-h-[180px]"
            />
          </>
        )}
      </div>

      {/* Structured Address Details */}
      <div className="text-xs space-y-1 pt-1">
        {address ? (
          <p className="text-ink font-medium flex items-start gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-gold-deep shrink-0 mt-0.5" />
            <span>
              <strong className="text-midnight">Venue Address:</strong> {address}
            </span>
          </p>
        ) : (
          <p className="text-muted text-[11px] italic">
            Venue address to be confirmed by seeker.
          </p>
        )}
        {landmark && (
          <p className="text-muted text-[11px] pl-5">
            <strong className="text-ink">Landmark:</strong> {landmark}
          </p>
        )}
        {hasValidCoordinates && lat !== null && lng !== null && (
          <p className="text-[10px] text-muted font-mono pl-5">
            Coordinates: {lat.toFixed(6)}, {lng.toFixed(6)}
          </p>
        )}
      </div>
    </div>
  );
}
export default OlaMap;
