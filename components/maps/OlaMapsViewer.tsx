"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  MapPin,
  ExternalLink,
  Navigation,
  AlertCircle,
  Loader2,
  Compass,
} from "lucide-react";

interface OlaMapsViewerProps {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  landmark?: string | null;
  interactive?: boolean;
}

declare global {
  interface Window {
    OlaMaps?: any;
    OlaMapsSDK?: any;
  }
}

export function OlaMapsViewer({
  latitude,
  longitude,
  address,
  landmark,
  interactive = true,
}: OlaMapsViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const containerIdRef = useRef<string>(
    `ola-map-${Math.random().toString(36).slice(2, 9)}`
  );

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasValidCoords, setHasValidCoords] = useState<boolean>(false);

  // Validate coordinates safely
  const latNum = typeof latitude === "number" ? latitude : Number(latitude);
  const lngNum = typeof longitude === "number" ? longitude : Number(longitude);

  const isValidLat = !isNaN(latNum) && latNum >= -90 && latNum <= 90 && latNum !== 0;
  const isValidLng = !isNaN(lngNum) && lngNum >= -180 && lngNum <= 180 && lngNum !== 0;
  const validLocation = isValidLat && isValidLng;

  useEffect(() => {
    setHasValidCoords(validLocation);
  }, [validLocation]);

  useEffect(() => {
    if (!validLocation) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const apiKey =
      process.env.NEXT_PUBLIC_OLA_MAPS_API_KEY ||
      process.env.OLA_MAPS_API_KEY ||
      "";

    // Dynamic SDK script loader
    const loadSDKAndInitMap = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);

        // Load MapLibre CSS if not present
        if (!document.getElementById("maplibre-gl-css")) {
          const link = document.createElement("link");
          link.id = "maplibre-gl-css";
          link.rel = "stylesheet";
          link.href = "https://unpkg.com/maplibre-gl/dist/maplibre-gl.css";
          document.head.appendChild(link);
        }

        // Load Ola Maps SDK script if not loaded
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
              reject(new Error("Failed to fetch Ola Maps SDK script from CDN."));
            document.head.appendChild(script);
          });
        }

        if (!isMounted || !containerRef.current) return;

        const OlaMapsClass = window.OlaMaps;
        if (!OlaMapsClass) {
          throw new Error("Ola Maps Web SDK is not available on window.");
        }

        // Initialize Ola Maps client
        const olaMaps = new OlaMapsClass({
          apiKey: apiKey || "sOQ9CJiqMeRo8mBECfuWjaA7hu4L4RNRCQvXglZo",
        });

        // SDK requires [longitude, latitude] for center
        const myMap = olaMaps.init({
          style:
            "https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json",
          container: containerRef.current,
          center: [lngNum, latNum],
          zoom: 15,
        });

        mapInstanceRef.current = myMap;

        // Add Marker at exact coordinates
        if (typeof olaMaps.addMarker === "function") {
          olaMaps
            .addMarker({
              offset: [0, -10],
              anchor: "bottom",
              color: "#b98a36", // Vedic gold accent
            })
            .setLngLat([lngNum, latNum])
            .addTo(myMap);
        }

        setIsLoading(false);
      } catch (err: any) {
        if (!isMounted) return;
        console.warn("[OlaMapsViewer] Failed to initialize interactive map:", err);
        setLoadError(err?.message || "Could not load Ola Maps.");
        setIsLoading(false);
      }
    };

    loadSDKAndInitMap();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        try {
          if (typeof mapInstanceRef.current.remove === "function") {
            mapInstanceRef.current.remove();
          }
        } catch {}
        mapInstanceRef.current = null;
      }
    };
  }, [latNum, lngNum, validLocation]);

  // Directions URL
  const directionsUrl = validLocation
    ? `https://www.google.com/maps/dir/?api=1&destination=${latNum},${lngNum}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        address || "Holy Puja Venue"
      )}`;

  return (
    <div className="rounded-2xl border border-gold/25 bg-white overflow-hidden shadow-xs space-y-3 p-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold/15 text-gold-deep">
            <Compass className="h-4 w-4" />
          </div>
          <div>
            <span className="font-semibold text-xs text-midnight block">
              Event Venue Location (Ola Maps)
            </span>
            <span className="text-[10px] text-muted">
              Official Geospatial Navigation
            </span>
          </div>
        </div>
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gold/15 hover:bg-gold/25 text-gold-deep text-xs font-bold transition shadow-xs"
        >
          <Navigation className="h-3.5 w-3.5" />
          <span>Open Navigation</span>
          <ExternalLink className="h-3 w-3 ml-0.5" />
        </a>
      </div>

      {/* Map Display Container */}
      <div className="w-full h-52 sm:h-64 rounded-xl overflow-hidden border border-gold/20 bg-parchment/30 relative">
        {!validLocation ? (
          <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center text-muted">
            <MapPin className="h-8 w-8 text-gold/40 mb-2" />
            <p className="text-xs font-semibold text-midnight">
              Venue Coordinates Pending
            </p>
            <p className="text-[11px] mt-1 max-w-xs">
              Exact GPS coordinates have not been submitted for this booking yet.
              Please refer to the designated address below.
            </p>
          </div>
        ) : loadError ? (
          /* Graceful Fallback: OpenStreetMap Tile layer or external link */
          <div className="h-full w-full relative">
            <iframe
              title="OpenStreetMap Fallback"
              width="100%"
              height="100%"
              frameBorder="0"
              scrolling="no"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${lngNum - 0.01}%2C${latNum - 0.01}%2C${lngNum + 0.01}%2C${latNum + 0.01}&layer=mapnik&marker=${latNum}%2C${lngNum}`}
              className="w-full h-full"
            />
          </div>
        ) : (
          <>
            {isLoading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-parchment/60 backdrop-blur-xs">
                <Loader2 className="h-6 w-6 animate-spin text-gold-deep mb-2" />
                <span className="text-xs font-medium text-midnight">
                  Loading Ola Maps...
                </span>
              </div>
            )}
            <div
              id={containerIdRef.current}
              ref={containerRef}
              className="w-full h-full min-h-[200px]"
            />
          </>
        )}
      </div>

      {/* Address & Landmark Information */}
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
        {validLocation && (
          <p className="text-[10px] text-muted font-mono pl-5">
            Coordinates: {latNum.toFixed(6)}, {lngNum.toFixed(6)}
          </p>
        )}
      </div>
    </div>
  );
}
