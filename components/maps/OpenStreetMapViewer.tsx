"use client";

import React from "react";
import { ExternalLink, MapPin, Navigation } from "lucide-react";
import { isValidGeoCoordinatePair } from "@/lib/location/coordinates";

interface OpenStreetMapViewerProps {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  landmark?: string | null;
}

export function OpenStreetMapViewer({
  latitude,
  longitude,
  address,
  landmark,
}: OpenStreetMapViewerProps) {
  const hasValidCoordinates = isValidGeoCoordinatePair(latitude, longitude);
  const lat = hasValidCoordinates ? Number(latitude) : null;
  const lng = hasValidCoordinates ? Number(longitude) : null;

  const mapUrl = new URL("https://www.openstreetmap.org/export/embed.html");
  if (lat !== null && lng !== null) {
    mapUrl.searchParams.set(
      "bbox",
      [
        Math.max(-180, lng - 0.01),
        Math.max(-90, lat - 0.01),
        Math.min(180, lng + 0.01),
        Math.min(90, lat + 0.01),
      ].join(",")
    );
    mapUrl.searchParams.set("layer", "mapnik");
    mapUrl.searchParams.set("marker", `${lat},${lng}`);
  }

  const navigationUrl = new URL("https://www.openstreetmap.org/directions");
  if (lat !== null && lng !== null) {
    navigationUrl.searchParams.set("engine", "fossgis_osrm_car");
    navigationUrl.searchParams.set("route", `;${lat},${lng}`);
  }

  return (
    <div className="space-y-3 overflow-hidden rounded-2xl border border-gold/25 bg-white p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-gold-deep" />
          <span className="text-xs font-semibold text-midnight">
            Event Venue Location (OpenStreetMap)
          </span>
        </div>
        {hasValidCoordinates && (
          <a
            href={navigationUrl.toString()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-gold-deep hover:underline"
          >
            <Navigation className="h-3 w-3" />
            <span>Open Navigation</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <div className="relative h-48 w-full overflow-hidden rounded-xl border border-gold/20 bg-gray-100 sm:h-64">
        {hasValidCoordinates ? (
          <iframe
            title="OpenStreetMap event venue"
            width="100%"
            height="100%"
            loading="lazy"
            referrerPolicy="no-referrer"
            src={mapUrl.toString()}
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <MapPin className="h-7 w-7 text-gold/60" />
            <p className="text-xs font-semibold text-midnight">
              Map pin not available
            </p>
            <p className="max-w-sm text-[11px] text-muted">
              Select a suggested venue to show its map pin. The address remains available below.
            </p>
          </div>
        )}
      </div>

      <div className="space-y-1 text-xs">
        {address && (
          <p className="font-medium text-ink">
            <span className="text-muted">Venue Address:</span> {address}
          </p>
        )}
        {landmark && (
          <p className="text-[11px] text-muted">
            <span className="font-semibold text-ink">Landmark:</span> {landmark}
          </p>
        )}
        {hasValidCoordinates && lat !== null && lng !== null && (
          <p className="font-mono text-[10px] text-muted">
            Coordinates: {lat.toFixed(5)}, {lng.toFixed(5)}
          </p>
        )}
      </div>
    </div>
  );
}
